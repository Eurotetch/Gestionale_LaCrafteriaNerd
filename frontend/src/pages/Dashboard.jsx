import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { DASHBOARD } from "@/constants/testIds";
import { Wallet, ClipboardList, Boxes, Users, Calendar as CalendarIcon, Sparkles, AlertTriangle, Clock, ShoppingBag } from "lucide-react";
import { formatEUR, formatDate } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import SalesListDialog from "@/components/SalesListDialog";

const STATUS_META = {
  nuovo:           { label: "Nuovi",          color: "bg-secondary/20 text-secondary" },
  in_lavorazione:  { label: "In lavorazione", color: "bg-primary/30 text-primary-foreground" },
  pronto:          { label: "Pronti",         color: "bg-accent/20 text-accent" },
  consegnato:      { label: "Consegnati",     color: "bg-muted text-foreground/70" },
  annullato:       { label: "Annullati",      color: "bg-destructive/10 text-destructive" },
};

function AlertCard({ tone, icon: Icon, title, count, link, testId, children }) {
  const toneCls = {
    destructive: "bg-destructive/10 border-destructive/40 text-destructive",
    primary: "bg-primary/15 border-primary/40 text-foreground",
    secondary: "bg-secondary/15 border-secondary/40 text-secondary",
  }[tone];
  return (
    <Link to={link} data-testid={testId}
          className={`block rounded-2xl border p-4 ${toneCls} hover:brightness-95 transition-all crafteria-shadow`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-bold"><Icon size={16}/> {title}</div>
        <span className="text-2xl font-extrabold">{count}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </Link>
  );
}

function StatCard({ icon: Icon, label, value, hint, color, testId, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      data-testid={testId}
      onClick={onClick}
      className={`text-left crafteria-card p-6 flex items-start gap-4 transition-all w-full ${
        onClick ? "hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/30 cursor-pointer" : ""
      }`}>
      <div className={`h-12 w-12 rounded-2xl grid place-items-center shrink-0 ${color}`}>
        <Icon size={22}/>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-0.5">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </div>
    </Tag>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [salesPeriod, setSalesPeriod] = useState(null);  // null | "today" | "month" | "all"

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/dashboard/stats")).data,
    refetchInterval: 3000,
  });

  const stats = data || {};
  const orders = stats.orders_by_status || {};
  const activeOrders = (orders.nuovo || 0) + (orders.in_lavorazione || 0) + (orders.pronto || 0);

  const periodTitles = {
    today: "Vendite di oggi",
    month: "Vendite del mese",
    all: "Tutte le vendite",
  };

  return (
    <div data-testid={DASHBOARD.root} className="space-y-8">
      {/* Hero greeting */}
      <div className="flex items-end gap-4 sm:gap-6">
        <img src="https://www.lacrafterianerd.com/img/site/Lala.png" alt="Lala"
             className="h-20 sm:h-24 hidden sm:block drop-shadow"/>
        <div className="flex-1">
          <div className="text-sm uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
            <Sparkles size={14}/> dashboard
          </div>
          <h1 className="text-3xl sm:text-5xl">Ciao {user?.name?.split(" ")[0] || "Lala"}! 💛</h1>
          <p className="text-muted-foreground mt-1">Aggiornato in tempo reale ogni 3 secondi.</p>
        </div>
      </div>

      {/* Notification banners */}
      {((stats.overdue_orders || []).length > 0 || (stats.due_soon_orders || []).length > 0 || (stats.overdue_invoices || []).length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="dashboard-alerts">
          {(stats.overdue_orders || []).length > 0 && (
            <AlertCard tone="destructive" icon={AlertTriangle} title="Ordini in ritardo"
                       count={stats.overdue_orders.length} link="/ordini" testId="alert-overdue-orders">
              {stats.overdue_orders.slice(0, 3).map((o) => (
                <div key={o.id} className="text-xs truncate">📋 {o.title} — <span className="font-semibold">{formatDate(o.due_date)}</span></div>
              ))}
            </AlertCard>
          )}
          {(stats.due_soon_orders || []).length > 0 && (
            <AlertCard tone="primary" icon={Clock} title="Ordini in scadenza (7gg)"
                       count={stats.due_soon_orders.length} link="/ordini" testId="alert-due-soon">
              {stats.due_soon_orders.slice(0, 3).map((o) => (
                <div key={o.id} className="text-xs truncate">📋 {o.title} — <span className="font-semibold">{formatDate(o.due_date)}</span></div>
              ))}
            </AlertCard>
          )}
          {(stats.overdue_invoices || []).length > 0 && (
            <AlertCard tone="secondary" icon={AlertTriangle} title="Fatture scadute"
                       count={stats.overdue_invoices.length} link="/fatture" testId="alert-overdue-invoices">
              {stats.overdue_invoices.slice(0, 3).map((i) => (
                <div key={i.id} className="text-xs truncate">🧾 {i.number || "—"} {i.customer_name} — {formatEUR(i.total)}</div>
              ))}
            </AlertCard>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          testId={DASHBOARD.revenueToday}
          icon={Wallet} label="Incasso oggi"
          value={isLoading ? "…" : formatEUR(stats.revenue_today || 0)}
          hint={`${stats.sales_count_today || 0} vendite oggi — clicca per dettaglio`}
          color="bg-primary/20 text-primary-foreground"
          onClick={() => setSalesPeriod("today")}
        />
        <StatCard
          testId={DASHBOARD.revenueMonth}
          icon={Wallet} label="Incasso del mese"
          value={isLoading ? "…" : formatEUR(stats.revenue_month || 0)}
          hint="Clicca per vedere il dettaglio"
          color="bg-accent/15 text-accent"
          onClick={() => setSalesPeriod("month")}
        />
        <StatCard
          testId="stat-sales-total"
          icon={ShoppingBag} label="Vendite totali"
          value={isLoading ? "…" : (stats.sales_count_total ?? 0)}
          hint="Storia completa cassa"
          color="bg-secondary/20 text-secondary"
          onClick={() => setSalesPeriod("all")}
        />
        <StatCard
          testId={DASHBOARD.ordersTotal}
          icon={ClipboardList} label="Commesse aperte"
          value={isLoading ? "…" : activeOrders}
          hint={`Totali a sistema: ${stats.orders_total || 0}`}
          color="bg-primary/20 text-primary-foreground"
          onClick={() => navigate("/ordini")}
        />
        <StatCard
          testId={DASHBOARD.lowStock}
          icon={Boxes} label="Materiali sotto soglia"
          value={isLoading ? "…" : (stats.low_stock_count || 0)}
          hint="Clicca per il magazzino"
          color="bg-destructive/10 text-destructive"
          onClick={() => navigate("/magazzino")}
        />
      </div>

      {/* Two-column: Orders breakdown + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="crafteria-card p-6 lg:col-span-2">
          <h2 className="text-xl mb-4">📋 Stato delle commesse</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(STATUS_META).map(([k, m]) => (
              <Link key={k} to="/ordini" className={`rounded-2xl p-4 ${m.color} hover:brightness-95 block`}>
                <div className="text-3xl font-extrabold">{orders[k] || 0}</div>
                <div className="text-xs font-medium mt-1">{m.label}</div>
              </Link>
            ))}
          </div>

          {(stats.low_stock_items || []).length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="font-bold mb-2">⚠️ Materiali da riordinare</h3>
              <ul className="space-y-1.5">
                {stats.low_stock_items.map((m) => (
                  <li key={m.id} className="flex justify-between text-sm">
                    <span>{m.name}</span>
                    <span className="text-destructive font-semibold">{m.stock} / min {m.min_stock} {m.unit}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="crafteria-card p-6">
          <h2 className="text-xl mb-4 flex items-center gap-2"><CalendarIcon size={18}/> Prossimi appuntamenti</h2>
          {(stats.upcoming_events || []).length === 0 ? (
            <div className="text-center text-muted-foreground py-6">
              <img src="https://www.lacrafterianerd.com/img/site/Draghetto_logo.png" className="h-16 mx-auto opacity-60 mb-2" alt="" />
              Niente in agenda ✨
            </div>
          ) : (
            <ul className="space-y-3">
              {stats.upcoming_events.map((ev) => (
                <li key={ev.id}>
                  <button type="button"
                          className="w-full text-left rounded-xl bg-muted/40 p-3 hover:bg-muted/70 transition-colors"
                          onClick={() => navigate("/calendario", { state: { openDate: ev.start, eventId: ev.id } })}>
                    <div className="font-semibold">{ev.title}</div>
                    <div className="text-xs text-muted-foreground">{ev.start?.slice(0, 16).replace("T", " ")}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4">
            <Users size={12}/> {stats.customers_count || 0} clienti in anagrafica
          </div>
        </div>
      </div>

      <SalesListDialog
        open={!!salesPeriod}
        onOpenChange={(v) => !v && setSalesPeriod(null)}
        period={salesPeriod || "all"}
        title={periodTitles[salesPeriod] || "Vendite"}
      />
    </div>
  );
}
