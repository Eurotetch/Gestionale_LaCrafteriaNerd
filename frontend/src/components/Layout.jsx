import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { NAV, AUTH } from "@/constants/testIds";
import {
  LayoutDashboard, ClipboardList, Users, Package, Boxes,
  Receipt, Calendar as CalendarIcon, Wallet, BarChart3, ShieldCheck,
  LogOut, Menu, X, Sparkles, Settings as SettingsIcon
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { key: "dashboard", to: "/", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { key: "pos",       to: "/cassa", label: "Cassa / POS", icon: Wallet, module: "pos" },
  { key: "orders",    to: "/ordini", label: "Ordini & Commesse", icon: ClipboardList, module: "orders" },
  { key: "customers", to: "/clienti", label: "Clienti", icon: Users, module: "customers" },
  { key: "products",  to: "/prodotti", label: "Catalogo", icon: Package, module: "products" },
  { key: "inventory", to: "/magazzino", label: "Magazzino", icon: Boxes, module: "inventory" },
  { key: "invoices",  to: "/fatture", label: "Preventivi & Fatture", icon: Receipt, module: "invoices" },
  { key: "calendar",  to: "/calendario", label: "Calendario", icon: CalendarIcon, module: "calendar" },
  { key: "reports",   to: "/report", label: "Report", icon: BarChart3, module: "reports" },
  { key: "users",     to: "/utenti", label: "Utenti & Permessi", icon: ShieldCheck, module: "users", adminOnly: true },
  { key: "settings",  to: "/impostazioni", label: "Impostazioni", icon: SettingsIcon, module: "settings", adminOnly: true },
];

export default function Layout({ children }) {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const visible = NAV_ITEMS.filter((it) => {
    if (it.adminOnly) return user?.role === "admin";
    return can(it.module, "view");
  });

  return (
    <div className="min-h-screen gradient-warm flex flex-col md:flex-row">
      {/* Mobile topbar */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-border/60 bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <img src="https://www.lacrafterianerd.com/img/site/Draghetto_logo.png" alt="logo" className="h-9 w-9" />
          <span className="font-extrabold tracking-tight">La Crafteria Nerd</span>
        </div>
        <button onClick={() => setOpen(!open)} className="p-2 rounded-xl bg-muted" data-testid="mobile-menu-toggle">
          {open ? <X size={20}/> : <Menu size={20}/>}
        </button>
      </header>

      {/* Sidebar */}
      <aside
        data-testid={NAV.sidebar}
        className={cn(
          "md:flex md:w-72 md:flex-col md:sticky md:top-0 md:h-screen",
          "bg-card/70 backdrop-blur border-r border-border/60 p-5 flex-col gap-5",
          open ? "flex" : "hidden md:flex"
        )}
      >
        {/* Brand */}
        <button
          data-testid={NAV.brand}
          onClick={() => { navigate("/"); setOpen(false); }}
          className="flex items-center gap-3 px-2 py-2 rounded-2xl hover:bg-muted/50 transition-all text-left"
        >
          <img src="https://www.lacrafterianerd.com/img/site/Draghetto_logo.png" alt="Draghetto" className="h-12 w-12" />
          <div>
            <div className="font-extrabold text-lg leading-none tracking-tight">La Crafteria Nerd</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles size={12} className="text-primary" /> Gestionale
            </div>
          </div>
        </button>

        {/* Nav */}
        <nav className="flex-1 flex flex-col gap-1 overflow-y-auto scrollbar-soft">
          {visible.map((it) => {
            const Icon = it.icon;
            return (
              <NavLink
                key={it.key}
                to={it.to}
                end={it.to === "/"}
                data-testid={NAV.link(it.key)}
                onClick={() => setOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all",
                  "hover:bg-muted/70",
                  isActive ? "bg-primary text-primary-foreground crafteria-shadow" : "text-foreground/70"
                )}
              >
                <Icon size={18}/>
                <span>{it.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User card */}
        <div className="rounded-2xl p-3 bg-muted/60 border border-border/50" data-testid={NAV.userMenu}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold">
              {(user?.name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{user?.name}</div>
              <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
            </div>
            <button
              onClick={logout}
              data-testid={AUTH.logoutBtn}
              title="Esci"
              className="p-2 rounded-xl hover:bg-background transition-colors"
            >
              <LogOut size={16}/>
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 max-w-[1600px] mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
