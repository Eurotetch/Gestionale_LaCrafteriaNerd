"""
Telegram Bot client — outbound sending + scheduled evening summary + inbound commands.
"""
import os
import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("crafteria.telegram")

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN") or ""
TG_TIME = os.environ.get("NOTIFICATION_TIME", "20:00")
TG_TZ = os.environ.get("NOTIFICATION_TIMEZONE", "Europe/Rome")
WEBHOOK_SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")
BASE = f"https://api.telegram.org/bot{BOT_TOKEN}" if BOT_TOKEN else None


# ---------------------------------------------------------------------------
# Outbound API
# ---------------------------------------------------------------------------
async def send_message(chat_id: str | int, text: str, parse_mode: str = "HTML") -> dict:
    if not BASE:
        raise RuntimeError("TELEGRAM_BOT_TOKEN non configurato")
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{BASE}/sendMessage", json={
            "chat_id": chat_id, "text": text, "parse_mode": parse_mode,
            "disable_web_page_preview": True,
        })
        data = r.json()
        if not data.get("ok"):
            raise RuntimeError(f"Telegram error: {data}")
        return data["result"]


async def get_me() -> dict:
    if not BASE:
        raise RuntimeError("TELEGRAM_BOT_TOKEN non configurato")
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{BASE}/getMe")
        return r.json()


async def get_updates() -> list[dict]:
    if not BASE:
        raise RuntimeError("TELEGRAM_BOT_TOKEN non configurato")
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{BASE}/getUpdates", params={"limit": 100, "timeout": 0})
        data = r.json()
        if not data.get("ok"):
            return []
        seen = {}
        for u in data.get("result", []):
            msg = u.get("message") or u.get("channel_post") or u.get("my_chat_member") or {}
            chat = msg.get("chat") if isinstance(msg, dict) else None
            if chat and chat.get("id") is not None:
                cid = str(chat["id"])
                seen[cid] = {
                    "chat_id": cid,
                    "type": chat.get("type"),
                    "title": chat.get("title") or chat.get("username") or chat.get("first_name") or "—",
                }
        return list(seen.values())


async def set_webhook(url: str) -> dict:
    if not BASE:
        raise RuntimeError("TELEGRAM_BOT_TOKEN non configurato")
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{BASE}/setWebhook", json={"url": url, "drop_pending_updates": True})
        return r.json()


async def delete_webhook() -> dict:
    if not BASE:
        return {"ok": True}
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{BASE}/deleteWebhook")
        return r.json()


async def get_webhook_info() -> dict:
    if not BASE:
        return {"ok": False}
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{BASE}/getWebhookInfo")
        return r.json()


async def set_my_commands() -> dict:
    if not BASE:
        return {"ok": False}
    cmds = [
        {"command": "scadenze", "description": "Ordini in scadenza e in ritardo"},
        {"command": "incassi",  "description": "Incassi di oggi e del mese"},
        {"command": "magazzino","description": "Materiali sotto soglia"},
        {"command": "riassunto","description": "Riassunto serale completo"},
        {"command": "help",     "description": "Mostra i comandi disponibili"},
    ]
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{BASE}/setMyCommands", json={"commands": cmds})
        return r.json()


# ---------------------------------------------------------------------------
# Summary builders
# ---------------------------------------------------------------------------
def _it_date(iso_or_d: str) -> str:
    try:
        return datetime.fromisoformat(iso_or_d).strftime("%d/%m/%Y")
    except Exception:
        return iso_or_d


async def build_evening_summary(db) -> str:
    """Sera: cosa è stato fatto oggi + cosa attende domani."""
    tz = pytz.timezone(TG_TZ)
    now_local = datetime.now(tz)
    today = now_local.date().isoformat()
    tomorrow = (now_local.date() + timedelta(days=1)).isoformat()
    in_3 = (now_local.date() + timedelta(days=3)).isoformat()

    orders = await db.orders.find({}, {"_id": 0}).to_list(2000)
    sales = await db.sales.find({}, {"_id": 0}).to_list(2000)
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(2000)
    materials = await db.materials.find({}, {"_id": 0}).to_list(2000)
    events = await db.calendar_events.find({}, {"_id": 0}).to_list(500)

    # OGGI
    sales_today = [s for s in sales if (s.get("created_at") or "").startswith(today)]
    revenue_today = sum(s.get("total", 0) for s in sales_today)
    delivered_today = [
        o for o in orders
        if o.get("status") == "consegnato"
        and (o.get("inventory_applied_at") or o.get("updated_at") or "").startswith(today)
    ]

    # DOMANI
    active = [o for o in orders if o.get("status") in ("nuovo", "in_lavorazione")]
    due_tomorrow = [o for o in active if o.get("due_date") == tomorrow]
    due_next_days = [o for o in active if o.get("due_date") and tomorrow < o["due_date"] <= in_3]
    overdue = sorted([o for o in active if o.get("due_date") and o["due_date"] < today], key=lambda x: x["due_date"])
    events_tomorrow = [e for e in events if (e.get("start") or "").startswith(tomorrow)]

    overdue_inv = [i for i in invoices if i.get("status") not in ("pagato", "bozza")
                   and i.get("due_date") and i["due_date"] < today]
    low_stock = [m for m in materials if (m.get("stock") or 0) <= (m.get("min_stock") or 0)]

    lines = []
    lines.append("🌙 <b>Buonasera La Crafteria Nerd!</b>")
    lines.append(f"<i>Riepilogo {now_local.strftime('%A %d/%m/%Y').capitalize()}</i>")
    lines.append("")

    # ── OGGI ──
    lines.append("☀️ <b>OGGI</b>")
    if sales_today or delivered_today:
        if sales_today:
            lines.append(f"  💰 Incassati: <b>€{revenue_today:.2f}</b> ({len(sales_today)} vendite alla cassa)")
        if delivered_today:
            lines.append(f"  ✅ Consegnati: <b>{len(delivered_today)}</b> ordini")
            for o in delivered_today[:5]:
                lines.append(f"    · {o['title']} — {o.get('customer_name','')}")
    else:
        lines.append("  <i>Giornata tranquilla — nessuna vendita o consegna registrata.</i>")
    lines.append("")

    # ── DOMANI ──
    lines.append("🌅 <b>DOMANI</b>")
    if due_tomorrow:
        lines.append(f"  ⏰ Da consegnare ({len(due_tomorrow)}):")
        for o in due_tomorrow[:6]:
            tech = f" [{o.get('technique')}]" if o.get('technique') else ""
            lines.append(f"    · {o['title']} — {o.get('customer_name','')}{tech}")
    if events_tomorrow:
        lines.append(f"  📅 Eventi in agenda ({len(events_tomorrow)}):")
        for e in events_tomorrow[:5]:
            lines.append(f"    · {e['title']}")
    if not due_tomorrow and not events_tomorrow:
        lines.append("  <i>Niente in agenda. Ti sei meritata una colazione lenta ☕</i>")
    lines.append("")

    # ── ATTENZIONI ──
    has_alerts = bool(overdue or overdue_inv or low_stock or due_next_days)
    if has_alerts:
        lines.append("🔔 <b>ATTENZIONI</b>")
        if overdue:
            lines.append(f"  🔴 Ordini in ritardo ({len(overdue)}):")
            for o in overdue[:5]:
                lines.append(f"    · {o['title']} — scad. {_it_date(o['due_date'])}")
        if due_next_days:
            lines.append(f"  📆 In scadenza 2-3 giorni: {len(due_next_days)}")
        if overdue_inv:
            lines.append(f"  🧾 Fatture scadute non pagate: {len(overdue_inv)}")
        if low_stock:
            lines.append(f"  📦 Materiali sotto soglia ({len(low_stock)}):")
            for m in low_stock[:5]:
                lines.append(f"    · {m['name']}: {m.get('stock',0)} {m.get('unit','')} (min {m.get('min_stock',0)})")
        lines.append("")

    lines.append("— 🐉 buona serata!")
    return "\n".join(lines)


async def build_deadlines_message(db) -> str:
    """Risposta a /scadenze."""
    tz = pytz.timezone(TG_TZ)
    today = datetime.now(tz).date().isoformat()
    in_7 = (datetime.now(tz).date() + timedelta(days=7)).isoformat()

    orders = await db.orders.find({}, {"_id": 0}).to_list(2000)
    active = [o for o in orders if o.get("status") in ("nuovo", "in_lavorazione")]
    overdue = sorted([o for o in active if o.get("due_date") and o["due_date"] < today], key=lambda x: x["due_date"])
    upcoming = sorted([o for o in active if o.get("due_date") and today <= o["due_date"] <= in_7], key=lambda x: x["due_date"])

    lines = ["📋 <b>Scadenze ordini</b>", ""]
    if overdue:
        lines.append(f"🔴 <b>In ritardo</b> ({len(overdue)})")
        for o in overdue:
            lines.append(f"  · {o['title']} — {o.get('customer_name','')} <i>(scad. {_it_date(o['due_date'])})</i>")
        lines.append("")
    if upcoming:
        lines.append(f"⏰ <b>Prossimi 7 giorni</b> ({len(upcoming)})")
        for o in upcoming:
            lines.append(f"  · {_it_date(o['due_date'])}: {o['title']} — {o.get('customer_name','')}")
        lines.append("")
    if not overdue and not upcoming:
        lines.append("✨ Nessuna scadenza nei prossimi 7 giorni.")
    return "\n".join(lines)


async def build_revenue_message(db) -> str:
    """Risposta a /incassi."""
    tz = pytz.timezone(TG_TZ)
    now = datetime.now(tz)
    today = now.date().isoformat()
    month_prefix = now.strftime("%Y-%m")
    week_start = (now.date() - timedelta(days=now.weekday())).isoformat()

    sales = await db.sales.find({}, {"_id": 0}).to_list(5000)
    rev_today = sum(s.get("total", 0) for s in sales if (s.get("created_at") or "").startswith(today))
    rev_month = sum(s.get("total", 0) for s in sales if (s.get("created_at") or "").startswith(month_prefix))
    rev_week = sum(s.get("total", 0) for s in sales if (s.get("created_at") or "")[:10] >= week_start)
    count_today = sum(1 for s in sales if (s.get("created_at") or "").startswith(today))
    count_month = sum(1 for s in sales if (s.get("created_at") or "").startswith(month_prefix))

    # By payment method this month
    by_method = {}
    for s in sales:
        if (s.get("created_at") or "").startswith(month_prefix):
            m = s.get("payment_method", "altro")
            by_method[m] = by_method.get(m, 0) + (s.get("total") or 0)

    lines = ["💰 <b>Incassi</b>", ""]
    lines.append(f"☀️ <b>Oggi</b>: €{rev_today:.2f} <i>({count_today} vendite)</i>")
    lines.append(f"📅 <b>Settimana</b>: €{rev_week:.2f}")
    lines.append(f"📆 <b>Mese</b>: €{rev_month:.2f} <i>({count_month} vendite)</i>")
    if by_method:
        lines.append("")
        lines.append("Per metodo (mese):")
        for m, v in sorted(by_method.items(), key=lambda x: -x[1]):
            lines.append(f"  · {m.capitalize()}: €{v:.2f}")
    return "\n".join(lines)


async def build_warehouse_message(db) -> str:
    """Risposta a /magazzino."""
    materials = await db.materials.find({}, {"_id": 0}).to_list(2000)
    low = [m for m in materials if (m.get("stock") or 0) <= (m.get("min_stock") or 0)]
    low.sort(key=lambda m: (m.get("stock") or 0) - (m.get("min_stock") or 0))

    lines = ["📦 <b>Magazzino</b>", ""]
    lines.append(f"Totale materiali tracciati: <b>{len(materials)}</b>")
    if low:
        lines.append(f"⚠️ <b>Sotto soglia</b> ({len(low)}):")
        for m in low[:15]:
            lines.append(f"  · {m['name']}: <b>{m.get('stock',0)}</b> {m.get('unit','')} <i>(min {m.get('min_stock',0)})</i>")
    else:
        lines.append("✅ Tutto OK — nessun materiale sotto soglia.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Inbound command router
# ---------------------------------------------------------------------------
HELP_TEXT = (
    "🐉 <b>Gestionale La Crafteria Nerd — comandi</b>\n\n"
    "/scadenze — Ordini in ritardo e prossime scadenze\n"
    "/incassi — Incassi di oggi, settimana, mese\n"
    "/magazzino — Materiali sotto soglia\n"
    "/riassunto — Riassunto serale completo\n"
    "/help — Questo menu\n\n"
    "<i>Il riassunto automatico arriva ogni sera alle 20:00.</i>"
)


def _parse_command(text: str) -> str | None:
    if not text or not text.startswith("/"):
        return None
    cmd = text.split()[0].lower().lstrip("/")
    cmd = cmd.split("@")[0]  # /scadenze@gestionale_lacrafterianerd_bot → scadenze
    return cmd


async def handle_update(db, update: dict) -> bool:
    """Process incoming Telegram update. Returns True if handled."""
    msg = update.get("message") or update.get("edited_message") or update.get("channel_post")
    if not isinstance(msg, dict):
        return False
    text = msg.get("text") or ""
    chat = msg.get("chat") or {}
    chat_id = chat.get("id")
    if not chat_id:
        return False
    cmd = _parse_command(text)
    if not cmd:
        return False

    try:
        if cmd in ("start", "help"):
            await send_message(chat_id, HELP_TEXT)
        elif cmd == "scadenze":
            await send_message(chat_id, await build_deadlines_message(db))
        elif cmd == "incassi":
            await send_message(chat_id, await build_revenue_message(db))
        elif cmd in ("magazzino", "stock"):
            await send_message(chat_id, await build_warehouse_message(db))
        elif cmd in ("riassunto", "summary"):
            await send_message(chat_id, await build_evening_summary(db))
        else:
            return False
        return True
    except Exception as e:
        logger.error(f"handle_update error: {e}")
        try:
            await send_message(chat_id, f"❌ Errore: {e}")
        except Exception:
            pass
        return False


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------
_scheduler: Optional[AsyncIOScheduler] = None


def setup_scheduler(db) -> AsyncIOScheduler | None:
    global _scheduler
    if _scheduler:
        return _scheduler
    if not BOT_TOKEN:
        logger.warning("Telegram token assente — scheduler non avviato")
        return None

    try:
        hh, mm = TG_TIME.split(":")
        hour, minute = int(hh), int(mm)
    except Exception:
        hour, minute = 20, 0

    tz = pytz.timezone(TG_TZ)
    sched = AsyncIOScheduler(timezone=tz)

    async def evening_job():
        try:
            cfg = await db.settings.find_one({"_id": "telegram"}) or {}
            chat_id = cfg.get("chat_id")
            if not chat_id:
                logger.info("Telegram chat_id non impostato — skip")
                return
            if not cfg.get("daily_summary_enabled", True):
                logger.info("Riassunto serale disabilitato — skip")
                return
            text = await build_evening_summary(db)
            await send_message(chat_id, text)
            logger.info(f"Riassunto serale inviato a {chat_id}")
        except Exception as e:
            logger.error(f"evening_job error: {e}")

    sched.add_job(
        evening_job,
        CronTrigger(hour=hour, minute=minute, timezone=tz),
        id="evening_summary", replace_existing=True, misfire_grace_time=3600,
    )
    sched.start()
    logger.info(f"Scheduler avviato — riassunto serale alle {hour:02d}:{minute:02d} {TG_TZ}")
    _scheduler = sched
    return sched
