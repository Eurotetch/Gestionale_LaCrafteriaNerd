"""
Telegram Bot client + daily notification scheduler.
"""
import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger("crafteria.telegram")

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN") or ""
TG_TIME = os.environ.get("NOTIFICATION_TIME", "09:30")
TG_TZ = os.environ.get("NOTIFICATION_TIMEZONE", "Europe/Rome")
BASE = f"https://api.telegram.org/bot{BOT_TOKEN}" if BOT_TOKEN else None


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
    """Returns recent unique chats the bot has seen."""
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


# -----------------------------------------------------------------------------
# Daily summary builder
# -----------------------------------------------------------------------------
def _it_date(iso_or_d: str) -> str:
    try:
        return datetime.fromisoformat(iso_or_d).strftime("%d/%m/%Y")
    except Exception:
        return iso_or_d


async def build_daily_summary(db) -> str:
    tz = pytz.timezone(TG_TZ)
    now_local = datetime.now(tz)
    today = now_local.date().isoformat()
    yesterday = (now_local.date() - timedelta(days=1)).isoformat()
    in_2 = (now_local.date() + timedelta(days=2)).isoformat()

    orders = await db.orders.find({}, {"_id": 0}).to_list(2000)
    active = [o for o in orders if o.get("status") in ("nuovo", "in_lavorazione")]
    overdue = sorted([o for o in active if o.get("due_date") and o["due_date"] < today], key=lambda x: x["due_date"])
    today_due = [o for o in active if o.get("due_date") == today]
    tomorrow_due = [o for o in active if o.get("due_date") and today < o["due_date"] <= in_2]

    invoices = await db.invoices.find({}, {"_id": 0}).to_list(2000)
    overdue_inv = [i for i in invoices if i.get("status") not in ("pagato", "bozza")
                   and i.get("due_date") and i["due_date"] < today]

    materials = await db.materials.find({}, {"_id": 0}).to_list(2000)
    low_stock = [m for m in materials if (m.get("stock") or 0) <= (m.get("min_stock") or 0)]

    sales = await db.sales.find({}, {"_id": 0}).to_list(2000)
    rev_yesterday = sum(s.get("total", 0) for s in sales if (s.get("created_at") or "").startswith(yesterday))
    count_yesterday = sum(1 for s in sales if (s.get("created_at") or "").startswith(yesterday))

    lines = []
    lines.append("🌅 <b>Buongiorno La Crafteria Nerd!</b>")
    lines.append(f"<i>Riepilogo del {now_local.strftime('%d/%m/%Y')}</i>")
    lines.append("")

    if rev_yesterday or count_yesterday:
        lines.append(f"💰 <b>Ieri</b>: {count_yesterday} vendite — €{rev_yesterday:.2f}")
        lines.append("")

    if overdue:
        lines.append(f"🔴 <b>Ordini in ritardo</b> ({len(overdue)})")
        for o in overdue[:6]:
            lines.append(f"  • {o['title']} — {o.get('customer_name','')} <i>(scad. {_it_date(o['due_date'])})</i>")
        if len(overdue) > 6:
            lines.append(f"  …e altri {len(overdue) - 6}")
        lines.append("")

    if today_due:
        lines.append(f"⏰ <b>Da consegnare oggi</b> ({len(today_due)})")
        for o in today_due[:6]:
            lines.append(f"  • {o['title']} — {o.get('customer_name','')}")
        lines.append("")

    if tomorrow_due:
        lines.append(f"📅 <b>In scadenza domani/dopo</b> ({len(tomorrow_due)})")
        for o in tomorrow_due[:5]:
            lines.append(f"  • {o['title']} — <i>{_it_date(o['due_date'])}</i>")
        lines.append("")

    if overdue_inv:
        lines.append(f"🧾 <b>Fatture scadute</b> ({len(overdue_inv)})")
        for i in overdue_inv[:5]:
            lines.append(f"  • {i.get('number','—')} {i.get('customer_name','')} — €{i.get('total',0):.2f}")
        lines.append("")

    if low_stock:
        lines.append(f"📦 <b>Materiali sotto soglia</b> ({len(low_stock)})")
        for m in low_stock[:6]:
            lines.append(f"  • {m['name']}: {m.get('stock',0)} {m.get('unit','')} <i>(min {m.get('min_stock',0)})</i>")
        lines.append("")

    if len(lines) <= 3:
        lines.append("✨ <i>Tutto sotto controllo, niente in ritardo o in sospeso. Buon lavoro!</i>")

    lines.append("")
    lines.append("— 🐉 inviato dal gestionale")
    return "\n".join(lines)


# -----------------------------------------------------------------------------
# Scheduler
# -----------------------------------------------------------------------------
_scheduler: Optional[AsyncIOScheduler] = None


def setup_scheduler(db) -> AsyncIOScheduler:
    global _scheduler
    if _scheduler:
        return _scheduler
    if not BOT_TOKEN:
        logger.warning("Telegram token assente — scheduler non avviato")
        return None  # type: ignore

    try:
        hh, mm = TG_TIME.split(":")
        hour, minute = int(hh), int(mm)
    except Exception:
        hour, minute = 9, 30

    tz = pytz.timezone(TG_TZ)
    sched = AsyncIOScheduler(timezone=tz)

    async def daily_job():
        try:
            cfg = await db.settings.find_one({"_id": "telegram"}) or {}
            chat_id = cfg.get("chat_id")
            if not chat_id:
                logger.info("Telegram chat_id non impostato — skip")
                return
            if not cfg.get("daily_summary_enabled", True):
                logger.info("Daily summary disabilitato — skip")
                return
            text = await build_daily_summary(db)
            await send_message(chat_id, text)
            logger.info(f"Daily summary inviato a {chat_id}")
        except Exception as e:
            logger.error(f"daily_job error: {e}")

    sched.add_job(daily_job, CronTrigger(hour=hour, minute=minute, timezone=tz),
                  id="daily_summary", replace_existing=True, misfire_grace_time=3600)
    sched.start()
    logger.info(f"Scheduler avviato — daily summary alle {hour:02d}:{minute:02d} {TG_TZ}")
    _scheduler = sched
    return sched
