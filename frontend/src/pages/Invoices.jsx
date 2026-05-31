import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { INVOICES } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Search, FileText, Download, Hash } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatEUR, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { exportInvoicePDF } from "@/lib/pdfExport";

const KINDS = [
  { value: "preventivo", label: "📝 Preventivo" },
  { value: "fattura",    label: "🧾 Fattura" },
];
const STATUSES = [
  { value: "bozza",   label: "Bozza" },
  { value: "inviato", label: "Inviato" },
  { value: "pagato",  label: "Pagato" },
  { value: "scaduto", label: "Scaduto" },
];

const empty = () => ({
  kind: "preventivo", number: "", customer_name: "", items: [{ name: "", quantity: 1, price: 0 }],
  subtotal: 0, vat_rate: 22, total: 0, status: "bozza",
  issue_date: new Date().toISOString().slice(0, 10), due_date: "", notes: "",
});

export default function InvoicesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState("");
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => (await api.get("/invoices")).data,
    refetchInterval: 3000,
  });

  const save = useMutation({
    mutationFn: async (o) => {
      const sub = (o.items || []).reduce((s, it) => s + (it.price || 0) * (it.quantity || 0), 0);
      const total = sub * (1 + (o.vat_rate || 0) / 100);
      const body = { ...o, subtotal: +sub.toFixed(2), total: +total.toFixed(2) };
      return o.id ? (await api.patch(`/invoices/${o.id}`, body)).data : (await api.post("/invoices", body)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); setOpen(false); toast.success("Salvato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/invoices/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); toast.success("Eliminato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const fetchNumber = async () => {
    try {
      const { data } = await api.post(`/invoices/next-number`, null, { params: { kind: edit.kind } });
      setEdit({ ...edit, number: data.number });
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const filtered = items.filter((p) => {
    const s = search.toLowerCase();
    if (filterKind && p.kind !== filterKind) return false;
    return !s || (p.customer_name || "").toLowerCase().includes(s) || (p.number || "").toLowerCase().includes(s);
  });

  const setItem = (i, k, v) => {
    const its = [...edit.items]; its[i] = { ...its[i], [k]: v }; setEdit({ ...edit, items: its });
  };
  const addItem = () => setEdit({ ...edit, items: [...edit.items, { name: "", quantity: 1, price: 0 }] });
  const rmItem = (i) => setEdit({ ...edit, items: edit.items.filter((_, idx) => idx !== i) });

  const livePreview = edit ? (() => {
    const sub = (edit.items || []).reduce((s, it) => s + (it.price || 0) * (it.quantity || 0), 0);
    const total = sub * (1 + (edit.vat_rate || 0) / 100);
    return { sub, total };
  })() : null;

  return (
    <div data-testid={INVOICES.root} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-secondary font-bold">amministrazione</div>
          <h1 className="text-3xl sm:text-4xl">Preventivi & Fatture 🧾</h1>
          <p className="text-muted-foreground mt-1">Crea, esporta in PDF brand, traccia gli stati.</p>
        </div>
        <div className="flex gap-2">
          <select className="crafteria-input" value={filterKind} onChange={(e) => setFilterKind(e.target.value)}>
            <option value="">Tutti</option>
            <option value="preventivo">Preventivi</option>
            <option value="fattura">Fatture</option>
          </select>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input className="crafteria-input pl-9 w-full sm:w-64" placeholder="Cerca…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {can("invoices", "edit") && (
            <button data-testid={INVOICES.addBtn} className="crafteria-btn-primary flex items-center gap-2" onClick={() => { setEdit(empty()); setOpen(true); }}>
              <Plus size={16}/> Nuovo
            </button>
          )}
        </div>
      </div>

      <div className="crafteria-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-5 py-3 font-semibold">Tipo</th>
                <th className="px-5 py-3 font-semibold">Numero</th>
                <th className="px-5 py-3 font-semibold">Cliente</th>
                <th className="px-5 py-3 font-semibold">Totale</th>
                <th className="px-5 py-3 font-semibold">Stato</th>
                <th className="px-5 py-3 font-semibold">Scadenza</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-5 py-3"><span className="inline-flex items-center gap-1.5"><FileText size={14}/> {p.kind === "fattura" ? "Fattura" : "Preventivo"}</span></td>
                  <td className="px-5 py-3 font-mono">{p.number || "—"}</td>
                  <td className="px-5 py-3">{p.customer_name}</td>
                  <td className="px-5 py-3 font-bold">{formatEUR(p.total)}</td>
                  <td className="px-5 py-3 capitalize"><span className="rounded-full text-xs font-semibold px-2.5 py-1 bg-muted">{p.status}</span></td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(p.due_date)}</td>
                  <td className="px-5 py-3 text-right space-x-1 whitespace-nowrap">
                    <button onClick={() => exportInvoicePDF(p)} className="p-2 rounded-lg hover:bg-accent/15 text-accent inline-flex" title="Scarica PDF" data-testid={`pdf-invoice-${p.id}`}>
                      <Download size={14}/>
                    </button>
                    {can("invoices", "edit") && (
                      <button onClick={() => { setEdit({ ...p }); setOpen(true); }} className="p-2 rounded-lg hover:bg-muted inline-flex" data-testid={`edit-invoice-${p.id}`}><Edit2 size={14}/></button>
                    )}
                    {can("invoices", "delete") && (
                      <button onClick={() => window.confirm("Eliminare?") && del.mutate(p.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive inline-flex" data-testid={`delete-invoice-${p.id}`}><Trash2 size={14}/></button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Nessun documento</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Modifica documento" : "Nuovo documento"}</DialogTitle>
            <DialogDescription className="sr-only">Compila il documento</DialogDescription>
          </DialogHeader>
          {edit && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <F label="Tipo">
                  <select className="crafteria-input w-full" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
                    {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </F>
                <F label="Numero">
                  <div className="flex gap-1">
                    <input className="crafteria-input w-full" value={edit.number || ""} onChange={(e) => setEdit({ ...edit, number: e.target.value })} placeholder="auto/manuale"/>
                    <button type="button" onClick={fetchNumber} className="px-2 rounded-xl bg-muted hover:bg-muted/70" title="Auto-genera"><Hash size={14}/></button>
                  </div>
                </F>
                <F label="Cliente *"><input className="crafteria-input w-full" value={edit.customer_name} onChange={(e) => setEdit({ ...edit, customer_name: e.target.value })}/></F>
                <F label="Data emissione"><input type="date" className="crafteria-input w-full" value={edit.issue_date || ""} onChange={(e) => setEdit({ ...edit, issue_date: e.target.value })}/></F>
                <F label="Scadenza"><input type="date" className="crafteria-input w-full" value={edit.due_date || ""} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })}/></F>
                <F label="Stato">
                  <select className="crafteria-input w-full" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </F>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">Voci</span>
                  <button onClick={addItem} className="text-sm text-accent font-semibold">+ aggiungi riga</button>
                </div>
                <div className="space-y-2">
                  {edit.items.map((it, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <input className="crafteria-input col-span-6" placeholder="Descrizione" value={it.name} onChange={(e) => setItem(i, "name", e.target.value)}/>
                      <input type="number" step="0.01" className="crafteria-input col-span-2" placeholder="Qty" value={it.quantity} onChange={(e) => setItem(i, "quantity", parseFloat(e.target.value || 0))}/>
                      <input type="number" step="0.01" className="crafteria-input col-span-3" placeholder="Prezzo" value={it.price} onChange={(e) => setItem(i, "price", parseFloat(e.target.value || 0))}/>
                      <button onClick={() => rmItem(i)} className="col-span-1 text-destructive">×</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <F label="IVA %"><input type="number" className="crafteria-input w-full" value={edit.vat_rate} onChange={(e) => setEdit({ ...edit, vat_rate: parseFloat(e.target.value || 0) })}/></F>
                <div className="sm:col-span-2 flex items-end justify-end gap-6 text-sm">
                  <div><div className="text-muted-foreground">Imponibile</div><div className="font-bold">{formatEUR(livePreview?.sub || 0)}</div></div>
                  <div><div className="text-muted-foreground">Totale</div><div className="text-xl font-extrabold text-accent">{formatEUR(livePreview?.total || 0)}</div></div>
                </div>
              </div>

              <F label="Note"><textarea rows={2} className="crafteria-input w-full mt-3" value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })}/></F>
            </>
          )}
          <DialogFooter className="gap-2">
            {edit?.id && (
              <button onClick={() => exportInvoicePDF(edit)} className="rounded-2xl bg-accent text-accent-foreground font-semibold px-4 py-2.5 hover:brightness-105 inline-flex items-center gap-2">
                <Download size={14}/> Esporta PDF
              </button>
            )}
            <button className="crafteria-btn-primary" data-testid={INVOICES.saveBtn} onClick={() => save.mutate(edit)}>Salva</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const F = ({ label, children }) => (
  <label className="block text-sm"><span className="block font-semibold mb-1">{label}</span>{children}</label>
);
