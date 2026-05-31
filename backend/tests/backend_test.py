"""
Backend tests for La Crafteria Nerd Gestionale.
Covers auth, users, CRUD modules, POS, dashboard, reports, permission enforcement.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crafteria-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "lacrafterianerd@gmail.com"
ADMIN_PASSWORD = "TestPass123!"


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    """Ensure admin has password TestPass123! and return its JWT."""
    # Check email
    r = session.post(f"{API}/auth/check-email", json={"email": ADMIN_EMAIL})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("exists") is True

    if data.get("requires_password_setup"):
        r2 = session.post(f"{API}/auth/setup-password",
                          json={"email": ADMIN_EMAIL, "new_password": ADMIN_PASSWORD})
        assert r2.status_code == 200, r2.text
        return r2.json()["token"]

    # password already set → login (try TestPass123!, else fail w/ clear msg)
    r3 = session.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r3.status_code != 200:
        pytest.skip(f"Admin password not TestPass123! and setup not required: {r3.text}")
    return r3.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def collab_user(session, admin_headers):
    """Create a collaborator with limited perms: only customers.view + orders.view."""
    email = f"TEST_collab_{uuid.uuid4().hex[:6]}@test.com"
    perms = {
        "customers": {"view": True, "edit": False, "delete": False},
        "orders":    {"view": True, "edit": False, "delete": False},
    }
    r = session.post(f"{API}/users", headers=admin_headers, json={
        "email": email,
        "name": "TEST Collaborator",
        "password": "CollabPass123!",
        "role": "collaborator",
        "permissions": perms,
        "grant_all": False,
    })
    assert r.status_code == 200, r.text
    user = r.json()
    # login
    r2 = session.post(f"{API}/auth/login", json={"email": email, "password": "CollabPass123!"})
    assert r2.status_code == 200, r2.text
    token = r2.json()["token"]
    yield {"id": user["id"], "email": email, "token": token,
           "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}}
    # cleanup
    session.delete(f"{API}/users/{user['id']}", headers=admin_headers)


# -----------------------------------------------------------------------------
# Health
# -----------------------------------------------------------------------------
def test_root_ok(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("ok") is True


# -----------------------------------------------------------------------------
# AUTH
# -----------------------------------------------------------------------------
class TestAuth:
    def test_check_email_admin_exists(self, session):
        r = session.post(f"{API}/auth/check-email", json={"email": ADMIN_EMAIL})
        assert r.status_code == 200
        data = r.json()
        assert data["exists"] is True
        assert "requires_password_setup" in data

    def test_check_email_unknown(self, session):
        r = session.post(f"{API}/auth/check-email", json={"email": "nope@nowhere.test"})
        assert r.status_code == 200
        assert r.json().get("exists") is False

    def test_login_wrong_password(self, session, admin_token):
        r = session.post(f"{API}/auth/login",
                         json={"email": ADMIN_EMAIL, "password": "WRONG_PW"})
        assert r.status_code == 401

    def test_login_correct(self, session, admin_token):
        r = session.post(f"{API}/auth/login",
                         json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        body = r.json()
        assert "token" in body and isinstance(body["token"], str)
        assert body["user"]["email"] == ADMIN_EMAIL
        assert body["user"]["role"] == "admin"
        assert "password_hash" not in body["user"]

    def test_me_with_token(self, session, admin_headers):
        r = session.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_without_token(self, session):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_setup_password_already_set_rejected(self, session):
        r = session.post(f"{API}/auth/setup-password",
                         json={"email": ADMIN_EMAIL, "new_password": "AnotherPass1!"})
        assert r.status_code == 400

    def test_change_password_and_revert(self, session, admin_headers):
        new_pw = "ChangedPass456!"
        r = session.post(f"{API}/auth/change-password", headers=admin_headers,
                         json={"current_password": ADMIN_PASSWORD, "new_password": new_pw})
        assert r.status_code == 200
        # login with new
        r2 = session.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": new_pw})
        assert r2.status_code == 200
        # revert
        new_headers = {"Authorization": f"Bearer {r2.json()['token']}",
                       "Content-Type": "application/json"}
        r3 = session.post(f"{API}/auth/change-password", headers=new_headers,
                          json={"current_password": new_pw, "new_password": ADMIN_PASSWORD})
        assert r3.status_code == 200


# -----------------------------------------------------------------------------
# USERS
# -----------------------------------------------------------------------------
class TestUsers:
    def test_list_users_admin(self, session, admin_headers):
        r = session.get(f"{API}/users", headers=admin_headers)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        assert any(u["email"] == ADMIN_EMAIL for u in users)

    def test_list_users_forbidden_for_non_admin(self, session, collab_user):
        r = session.get(f"{API}/users", headers=collab_user["headers"])
        assert r.status_code == 403

    def test_create_update_delete_collaborator(self, session, admin_headers):
        email = f"TEST_u_{uuid.uuid4().hex[:6]}@test.com"
        r = session.post(f"{API}/users", headers=admin_headers, json={
            "email": email, "name": "TEST U", "password": "Pwd12345!",
            "role": "collaborator", "grant_all": True,
        })
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        # patch: revoke grant_all, set custom perms + new password
        r2 = session.patch(f"{API}/users/{uid}", headers=admin_headers, json={
            "permissions": {"customers": {"view": True, "edit": True, "delete": False}},
            "new_password": "NewerPwd123!",
            "disabled": False,
        })
        assert r2.status_code == 200
        assert r2.json()["permissions"]["customers"]["edit"] is True
        # new password works
        rlog = session.post(f"{API}/auth/login", json={"email": email, "password": "NewerPwd123!"})
        assert rlog.status_code == 200
        # delete
        r3 = session.delete(f"{API}/users/{uid}", headers=admin_headers)
        assert r3.status_code == 200

    def test_cannot_delete_main_admin(self, session, admin_headers):
        users = session.get(f"{API}/users", headers=admin_headers).json()
        admin = next(u for u in users if u["email"] == ADMIN_EMAIL)
        r = session.delete(f"{API}/users/{admin['id']}", headers=admin_headers)
        assert r.status_code == 400


# -----------------------------------------------------------------------------
# CRUD modules — parameterized
# -----------------------------------------------------------------------------
@pytest.mark.parametrize("base,payload,update_field,update_value", [
    ("customers", {"name": "TEST_Cliente Pippo", "email": "pippo@test.com", "phone": "123"},
        "phone", "999"),
    ("products",  {"name": "TEST_Tazza 3D", "technique": "3D", "price": 12.5},
        "price", 14.0),
    ("materials", {"name": "TEST_Filamento PLA", "unit": "kg", "stock": 1, "min_stock": 2},
        "stock", 5),
    ("orders",    {"customer_name": "TEST Cliente", "title": "TEST Ordine",
                   "technique": "3D", "status": "nuovo", "total": 50.0}, "status", "in_lavorazione"),
    ("invoices",  {"kind": "preventivo", "customer_name": "TEST Cliente",
                   "items": [{"name": "Item", "quantity": 1, "price": 100}],
                   "subtotal": 100, "vat_rate": 22, "total": 122}, "status", "inviato"),
    ("calendar",  {"title": "TEST Evento", "start": "2026-02-01", "kind": "evento"},
        "title", "TEST Evento Aggiornato"),
])
def test_crud_module(session, admin_headers, base, payload, update_field, update_value):
    # list
    r = session.get(f"{API}/{base}", headers=admin_headers)
    assert r.status_code == 200 and isinstance(r.json(), list)
    # create
    r2 = session.post(f"{API}/{base}", headers=admin_headers, json=payload)
    assert r2.status_code == 200, r2.text
    item = r2.json()
    iid = item["id"]
    # get
    r3 = session.get(f"{API}/{base}/{iid}", headers=admin_headers)
    assert r3.status_code == 200
    # patch
    r4 = session.patch(f"{API}/{base}/{iid}", headers=admin_headers,
                       json={update_field: update_value})
    assert r4.status_code == 200
    assert r4.json()[update_field] == update_value
    # delete
    r5 = session.delete(f"{API}/{base}/{iid}", headers=admin_headers)
    assert r5.status_code == 200
    # 404 after delete
    r6 = session.get(f"{API}/{base}/{iid}", headers=admin_headers)
    assert r6.status_code == 404


# -----------------------------------------------------------------------------
# POS Sales
# -----------------------------------------------------------------------------
class TestPOS:
    def test_create_sale_autocomputes(self, session, admin_headers):
        payload = {
            "items": [
                {"name": "TEST P1", "quantity": 2, "price": 10},
                {"name": "TEST P2", "quantity": 1, "price": 5.5},
            ],
            "payment_method": "contanti",
            "discount": 0.5,
        }
        r = session.post(f"{API}/sales", headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        sale = r.json()
        assert sale["subtotal"] == 25.5
        assert sale["total"] == 25.0
        # list returns recent first
        r2 = session.get(f"{API}/sales", headers=admin_headers)
        assert r2.status_code == 200
        sales = r2.json()
        assert sales[0]["id"] == sale["id"]
        # cleanup
        session.delete(f"{API}/sales/{sale['id']}", headers=admin_headers)


# -----------------------------------------------------------------------------
# Dashboard & Reports
# -----------------------------------------------------------------------------
class TestDashboardReports:
    def test_dashboard_stats(self, session, admin_headers):
        r = session.get(f"{API}/dashboard/stats", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        for k in ("orders_by_status", "revenue_month", "revenue_today",
                  "low_stock_count", "customers_count", "upcoming_events"):
            assert k in data
        assert isinstance(data["orders_by_status"], dict)

    def test_reports_overview(self, session, admin_headers):
        r = session.get(f"{API}/reports/overview", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        for k in ("revenue_by_month", "by_technique", "top_customers"):
            assert k in data
            assert isinstance(data[k], list)


# -----------------------------------------------------------------------------
# Permission enforcement
# -----------------------------------------------------------------------------
class TestPermissions:
    def test_collab_can_view_customers(self, session, collab_user):
        r = session.get(f"{API}/customers", headers=collab_user["headers"])
        assert r.status_code == 200

    def test_collab_cannot_edit_orders(self, session, collab_user):
        r = session.post(f"{API}/orders", headers=collab_user["headers"],
                         json={"customer_name": "X", "title": "Y", "status": "nuovo"})
        assert r.status_code == 403

    def test_collab_cannot_view_products(self, session, collab_user):
        r = session.get(f"{API}/products", headers=collab_user["headers"])
        assert r.status_code == 403

    def test_admin_can_create_order(self, session, admin_headers):
        r = session.post(f"{API}/orders", headers=admin_headers,
                         json={"customer_name": "TEST adm", "title": "TEST adm",
                               "status": "nuovo"})
        assert r.status_code == 200
        # cleanup
        session.delete(f"{API}/orders/{r.json()['id']}", headers=admin_headers)
