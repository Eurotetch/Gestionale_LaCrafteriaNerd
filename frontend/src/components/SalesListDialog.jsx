import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Undo2, X } from "lucide-react";
import { formatEUR, formatDateTime, techMeta } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const PAY_LABELS = {
  contanti: "💵 Contanti",
  carta: "💳 Carta/POS",
  bonifico: "🏦 Bonifico",
  paypal: "🅿️ PayPal",
  altro: "✨ Altro",
};

export default function SalesListDialog({ open, onOpenChange, period = "all", title = "Vendite" }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [filterPayment, setFilterPayment] = useState("");
  const [filterTech, setFilterTech] = useState("");
  const [filterReturned, setFilterReturned] = useState("active"); // all|active|returned
  const [sortBy, setSortBy] = useState("date_desc");
  const [search, setSearch] = useState("");

  const { data: sales = [] } = useQuery({
    queryKey: ["sales", period],
    queryFn: async () => (await api.get("/sales", { params: { period } })).data,
    refetchInterval: open ? 3000 : false,
    enabled: open,
  });

  const setReturned = useMutation({
    mutationFn: async ({ id, is_returned }) =>
      (await api.patch(`/sales/${id}`, { is_returned })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Aggiornato");
    },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/sales/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Vendita eliminata");
    },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const filtered = useMemo(() => {
    let out = sales.slice();
    if (filterPayment) out = out.filter((s) => (s.payment_method || "contanti") === filterPayment);
    if (filterTech) {
      out = out.filter((s) => (s.items || []).some((it) => {
        if (!it.product_id) return filterTech === "Libera";
        return false; // can't link product technique here without products fetch
      }));
    }
    if (filterReturned === "active") out = out.filter((s) => !s.is_returned);
    else if (filterReturned === "returned") out = out.filter((s) => s.is_returned);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((s) =>
        (s.customer_name || "").toLowerCase().includes(q) ||
        (s.items || []).some((it) => (it.name || "").toLowerCase().includes(q))
      );
    }
    const cmp = {
      date_desc: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
      date_asc:  (a, b) => (a.created_at || "").localeCompare(b.created_at || ""),
      total_desc:(a, b) => (b.total || 0) - (a.total || 0),
      total_asc: (a, b) => (a.total || 0) - (b.total || 0),
      customer:  (a, b) => (a.customer_name || "").localeCompare(b.customer_name || ""),
      payment:   (a, b) => (a.payment_method || "").localeCompare(b.payment_method || ""),
    }[sortBy];
    if (cmp) out.sort(cmp);
    return out;
  }, [sales, filterPayment, filterTech, filterReturned, sortBy, search]);

  const totalActive = filtered.filter((s) => !s.is_returned).reduce((sum, s) => sum + (s.total || 0), 0);
  const totalReturned = filtered.filter((s) => s.is_returned).reduce((sum, s) => sum + (s.total || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {filtered.length} vendite · Netto incassato <b>{formatEUR(totalActive)}</b>
            {totalReturned > 0 && <span className="text-muted-foreground"> · resi {formatEUR(totalReturned)}</span>}
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select className="crafteria-input text-sm" value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}>
            <option value="">💳 Tutti i metodi</option>
            {Object.entries(PAY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="crafteria-input text-sm" value={filterReturned} onChange={(e) => setFilterReturned(e.target.value)}>
            <option value="active">✅ Solo valide</option>
            <option value="returned">↩️ Solo resi</option>
            <option value="all">📋 Tutte (con resi)</option>
          </select>
          <select className="crafteria-input text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date_desc">📅 Più recenti</option>
            <option value="date_asc">📅 Meno recenti</option>
            <option value="total_desc">💰 Importo ↓</option>
            <option value="total_asc">💰 Importo ↑</option>
            <option value="customer">👤 Cliente A-Z</option>
            <option value="payment">💳 Metodo</option>
          </select>
          <input className="crafteria-input text-sm" placeholder="Cerca cliente/voce…" value={search} onChange={(e) => setSearch(e.target.value)}/>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 font-bold">Data/ora</th>
                <th className="px-3 py-2 font-bold">Voci</th>
                <th className="px-3 py-2 font-bold">Cliente</th>
                <th className="px-3 py-2 font-bold">Metodo</th>
                <th className="px-3 py-2 font-bold text-right">Totale</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className={`border-t border-border ${s.is_returned ? "opacity-60" : ""}`} data-testid={`sale-row-${s.id}`}>
                  <td className={`px-3 py-2 whitespace-nowrap ${s.is_returned ? "line-through" : ""}`}>{formatDateTime(s.created_at)}</td>
                  <td className={`px-3 py-2 ${s.is_returned ? "line-through" : ""}`}>
                    {(s.items || []).slice(0, 3).map((it, i) => (
                      <span key={i} className="inline-block mr-2">
                        {it.name} <span className="text-muted-foreground">×{it.quantity}</span>
                      </span>
                    ))}
                    {(s.items || []).length > 3 && <span className="text-xs text-muted-foreground">+{s.items.length - 3}</span>}
                  </td>
                  <td className={`px-3 py-2 ${s.is_returned ? "line-through" : ""}`}>{s.customer_name || "—"}</td>
                  <td className={`px-3 py-2 ${s.is_returned ? "line-through" : ""}`}>{PAY_LABELS[s.payment_method] || s.payment_method}</td>
                  <td className={`px-3 py-2 text-right font-bold ${s.is_returned ? "line-through text-muted-foreground" : ""}`}>{formatEUR(s.total)}</td>
                  <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                    {can("pos", "edit") && (
                      <button
                        onClick={() => setReturned.mutate({ id: s.id, is_returned: !s.is_returned })}
                        title={s.is_returned ? "Annulla reso" : "Segna come reso"}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                          s.is_returned ? "bg-accent/20 text-accent" : "bg-muted hover:bg-muted/70"
                        }`}
                        data-testid={`sale-return-${s.id}`}>
                        <Undo2 size={12}/>{s.is_returned ? "Ripristina" : "Reso"}
                      </button>
                    )}
                    {can("pos", "delete") && (
                      <button
                        onClick={() => window.confirm("Eliminare definitivamente?") && del.mutate(s.id)}
                        title="Elimina"
                        className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10"
                        data-testid={`sale-delete-${s.id}`}>
                        <Trash2 size={12}/>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">Nessuna vendita corrisponde ai filtri ✨</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
