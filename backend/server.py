"""
La Crafteria Nerd — Gestionale Backend
FastAPI + Motor (MongoDB) + JWT auth
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
import uuid

import pytz
import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query, UploadFile, File, Header, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from storage_client import init_storage, put_object, get_object, build_path
from telegram_client import (
    send_message as tg_send, get_updates as tg_get_updates, get_me as tg_get_me,
    build_evening_summary, build_deadlines_message, build_revenue_message,
    build_warehouse_message, setup_scheduler, handle_update as tg_handle_update,
    set_webhook as tg_set_webhook, delete_webhook as tg_delete_webhook,
    get_webhook_info as tg_get_webhook_info, set_my_commands as tg_set_commands,
    WEBHOOK_SECRET,
)


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("crafteria")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_TTL_HOURS = 24 * 7  # 7 days
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "lacrafterianerd@gmail.com").lower()

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="La Crafteria Nerd — Gestionale")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def utcnow_iso() -> str:
    return utcnow().isoformat()


def gen_id() -> str:
    return str(uuid.uuid4())


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": utcnow() + timedelta(hours=JWT_TTL_HOURS),
        "iat": utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def clean_doc(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


# ---------------------------------------------------------------------------
# Permission system
# ---------------------------------------------------------------------------
MODULES = [
    "dashboard", "orders", "customers", "products", "inventory",
    "invoices", "calendar", "pos", "reports", "users",
]

DEFAULT_PERMISSIONS = {
    m: {"view": False, "edit": False, "delete": False} for m in MODULES
}


def full_permissions() -> dict:
    return {m: {"view": True, "edit": True, "delete": True} for m in MODULES}


def has_permission(user: dict, module: str, action: str = "view") -> bool:
    if user.get("role") == "admin":
        return True
    perms = user.get("permissions") or {}
    mod = perms.get(module) or {}
    return bool(mod.get(action, False))


async def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    token = None
    if creds and creds.scheme.lower() == "bearer":
        token = creds.credentials
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Non autenticato")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sessione scaduta")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token non valido")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user or user.get("disabled"):
        raise HTTPException(401, "Utente non trovato o disabilitato")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Solo l'admin può eseguire questa azione")
    return user


def require_perm(module: str, action: str = "view"):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if not has_permission(user, module, action):
            raise HTTPException(403, f"Permesso negato: {module}.{action}")
        return user
    return checker


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginBody(BaseModel):
    email: EmailStr
    password: Optional[str] = None


class SetupPasswordBody(BaseModel):
    email: EmailStr
    new_password: str = Field(min_length=6)


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=6)
    role: str = "collaborator"  # admin | collaborator
    permissions: Optional[Dict[str, Dict[str, bool]]] = None
    grant_all: bool = False


class UserUpdate(BaseModel):
    name: Optional[str] = None
    permissions: Optional[Dict[str, Dict[str, bool]]] = None
    grant_all: Optional[bool] = None
    disabled: Optional[bool] = None
    new_password: Optional[str] = None


class Customer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = []


class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    description: Optional[str] = None
    technique: str = "3D"  # 3D, Ricamo, Laser, UV, Tufting, Altro
    category: str = ""  # nuova categoria libera
    price: float = 0.0
    cost: float = 0.0
    sku: Optional[str] = None
    image_url: Optional[str] = None
    active: bool = True
    tags: List[str] = []


class Material(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    unit: str = "pz"  # pz, kg, m, ml
    stock: float = 0.0
    min_stock: float = 0.0
    unit_cost: float = 0.0
    supplier: Optional[str] = None
    notes: Optional[str] = None
    category: str = ""
    tags: List[str] = []
    color: str = ""


class OrderItem(BaseModel):
    product_id: Optional[str] = None
    name: str
    quantity: float = 1
    price: float = 0.0
    notes: Optional[str] = None


class OrderMaterial(BaseModel):
    material_id: Optional[str] = None
    name: str
    quantity: float = 0
    unit: str = "pz"
    unit_cost: float = 0.0  # snapshot at time of allocation


class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    customer_id: Optional[str] = None
    customer_name: str
    title: str
    description: Optional[str] = None
    technique: Optional[str] = None
    status: str = "nuovo"  # nuovo, in_lavorazione, pronto, consegnato, annullato
    items: List[OrderItem] = []
    materials_used: List[OrderMaterial] = []
    total: float = 0.0
    deposit: float = 0.0
    due_date: Optional[str] = None
    priority: str = "media"  # bassa, media, alta


class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    kind: str = "preventivo"  # preventivo | fattura
    number: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: str
    items: List[OrderItem] = []
    subtotal: float = 0.0
    vat_rate: float = 22.0
    total: float = 0.0
    status: str = "bozza"  # bozza, inviato, pagato, scaduto
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None


class CalendarEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    description: Optional[str] = None
    start: str  # ISO date or datetime
    end: Optional[str] = None
    color: Optional[str] = None
    order_id: Optional[str] = None
    kind: str = "lavorazione"  # lavorazione, scadenza, evento


class SaleItem(BaseModel):
    product_id: Optional[str] = None
    name: str
    quantity: float = 1
    price: float = 0.0


class Sale(BaseModel):
    model_config = ConfigDict(extra="ignore")
    items: List[SaleItem] = []
    subtotal: float = 0.0
    discount: float = 0.0
    total: float = 0.0
    payment_method: str = "contanti"  # contanti, carta, bonifico, altro
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth & startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    for coll in ["customers", "products", "materials", "orders",
                 "invoices", "calendar_events", "sales", "files"]:
        await db[coll].create_index("id", unique=True)
    await db.files.create_index([("parent_type", 1), ("parent_id", 1)])
    # Init object storage (non-blocking)
    try:
        init_storage()
    except Exception as e:
        logger.warning(f"storage init: {e}")
    # Telegram daily-summary scheduler
    try:
        setup_scheduler(db)
    except Exception as e:
        logger.warning(f"telegram scheduler: {e}")
    # Seed admin (no password — first login sets it)
    admin = await db.users.find_one({"email": ADMIN_EMAIL})
    if not admin:
        await db.users.insert_one({
            "id": gen_id(),
            "email": ADMIN_EMAIL,
            "name": "Admin",
            "role": "admin",
            "password_hash": None,
            "requires_password_setup": True,
            "permissions": full_permissions(),
            "disabled": False,
            "created_at": utcnow_iso(),
        })
        logger.info(f"Seeded admin: {ADMIN_EMAIL} (password setup required)")
    else:
        # ensure admin always has full perms and role
        await db.users.update_one(
            {"email": ADMIN_EMAIL},
            {"$set": {"role": "admin", "permissions": full_permissions(), "disabled": False}}
        )


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/")
async def root():
    return {"app": "La Crafteria Nerd — Gestionale", "ok": True}


# ---------------------------------------------------------------------------
# AUTH ROUTES
# ---------------------------------------------------------------------------
@api.post("/auth/check-email")
async def check_email(body: dict):
    email = (body.get("email") or "").lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        return {"exists": False}
    return {
        "exists": True,
        "requires_password_setup": bool(user.get("requires_password_setup")) or not user.get("password_hash"),
        "disabled": bool(user.get("disabled")),
    }


@api.post("/auth/setup-password")
async def setup_password(body: SetupPasswordBody):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    if not user.get("requires_password_setup") and user.get("password_hash"):
        raise HTTPException(400, "Password già impostata. Usa il login normale.")
    if user.get("disabled"):
        raise HTTPException(403, "Account disabilitato")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": hash_password(body.new_password),
            "requires_password_setup": False,
            "updated_at": utcnow_iso(),
        }}
    )
    token = create_token(user["id"], email)
    user["password_hash"] = "set"
    user["requires_password_setup"] = False
    return {"token": token, "user": clean_doc(user)}


@api.post("/auth/login")
async def login(body: LoginBody):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(401, "Credenziali non valide")
    if user.get("disabled"):
        raise HTTPException(403, "Account disabilitato. Contatta l'admin.")
    if not user.get("password_hash") or user.get("requires_password_setup"):
        raise HTTPException(409, "Imposta la tua password prima di accedere.")
    if not body.password or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Credenziali non valide")
    token = create_token(user["id"], email)
    return {"token": token, "user": clean_doc(user)}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return clean_doc(user)


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    if not user.get("password_hash") or not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(400, "Password attuale errata")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(body.new_password), "updated_at": utcnow_iso()}}
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# USER MANAGEMENT (admin)
# ---------------------------------------------------------------------------
@api.get("/users")
async def list_users(_: dict = Depends(require_admin)):
    cursor = db.users.find({}, {"_id": 0, "password_hash": 0})
    return await cursor.to_list(500)


@api.post("/users")
async def create_user(body: UserCreate, _: dict = Depends(require_admin)):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email già registrata")
    perms = full_permissions() if body.grant_all else (body.permissions or DEFAULT_PERMISSIONS)
    doc = {
        "id": gen_id(),
        "email": email,
        "name": body.name,
        "role": body.role if body.role in ("admin", "collaborator") else "collaborator",
        "password_hash": hash_password(body.password),
        "requires_password_setup": False,
        "permissions": perms,
        "grant_all": bool(body.grant_all),
        "disabled": False,
        "created_at": utcnow_iso(),
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


@api.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, admin: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    if user["email"] == ADMIN_EMAIL and (body.disabled is True):
        raise HTTPException(400, "Non puoi disabilitare l'admin principale")
    upd: Dict[str, Any] = {}
    if body.name is not None:
        upd["name"] = body.name
    if body.grant_all is True:
        upd["permissions"] = full_permissions()
        upd["grant_all"] = True
    elif body.permissions is not None:
        upd["permissions"] = body.permissions
        upd["grant_all"] = False
    if body.disabled is not None:
        upd["disabled"] = bool(body.disabled)
    if body.new_password:
        upd["password_hash"] = hash_password(body.new_password)
        upd["requires_password_setup"] = False
    if not upd:
        return clean_doc(user)
    upd["updated_at"] = utcnow_iso()
    await db.users.update_one({"id": user_id}, {"$set": upd})
    user = await db.users.find_one({"id": user_id})
    return clean_doc(user)


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, _: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    if user["email"] == ADMIN_EMAIL:
        raise HTTPException(400, "Non puoi eliminare l'admin principale")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Generic CRUD factory
# ---------------------------------------------------------------------------
def make_crud(router: APIRouter, base: str, collection_name: str, module: str, model_cls):
    @router.get(f"/{base}")
    async def list_items(user: dict = Depends(require_perm(module, "view"))):
        items = await db[collection_name].find({}, {"_id": 0}).to_list(2000)
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return items

    @router.get(f"/{base}/{{item_id}}")
    async def get_item(item_id: str, user: dict = Depends(require_perm(module, "view"))):
        item = await db[collection_name].find_one({"id": item_id}, {"_id": 0})
        if not item:
            raise HTTPException(404, "Non trovato")
        return item

    @router.post(f"/{base}")
    async def create_item(payload: model_cls, user: dict = Depends(require_perm(module, "edit"))):
        doc = payload.model_dump()
        doc["id"] = gen_id()
        doc["created_at"] = utcnow_iso()
        doc["updated_at"] = doc["created_at"]
        doc["created_by"] = user["id"]
        await db[collection_name].insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.patch(f"/{base}/{{item_id}}")
    async def update_item(item_id: str, payload: dict, user: dict = Depends(require_perm(module, "edit"))):
        existing = await db[collection_name].find_one({"id": item_id})
        if not existing:
            raise HTTPException(404, "Non trovato")
        payload.pop("id", None)
        payload.pop("_id", None)
        payload["updated_at"] = utcnow_iso()
        payload["updated_by"] = user["id"]
        await db[collection_name].update_one({"id": item_id}, {"$set": payload})
        item = await db[collection_name].find_one({"id": item_id}, {"_id": 0})
        return item

    @router.delete(f"/{base}/{{item_id}}")
    async def delete_item(item_id: str, user: dict = Depends(require_perm(module, "delete"))):
        res = await db[collection_name].delete_one({"id": item_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Non trovato")
        return {"ok": True}


make_crud(api, "customers", "customers", "customers", Customer)
make_crud(api, "products", "products", "products", Product)
make_crud(api, "materials", "materials", "inventory", Material)
# Orders intentionally handled below (custom logic: inventory auto-decrement)
make_crud(api, "invoices", "invoices", "invoices", Invoice)
make_crud(api, "calendar", "calendar_events", "calendar", CalendarEvent)


# ---------------------------------------------------------------------------
# ORDERS — custom CRUD with inventory auto-decrement on "consegnato"
# ---------------------------------------------------------------------------
async def apply_inventory_decrement(order: dict, user_id: str):
    """Decrement stock based on materials_used; idempotent via inventory_applied flag."""
    if order.get("inventory_applied"):
        return
    movements = []
    for mat in (order.get("materials_used") or []):
        mid = mat.get("material_id")
        qty = float(mat.get("quantity") or 0)
        if not mid or qty <= 0:
            continue
        m = await db.materials.find_one({"id": mid})
        if not m:
            continue
        new_stock = round((m.get("stock") or 0) - qty, 4)
        await db.materials.update_one({"id": mid}, {"$set": {"stock": new_stock, "updated_at": utcnow_iso()}})
        movements.append({
            "material_id": mid, "name": m.get("name"),
            "delta": -qty, "new_stock": new_stock, "at": utcnow_iso(),
        })
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {"inventory_applied": True, "inventory_applied_at": utcnow_iso(),
                  "inventory_applied_by": user_id, "inventory_movements": movements}},
    )


async def revert_inventory_decrement(order: dict, user_id: str):
    """If an order leaves 'consegnato', revert stock changes."""
    if not order.get("inventory_applied"):
        return
    for mv in (order.get("inventory_movements") or []):
        await db.materials.update_one({"id": mv["material_id"]}, {"$inc": {"stock": -mv["delta"]}, "$set": {"updated_at": utcnow_iso()}})
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {"inventory_applied": False, "inventory_movements": [], "inventory_reverted_at": utcnow_iso()}},
    )


@api.get("/orders")
async def orders_list(_: dict = Depends(require_perm("orders", "view"))):
    items = await db.orders.find({}, {"_id": 0}).to_list(2000)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@api.get("/orders/{order_id}")
async def orders_get(order_id: str, _: dict = Depends(require_perm("orders", "view"))):
    o = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Non trovato")
    return o


@api.post("/orders")
async def orders_create(payload: Order, user: dict = Depends(require_perm("orders", "edit"))):
    doc = payload.model_dump()
    doc["id"] = gen_id()
    doc["created_at"] = utcnow_iso()
    doc["updated_at"] = doc["created_at"]
    doc["created_by"] = user["id"]
    doc["inventory_applied"] = False
    doc["inventory_movements"] = []
    await db.orders.insert_one(doc)
    if doc.get("status") == "consegnato":
        await apply_inventory_decrement(doc, user["id"])
    doc.pop("_id", None)
    out = await db.orders.find_one({"id": doc["id"]}, {"_id": 0})
    return out


@api.patch("/orders/{order_id}")
async def orders_update(order_id: str, payload: dict, user: dict = Depends(require_perm("orders", "edit"))):
    existing = await db.orders.find_one({"id": order_id})
    if not existing:
        raise HTTPException(404, "Non trovato")
    payload.pop("id", None)
    payload.pop("_id", None)
    payload["updated_at"] = utcnow_iso()
    payload["updated_by"] = user["id"]
    await db.orders.update_one({"id": order_id}, {"$set": payload})
    updated = await db.orders.find_one({"id": order_id})
    old_status = existing.get("status")
    new_status = updated.get("status")
    if new_status == "consegnato" and old_status != "consegnato":
        await apply_inventory_decrement(updated, user["id"])
    elif old_status == "consegnato" and new_status != "consegnato":
        await revert_inventory_decrement(updated, user["id"])
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


@api.delete("/orders/{order_id}")
async def orders_delete(order_id: str, user: dict = Depends(require_perm("orders", "delete"))):
    existing = await db.orders.find_one({"id": order_id})
    if not existing:
        raise HTTPException(404, "Non trovato")
    # If inventory was applied, revert before deleting
    if existing.get("inventory_applied"):
        await revert_inventory_decrement(existing, user["id"])
    await db.orders.delete_one({"id": order_id})
    return {"ok": True}


@api.post("/orders/{order_id}/convert")
async def orders_convert(
    order_id: str,
    kind: str = Query("preventivo", regex="^(preventivo|fattura)$"),
    user: dict = Depends(require_perm("invoices", "edit")),
):
    """Crea un preventivo o fattura a partire da un ordine esistente."""
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(404, "Ordine non trovato")

    year = utcnow().year
    prefix = "F" if kind == "fattura" else "P"
    n = await next_counter(f"{prefix}-{year}")
    number = f"{prefix}-{year}-{n:04d}"

    items = o.get("items") or []
    if not items:
        # Fallback: una sola riga con titolo+totale
        items = [{
            "product_id": None,
            "name": o.get("title") or "Lavorazione",
            "quantity": 1,
            "price": o.get("total") or 0,
        }]
    subtotal = sum((it.get("price", 0) or 0) * (it.get("quantity", 0) or 0) for it in items)
    vat_rate = 22.0
    total = round(subtotal * (1 + vat_rate / 100), 2)

    inv = {
        "id": gen_id(),
        "kind": kind,
        "number": number,
        "customer_id": o.get("customer_id"),
        "customer_name": o.get("customer_name") or "—",
        "items": items,
        "subtotal": round(subtotal, 2),
        "vat_rate": vat_rate,
        "total": total,
        "status": "bozza",
        "issue_date": utcnow().date().isoformat(),
        "due_date": o.get("due_date"),
        "notes": f"Generato dall'ordine «{o.get('title','')}»",
        "from_order_id": order_id,
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
        "created_by": user["id"],
    }
    await db.invoices.insert_one(inv)
    # Link back on order
    invoices_links = o.get("invoices_generated") or []
    invoices_links.append({"id": inv["id"], "kind": kind, "number": number, "created_at": inv["created_at"]})
    await db.orders.update_one({"id": order_id}, {"$set": {"invoices_generated": invoices_links}})
    inv.pop("_id", None)
    return inv


# ---------------------------------------------------------------------------
# POS / Sales
# ---------------------------------------------------------------------------
@api.get("/sales")
async def list_sales(
    user: dict = Depends(require_perm("pos", "view")),
    period: str = Query("all", regex="^(today|month|all)$"),
    limit: int = 1000,
):
    tz = pytz.timezone(os.environ.get("NOTIFICATION_TIMEZONE", "Europe/Rome"))
    now_local = datetime.now(tz)
    q: Dict[str, Any] = {}
    if period == "today":
        today = now_local.date().isoformat()
        q["created_at"] = {"$gte": today}
    elif period == "month":
        prefix = now_local.strftime("%Y-%m")
        q["created_at"] = {"$gte": prefix}
    items = await db.sales.find(q, {"_id": 0}).to_list(limit)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@api.post("/sales")
async def create_sale(payload: Sale, user: dict = Depends(require_perm("pos", "edit"))):
    doc = payload.model_dump()
    subtotal = sum((it.get("price", 0) or 0) * (it.get("quantity", 0) or 0) for it in doc["items"])
    doc["subtotal"] = round(subtotal, 2)
    doc["total"] = round(subtotal - (doc.get("discount") or 0), 2)
    doc["id"] = gen_id()
    doc["created_at"] = utcnow_iso()
    doc["created_by"] = user["id"]
    doc["operator_name"] = user.get("name")
    doc["is_returned"] = False
    await db.sales.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/sales/{sale_id}")
async def patch_sale(sale_id: str, payload: dict, user: dict = Depends(require_perm("pos", "edit"))):
    existing = await db.sales.find_one({"id": sale_id})
    if not existing:
        raise HTTPException(404, "Vendita non trovata")
    allowed = {k: v for k, v in payload.items() if k in ("is_returned", "notes", "payment_method")}
    if not allowed:
        return {k: v for k, v in existing.items() if k != "_id"}
    allowed["updated_at"] = utcnow_iso()
    allowed["updated_by"] = user["id"]
    if "is_returned" in allowed:
        allowed["returned_at"] = utcnow_iso() if allowed["is_returned"] else None
    await db.sales.update_one({"id": sale_id}, {"$set": allowed})
    out = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    return out


@api.delete("/sales/{sale_id}")
async def delete_sale(sale_id: str, _: dict = Depends(require_perm("pos", "delete"))):
    res = await db.sales.delete_one({"id": sale_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Vendita non trovata")
    return {"ok": True}


# ---------------------------------------------------------------------------
# DASHBOARD / REPORTS
# ---------------------------------------------------------------------------
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    today = utcnow().date().isoformat()
    in_7_days = (utcnow().date() + timedelta(days=7)).isoformat()
    month_prefix = utcnow().strftime("%Y-%m")

    # Orders breakdown + deadline alerts
    orders = await db.orders.find({}, {"_id": 0}).to_list(2000)
    by_status = {"nuovo": 0, "in_lavorazione": 0, "pronto": 0, "consegnato": 0, "annullato": 0}
    for o in orders:
        by_status[o.get("status", "nuovo")] = by_status.get(o.get("status", "nuovo"), 0) + 1
    active_orders = [o for o in orders if o.get("status") in ("nuovo", "in_lavorazione")]
    overdue_orders = [o for o in active_orders if o.get("due_date") and o["due_date"] < today]
    due_soon_orders = [o for o in active_orders if o.get("due_date") and today <= o["due_date"] <= in_7_days]
    overdue_orders.sort(key=lambda x: x.get("due_date", ""))
    due_soon_orders.sort(key=lambda x: x.get("due_date", ""))

    # Overdue invoices
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(2000)
    overdue_invoices = [i for i in invoices if i.get("status") not in ("pagato", "bozza")
                        and i.get("due_date") and i["due_date"] < today]

    # Sales (exclude returned)
    sales = await db.sales.find({"is_returned": {"$ne": True}}, {"_id": 0}).to_list(2000)
    revenue_month = sum(s.get("total", 0) for s in sales if (s.get("created_at") or "").startswith(month_prefix))
    revenue_today = sum(s.get("total", 0) for s in sales if (s.get("created_at") or "").startswith(today))
    sales_count_today = sum(1 for s in sales if (s.get("created_at") or "").startswith(today))
    sales_count_total = len(sales)

    # Low stock
    materials = await db.materials.find({}, {"_id": 0}).to_list(2000)
    low_stock = [m for m in materials if (m.get("stock") or 0) <= (m.get("min_stock") or 0)]

    customers_count = await db.customers.count_documents({})

    events = await db.calendar_events.find({}, {"_id": 0}).to_list(500)
    upcoming = sorted([e for e in events if (e.get("start") or "") >= today], key=lambda e: e.get("start", ""))[:5]

    return {
        "orders_by_status": by_status,
        "orders_total": len(orders),
        "revenue_month": round(revenue_month, 2),
        "revenue_today": round(revenue_today, 2),
        "sales_count_today": sales_count_today,
        "sales_count_total": sales_count_total,
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock[:5],
        "customers_count": customers_count,
        "upcoming_events": upcoming,
        "overdue_orders": overdue_orders[:10],
        "due_soon_orders": due_soon_orders[:10],
        "overdue_invoices": overdue_invoices[:10],
    }


@api.get("/reports/overview")
async def reports_overview(user: dict = Depends(require_perm("reports", "view"))):
    sales = await db.sales.find({}, {"_id": 0}).to_list(5000)
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    # revenue by month (last 12)
    revenue_by_month: Dict[str, float] = {}
    for s in sales:
        key = (s.get("created_at") or "")[:7]
        if key:
            revenue_by_month[key] = revenue_by_month.get(key, 0) + (s.get("total") or 0)
    months_sorted = sorted(revenue_by_month.keys())[-12:]
    chart = [{"month": m, "revenue": round(revenue_by_month[m], 2)} for m in months_sorted]

    # revenue by technique (orders)
    by_tech: Dict[str, float] = {}
    for o in orders:
        t = o.get("technique") or "Altro"
        by_tech[t] = by_tech.get(t, 0) + (o.get("total") or 0)
    techniques = [{"technique": k, "revenue": round(v, 2)} for k, v in by_tech.items()]

    # top customers by revenue (sales + orders)
    by_customer: Dict[str, float] = {}
    for s in sales:
        n = s.get("customer_name") or "Cassa"
        by_customer[n] = by_customer.get(n, 0) + (s.get("total") or 0)
    for o in orders:
        n = o.get("customer_name") or "—"
        by_customer[n] = by_customer.get(n, 0) + (o.get("total") or 0)
    top_customers = sorted(
        [{"customer": k, "revenue": round(v, 2)} for k, v in by_customer.items()],
        key=lambda x: x["revenue"], reverse=True
    )[:10]

    total_revenue = round(sum(s.get("total", 0) for s in sales) + sum(o.get("total", 0) for o in orders if o.get("status") == "consegnato"), 2)
    return {
        "revenue_by_month": chart,
        "by_technique": techniques,
        "top_customers": top_customers,
        "total_revenue": total_revenue,
        "total_orders": len(orders),
        "total_sales": len(sales),
    }


# ---------------------------------------------------------------------------
# FILES / ATTACHMENTS
# ---------------------------------------------------------------------------
MAX_UPLOAD_SIZE = 25 * 1024 * 1024  # 25 MB
ALLOWED_MIME_PREFIXES = ("image/", "application/pdf", "model/", "application/octet-stream", "text/plain")


@api.post("/upload")
async def upload_file(
    parent_type: str = Query(..., description="orders | customers | invoices | products"),
    parent_id: str = Query(...),
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if parent_type not in ("orders", "customers", "invoices", "products"):
        raise HTTPException(400, "parent_type non valido")
    # Permission check based on parent
    perm_map = {"orders": "orders", "customers": "customers", "invoices": "invoices", "products": "products"}
    if not has_permission(user, perm_map[parent_type], "edit"):
        raise HTTPException(403, "Permesso negato")

    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, "File troppo grande (max 25 MB)")
    ct = (file.content_type or "application/octet-stream").lower()
    if not any(ct.startswith(p) for p in ALLOWED_MIME_PREFIXES) and not (file.filename or "").lower().endswith(".stl"):
        raise HTTPException(400, f"Tipo file non consentito: {ct}")

    file_id = gen_id()
    ext = (file.filename or "bin").split(".")[-1].lower()[:8] or "bin"
    path = build_path(user["id"], ext, file_id)
    try:
        result = put_object(path, data, ct)
    except Exception as e:
        logger.error(f"upload failed: {e}")
        raise HTTPException(500, "Caricamento fallito")

    doc = {
        "id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": ct,
        "size": result.get("size") or len(data),
        "parent_type": parent_type,
        "parent_id": parent_id,
        "uploaded_by": user["id"],
        "is_deleted": False,
        "created_at": utcnow_iso(),
    }
    await db.files.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/files")
async def list_files(parent_type: str, parent_id: str, user: dict = Depends(get_current_user)):
    items = await db.files.find(
        {"parent_type": parent_type, "parent_id": parent_id, "is_deleted": False},
        {"_id": 0},
    ).to_list(200)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@api.get("/files/{file_id}/download")
async def download_file(
    file_id: str,
    authorization: str = Header(default=None),
    auth: str = Query(default=None),
):
    # Support both Bearer header and ?auth= query param for <img src>
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(401, "Non autenticato")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(401, "Token non valido")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user or user.get("disabled"):
        raise HTTPException(401, "Utente non valido")

    rec = await db.files.find_one({"id": file_id, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File non trovato")
    try:
        data, ct = get_object(rec["storage_path"])
    except Exception as e:
        logger.error(f"download fail: {e}")
        raise HTTPException(500, "Errore download")
    return Response(content=data, media_type=rec.get("content_type") or ct)


@api.delete("/files/{file_id}")
async def soft_delete_file(file_id: str, user: dict = Depends(get_current_user)):
    rec = await db.files.find_one({"id": file_id, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "File non trovato")
    perm_map = {"orders": "orders", "customers": "customers", "invoices": "invoices", "products": "products"}
    if not has_permission(user, perm_map.get(rec["parent_type"], "orders"), "edit"):
        raise HTTPException(403, "Permesso negato")
    await db.files.update_one({"id": file_id}, {"$set": {"is_deleted": True, "deleted_at": utcnow_iso()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# COUNTERS — auto-numbering for invoices / preventivi
# ---------------------------------------------------------------------------
async def next_counter(key: str) -> int:
    res = await db.counters.find_one_and_update(
        {"_id": key},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True,
    )
    return res["value"] if res else 1


@api.post("/invoices/next-number")
async def invoice_next_number(kind: str = Query("preventivo"), _: dict = Depends(require_perm("invoices", "edit"))):
    """Returns the next available document number for the current year, format: P-2026-0001 / F-2026-0001"""
    year = utcnow().year
    prefix = "F" if kind == "fattura" else "P"
    key = f"{prefix}-{year}"
    n = await next_counter(key)
    return {"number": f"{prefix}-{year}-{n:04d}"}


# ---------------------------------------------------------------------------
# PRODUCT EXTRAS — categories + SKU generator
# ---------------------------------------------------------------------------
@api.get("/products/categories")
async def list_product_categories(_: dict = Depends(require_perm("products", "view"))):
    """Distinct categories used in products (alphabetical)."""
    cats = await db.products.distinct("category")
    cats = sorted({c for c in cats if isinstance(c, str) and c.strip()})
    return {"categories": cats}


def _sku_prefix_from_text(text: str) -> str:
    """Generate a 5-letter uppercase prefix from text (drop vowels except first, then take first 5)."""
    s = "".join(ch for ch in (text or "").upper() if ch.isalpha())
    if not s:
        return "PROD0"
    head = s[0]
    rest = "".join(ch for ch in s[1:] if ch not in "AEIOU")
    candidate = (head + rest) if len(head + rest) >= 5 else (head + rest + s[1:])
    candidate = candidate.replace(" ", "")
    candidate = (candidate + "XXXXX")[:5]
    return candidate.upper()


@api.post("/products/next-sku")
async def next_product_sku(
    category: str = Query(..., min_length=1),
    _: dict = Depends(require_perm("products", "edit")),
):
    prefix = _sku_prefix_from_text(category)
    key = f"sku_{prefix}"
    n = await next_counter(key)
    return {"sku": f"{prefix}{n:05d}", "prefix": prefix, "next_number": n}


# ---------------------------------------------------------------------------
# ADMIN: reset data (DANGEROUS — keeps users only)
# ---------------------------------------------------------------------------
@api.post("/admin/reset-data")
async def reset_data(payload: dict, _: dict = Depends(require_admin)):
    """Wipe operational collections. Required body: {confirm: 'RESET'}.
    Optional: keep=[<collection>, ...] to preserve specific data.
    """
    if (payload or {}).get("confirm") != "RESET":
        raise HTTPException(400, "Conferma mancante (confirm:RESET)")
    keep = set((payload or {}).get("keep") or [])
    targets = [
        "customers", "products", "materials", "orders",
        "invoices", "calendar_events", "sales", "files", "counters",
    ]
    summary = {}
    for c in targets:
        if c in keep:
            summary[c] = "kept"
            continue
        res = await db[c].delete_many({})
        summary[c] = res.deleted_count
    return {"ok": True, "deleted": summary}


# ---------------------------------------------------------------------------
# CUSTOMER DETAIL (timeline)
# ---------------------------------------------------------------------------
@api.get("/customers/{customer_id}/detail")
async def customer_detail(customer_id: str, user: dict = Depends(require_perm("customers", "view"))):
    cust = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not cust:
        raise HTTPException(404, "Cliente non trovato")
    # find orders, invoices, sales by customer_id or matching name
    name = cust.get("name")
    orders = await db.orders.find(
        {"$or": [{"customer_id": customer_id}, {"customer_name": name}]}, {"_id": 0},
    ).to_list(500)
    invoices = await db.invoices.find(
        {"$or": [{"customer_id": customer_id}, {"customer_name": name}]}, {"_id": 0},
    ).to_list(500)
    sales = await db.sales.find(
        {"customer_name": name}, {"_id": 0},
    ).to_list(500)
    total_spent = sum(o.get("total", 0) for o in orders if o.get("status") == "consegnato") \
                + sum(s.get("total", 0) for s in sales) \
                + sum(i.get("total", 0) for i in invoices if i.get("status") == "pagato")
    return {
        "customer": cust,
        "orders": sorted(orders, key=lambda x: x.get("created_at", ""), reverse=True),
        "invoices": sorted(invoices, key=lambda x: x.get("created_at", ""), reverse=True),
        "sales": sorted(sales, key=lambda x: x.get("created_at", ""), reverse=True),
        "stats": {
            "total_orders": len(orders),
            "total_invoices": len(invoices),
            "total_sales": len(sales),
            "total_spent": round(total_spent, 2),
        },
    }


# ---------------------------------------------------------------------------
# TELEGRAM (admin only)
# ---------------------------------------------------------------------------
@api.get("/telegram/status")
async def tg_status(_: dict = Depends(require_admin)):
    info = {}
    try:
        info = await tg_get_me()
    except Exception as e:
        return {"configured": False, "error": str(e)}
    cfg = await db.settings.find_one({"_id": "telegram"}) or {}
    return {
        "configured": True,
        "bot": info.get("result"),
        "chat_id": cfg.get("chat_id"),
        "chat_title": cfg.get("chat_title"),
        "daily_summary_enabled": cfg.get("daily_summary_enabled", True),
        "schedule": f"{os.environ.get('NOTIFICATION_TIME','09:30')} {os.environ.get('NOTIFICATION_TIMEZONE','Europe/Rome')}",
    }


@api.get("/telegram/discover")
async def tg_discover(_: dict = Depends(require_admin)):
    chats = await tg_get_updates()
    return {"chats": chats}


class TelegramConfigBody(BaseModel):
    chat_id: Optional[str] = None
    chat_title: Optional[str] = None
    daily_summary_enabled: Optional[bool] = None


@api.patch("/telegram/config")
async def tg_set_config(body: TelegramConfigBody, _: dict = Depends(require_admin)):
    upd: Dict[str, Any] = {}
    if body.chat_id is not None:
        upd["chat_id"] = body.chat_id
    if body.chat_title is not None:
        upd["chat_title"] = body.chat_title
    if body.daily_summary_enabled is not None:
        upd["daily_summary_enabled"] = body.daily_summary_enabled
    if not upd:
        cfg = await db.settings.find_one({"_id": "telegram"}) or {}
        return {k: v for k, v in cfg.items() if k != "_id"}
    upd["updated_at"] = utcnow_iso()
    await db.settings.update_one({"_id": "telegram"}, {"$set": upd}, upsert=True)
    cfg = await db.settings.find_one({"_id": "telegram"})
    return {k: v for k, v in (cfg or {}).items() if k != "_id"}


@api.post("/telegram/test")
async def tg_test(_: dict = Depends(require_admin)):
    cfg = await db.settings.find_one({"_id": "telegram"}) or {}
    chat_id = cfg.get("chat_id")
    if not chat_id:
        raise HTTPException(400, "chat_id non configurato")
    text = ("✨ <b>Test notifica</b>\n"
            "Se vedi questo messaggio, le notifiche del Gestionale "
            "La Crafteria Nerd sono attive!\n\n"
            "🐉 Buon lavoro in bottega!")
    try:
        await tg_send(chat_id, text)
    except Exception as e:
        raise HTTPException(500, f"Invio fallito: {e}")
    return {"ok": True}


@api.post("/telegram/send-summary-now")
async def tg_send_now(_: dict = Depends(require_admin)):
    cfg = await db.settings.find_one({"_id": "telegram"}) or {}
    chat_id = cfg.get("chat_id")
    if not chat_id:
        raise HTTPException(400, "chat_id non configurato")
    text = await build_evening_summary(db)
    try:
        await tg_send(chat_id, text)
    except Exception as e:
        raise HTTPException(500, f"Invio fallito: {e}")
    return {"ok": True}


@api.post("/telegram/setup-webhook")
async def tg_setup_webhook(request: Request, public_url: str = Query(default=""), _: dict = Depends(require_admin)):
    """Configura il webhook Telegram per ricevere comandi in tempo reale.
    Usa public_url se fornito, altrimenti tenta il base_url della request (deve essere HTTPS)."""
    base = (public_url or "").rstrip("/")
    if not base:
        base = str(request.base_url).rstrip("/")
        # Force https
        if base.startswith("http://"):
            base = "https://" + base[len("http://"):]
    if not WEBHOOK_SECRET:
        raise HTTPException(400, "TELEGRAM_WEBHOOK_SECRET non configurato")
    url = f"{base}/api/telegram/webhook/{WEBHOOK_SECRET}"
    res = await tg_set_webhook(url)
    await tg_set_commands()
    return {"webhook_url": url, "telegram_response": res}


@api.post("/telegram/delete-webhook")
async def tg_remove_webhook(_: dict = Depends(require_admin)):
    res = await tg_delete_webhook()
    return res


@api.get("/telegram/webhook-info")
async def tg_webhook_info(_: dict = Depends(require_admin)):
    return await tg_get_webhook_info()


@api.post("/telegram/webhook/{secret}")
async def tg_webhook(secret: str, request: Request):
    """Endpoint pubblico chiamato da Telegram (validato via secret in URL)."""
    if not WEBHOOK_SECRET or secret != WEBHOOK_SECRET:
        raise HTTPException(403, "Invalid webhook secret")
    try:
        update = await request.json()
    except Exception:
        return {"ok": False}
    try:
        await tg_handle_update(db, update)
    except Exception as e:
        logger.error(f"webhook handler error: {e}")
    return {"ok": True}


# ---------------------------------------------------------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
