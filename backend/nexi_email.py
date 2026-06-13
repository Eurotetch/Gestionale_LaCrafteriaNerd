"""
Import automatico vendite POS da email Nexi (notifiche "ACQUISTO ESEGUITO").

Configurazione tramite variabili d'ambiente:
  NEXI_IMAP_HOST       host IMAP della casella dedicata (es. imap.ionos.it)
  NEXI_IMAP_PORT       porta IMAP (default 993)
  NEXI_IMAP_USER       utente/email della casella
  NEXI_IMAP_PASSWORD   password (o app password)
  NEXI_POLL_MINUTES    intervallo di controllo in minuti (default 10)

Nota: la casella ProtonMail standard non espone IMAP senza "Proton Mail
Bridge" (app desktop a pagamento che deve restare in esecuzione). Se il
backend e' ospitato su un server, conviene usare una casella IMAP
"normale" (es. un alias sul dominio IONOS gia' in uso) come destinazione
dell'inoltro da Nexi.
"""
import asyncio
import email
import imaplib
import logging
import os
import re
from datetime import datetime
from email.header import decode_header
from typing import Optional

import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger("crafteria.nexi")

IMAP_HOST = os.environ.get("NEXI_IMAP_HOST") or ""
IMAP_PORT = int(os.environ.get("NEXI_IMAP_PORT", "993"))
IMAP_USER = os.environ.get("NEXI_IMAP_USER") or ""
IMAP_PASSWORD = os.environ.get("NEXI_IMAP_PASSWORD") or ""
POLL_MINUTES = int(os.environ.get("NEXI_POLL_MINUTES", "10"))
TZ = pytz.timezone(os.environ.get("NOTIFICATION_TIMEZONE", "Europe/Rome"))

DATE_RE = re.compile(r"Data[:\s]+(\d{2})\.(\d{2})\.(\d{4})", re.IGNORECASE)
TIME_RE = re.compile(r"Ora[:\s]+(\d{2}):(\d{2})", re.IGNORECASE)
AMOUNT_RE = re.compile(r"(\d+(?:[.,]\d{2})?)\s*€")
KEYWORDS = ("acquisto", "transazione")


def _decode(value: Optional[str]) -> str:
    if not value:
        return ""
    parts = decode_header(value)
    out = []
    for text, enc in parts:
        if isinstance(text, bytes):
            out.append(text.decode(enc or "utf-8", errors="ignore"))
        else:
            out.append(text)
    return "".join(out)


def _extract_text(msg) -> str:
    if msg.is_multipart():
        text_parts = []
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype in ("text/plain", "text/html") and "attachment" not in str(part.get("Content-Disposition") or ""):
                try:
                    payload = part.get_payload(decode=True) or b""
                    charset = part.get_content_charset() or "utf-8"
                    text_parts.append(payload.decode(charset, errors="ignore"))
                except Exception:
                    continue
        body = "\n".join(text_parts)
    else:
        try:
            payload = msg.get_payload(decode=True) or b""
            charset = msg.get_content_charset() or "utf-8"
            body = payload.decode(charset, errors="ignore")
        except Exception:
            body = ""
    # strip html tags if present
    body = re.sub(r"<[^>]+>", " ", body)
    return body


def parse_nexi_email(subject: str, body: str) -> Optional[dict]:
    """Estrae data, ora e importo da un'email di notifica Nexi.
    Ritorna None se l'email non sembra una transazione valida."""
    full_text = f"{subject}\n{body}"
    lowered = full_text.lower()
    if not any(k in lowered for k in KEYWORDS):
        return None

    date_m = DATE_RE.search(full_text)
    time_m = TIME_RE.search(full_text)
    amount_m = AMOUNT_RE.search(full_text)
    if not (date_m and amount_m):
        return None

    day, month, year = date_m.groups()
    hour, minute = (time_m.groups() if time_m else ("00", "00"))
    amount = float(amount_m.group(1).replace(",", "."))

    local_dt = TZ.localize(datetime(int(year), int(month), int(day), int(hour), int(minute)))
    return {
        "amount": amount,
        "datetime_utc": local_dt.astimezone(pytz.utc),
    }


async def poll_nexi_inbox(db) -> int:
    """Controlla la casella IMAP dedicata e crea vendite POS dalle email Nexi valide.
    Ritorna il numero di vendite create."""
    if not (IMAP_HOST and IMAP_USER and IMAP_PASSWORD):
        return 0
    transactions = await asyncio.to_thread(_fetch_transactions_sync)
    created = 0
    for tx in transactions:
        await _insert_sale(db, tx)
        created += 1
    return created


def _fetch_transactions_sync() -> list:
    """Si collega via IMAP, legge le email non lette e ritorna le transazioni Nexi valide
    (segnando comunque tutte le email controllate come lette)."""
    transactions = []
    try:
        conn = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
        conn.login(IMAP_USER, IMAP_PASSWORD)
        conn.select("INBOX")
        status, data = conn.search(None, "UNSEEN")
        if status != "OK":
            conn.logout()
            return transactions
        ids = data[0].split()
        for msg_id in ids:
            try:
                status, msg_data = conn.fetch(msg_id, "(RFC822)")
                if status != "OK":
                    continue
                msg = email.message_from_bytes(msg_data[0][1])
                subject = _decode(msg.get("Subject"))
                body = _extract_text(msg)
                parsed = parse_nexi_email(subject, body)
                if parsed:
                    transactions.append(parsed)
            except Exception as e:
                logger.error(f"errore elaborazione email Nexi {msg_id}: {e}")
            finally:
                conn.store(msg_id, "+FLAGS", "\\Seen")
        conn.logout()
    except Exception as e:
        logger.error(f"errore connessione IMAP Nexi: {e}")
    return transactions


async def _insert_sale(db, tx: dict):
    import uuid
    amount = round(tx["amount"], 2)
    created_at = tx["datetime_utc"].isoformat()
    await db.sales.insert_one({
        "id": str(uuid.uuid4()),
        "items": [{"product_id": None, "name": "Vendita POS (import automatico)", "quantity": 1, "price": amount}],
        "subtotal": amount,
        "discount": 0.0,
        "total": amount,
        "payment_method": "carta",
        "customer_id": None,
        "customer_name": None,
        "notes": "Importato automaticamente da email Nexi — da completare",
        "tags": ["POS"],
        "created_at": created_at,
        "created_by": None,
        "operator_name": "Import Nexi",
        "is_returned": False,
    })


_scheduler: Optional[AsyncIOScheduler] = None


def setup_nexi_scheduler(db) -> Optional[AsyncIOScheduler]:
    global _scheduler
    if _scheduler:
        return _scheduler
    if not (IMAP_HOST and IMAP_USER and IMAP_PASSWORD):
        logger.info("Import Nexi via email non configurato — scheduler non avviato")
        return None

    sched = AsyncIOScheduler(timezone=TZ)

    async def job():
        try:
            n = await poll_nexi_inbox(db)
            if n:
                logger.info(f"Importate {n} vendite POS da email Nexi")
        except Exception as e:
            logger.error(f"nexi poll job error: {e}")

    sched.add_job(job, IntervalTrigger(minutes=POLL_MINUTES), id="nexi_email_poll", replace_existing=True, misfire_grace_time=300)
    sched.start()
    logger.info(f"Scheduler import Nexi avviato — controllo ogni {POLL_MINUTES} minuti")
    _scheduler = sched
    return sched
