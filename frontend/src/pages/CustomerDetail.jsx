import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { ArrowLeft, Mail, Phone, MapPin, Package, Receipt, Wallet, Sparkles } from "lucide-react";
import { formatEUR, formatDate, statusMeta, techMeta } from "@/lib/utils";
import Attachments from "@/components/Attachments";
import { useAuth } from "@/context/AuthContext";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["customer-detail", id],
    queryFn: async () => (await api.get(`/customers/${id}/detail`)).data,
    refetchInterval: 5000,
  });

  if (isLoading || !data) return <div className="text-muted-foreground">Caricamento…</div>;
  const { customer, orders, invoices, sales, stats } = data;

  // Merge timeline
  const timeline = [
    ...orders.map((o) => ({ kind: "ordine", date: o.created_at, ...o })),
    ...invoices.map((i) => ({ kind: i.kind || "preventivo", date: i.created_at, ...i })),
    ...sales.map((s) => ({ kind: "vendita", date: s.created_at, ...s })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div className="space-y-6" data-testid="customer-detail-root">
      <Link to="/clienti" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14}/> Torna ai clienti
      </Link>

      <div className="crafteria-card p-6">
        <div className="flex items-start gap-4">
          <div className="h-20 w-20 rounded-3xl bg-primary text-primary-foreground grid place-items-center text-4xl font-extrabold">
            {(customer.name || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl sm:text-4xl">{customer.name}</h1>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {customer.email && <span className="inline-flex items-center gap-1.5"><Mail size={14}/> {customer.email}</span>}
              {customer.phone && <span className="inline-flex items-center gap-1.5"><Phone size={14}/> {customer.phone}</span>}
              {customer.address && <span className="inline-flex items-center gap-1.5"><MapPin size={14}/> {customer.address}</span>}
            </div>
            {customer.notes && <p className="mt-3 text-sm text-foreground/80 italic">{customer.notes}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <KPI label="Fatturato" value={formatEUR(stats.total_spent)} icon={Sparkles} accent="bg-accent/15 text-accent"/>
          <KPI label="Ordini" value={stats.total_orders} icon={Package} accent="bg-primary/20 text-primary-foreground"/>
          <KPI label="Fatture" value={stats.total_invoices} icon={Receipt} accent="bg-secondary/20 text-secondary"/>
          <KPI label="Vendite POS" value={stats.total_sales} icon={Wallet} accent="bg-muted text-foreground"/>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 crafteria-card p-6">
          <h2 className="text-xl font-extrabold mb-3">⏳ Timeline attività</h2>
          {timeline.length === 0 && (
            <div className="text-center text-muted-foreground py-10">Nessuna attività registrata.</div>
          )}
          <ol className="relative border-l-2 border-border ml-3 space-y-4">
            {timeline.slice(0, 50).map((ev, i) => <TimelineRow key={i} ev={ev}/>)}
          </ol>
        </div>

        <div className="space-y-4">
          {can("customers", "edit") && (
            <Attachments parentType="customers" parentId={customer.id} canEdit={can("customers", "edit")}/>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ ev }) {
  if (ev.kind === "ordine") {
    const s = statusMeta(ev.status);
    const t = techMeta(ev.technique);
    return (
      <li className="ml-4">
        <span className="absolute -left-[7px] h-3 w-3 rounded-full bg-primary"/>
        <div className="text-xs text-muted-foreground">{formatDate(ev.date)} · ORDINE</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-bold">{ev.title}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.color}`}>{t.label}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
        </div>
        <div className="text-sm">{formatEUR(ev.total || 0)}</div>
      </li>
    );
  }
  if (ev.kind === "fattura" || ev.kind === "preventivo") {
    return (
      <li className="ml-4">
        <span className="absolute -left-[7px] h-3 w-3 rounded-full bg-secondary"/>
        <div className="text-xs text-muted-foreground">{formatDate(ev.date)} · {ev.kind?.toUpperCase()}</div>
        <div className="font-bold">{ev.number || "—"} — {formatEUR(ev.total || 0)}</div>
        <div className="text-xs text-muted-foreground capitalize">stato: {ev.status}</div>
      </li>
    );
  }
  // vendita
  return (
    <li className="ml-4">
      <span className="absolute -left-[7px] h-3 w-3 rounded-full bg-accent"/>
      <div className="text-xs text-muted-foreground">{formatDate(ev.date)} · VENDITA CASSA</div>
      <div className="font-bold">{formatEUR(ev.total || 0)} — {ev.payment_method}</div>
      <div className="text-xs text-muted-foreground">{(ev.items || []).map((i) => i.name).join(", ")}</div>
    </li>
  );
}

function KPI({ label, value, icon: Icon, accent }) {
  return (
    <div className={`rounded-2xl p-4 ${accent}`}>
      <div className="flex items-center gap-2 opacity-80">
        <Icon size={14}/>
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
    </div>
  );
}
