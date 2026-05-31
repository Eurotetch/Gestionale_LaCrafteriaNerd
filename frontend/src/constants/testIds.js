// Centralised data-testid registry
export const AUTH = {
  emailInput: "login-email-input",
  passwordInput: "login-password-input",
  confirmPasswordInput: "setup-confirm-password-input",
  loginBtn: "login-submit-btn",
  setupBtn: "setup-password-submit-btn",
  logoutBtn: "logout-btn",
  errorAlert: "auth-error-alert",
};

export const NAV = {
  sidebar: "main-sidebar",
  link: (key) => `nav-link-${key}`,
  brand: "sidebar-brand",
  userMenu: "sidebar-user-menu",
};

export const DASHBOARD = {
  root: "dashboard-root",
  revenueMonth: "stat-revenue-month",
  revenueToday: "stat-revenue-today",
  ordersTotal: "stat-orders-total",
  lowStock: "stat-low-stock",
};

export const ORDERS = {
  root: "orders-root",
  addBtn: "add-order-btn",
  saveBtn: "save-order-btn",
  card: (id) => `order-card-${id}`,
  column: (status) => `kanban-col-${status}`,
};

export const CUSTOMERS = { root: "customers-root", addBtn: "add-customer-btn", saveBtn: "save-customer-btn" };
export const PRODUCTS  = { root: "products-root",  addBtn: "add-product-btn",  saveBtn: "save-product-btn" };
export const INVENTORY = { root: "inventory-root", addBtn: "add-material-btn", saveBtn: "save-material-btn" };
export const INVOICES  = { root: "invoices-root",  addBtn: "add-invoice-btn",  saveBtn: "save-invoice-btn" };
export const CALENDAR  = { root: "calendar-root",  addBtn: "add-event-btn",    saveBtn: "save-event-btn" };
export const POS       = { root: "pos-root", checkoutBtn: "pos-checkout-btn", clearBtn: "pos-clear-btn" };
export const REPORTS   = { root: "reports-root" };
export const USERS     = { root: "users-root", addBtn: "add-user-btn", saveBtn: "save-user-btn" };
