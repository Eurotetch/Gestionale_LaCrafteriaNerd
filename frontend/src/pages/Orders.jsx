import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { ORDERS } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatEUR, formatDate, TECHNIQUES, STATUS_OPTIONS, statusMeta, techMeta } from "@/lib/utils";
import { toast } from "sonner";

const COLUMNS = STATUS_OPTIONS.filter((s) => s.value !== "annullato");

const emptyOrder = () => ({
  customer_name: "", title: "", description: "", technique: "3D",
  status: "nuovo", total: 0, deposit: 0, due_date: "", priority: "media",
});

export default function OrdersPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);

  const { data: orders = [] } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => (await api.get("/orders")).data,
    refetchInterval: 3000,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await api.get("/customers")).data,
    enabled: can("customers", "view"),
  });

  const save = useMutation({
    mutationFn: async (o) => {
      if (o.id) return (await api.patch(`/orders/${o.id}`, o)).data;
      return (await api.post("/orders", o)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); setOpen(false); toast.success("Ordine salvato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => (await api.patch(`/orders/${id}`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/orders/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); toast.success("Eliminato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const openNew = () => { setEdit(emptyOrder()); setOpen(true); };
  const openEdit = (o) => { setEdit({ ...o }); setOpen(true); };

  const filtered = orders.filter((o) => {
    const s = search.toLowerCase();
    return !s || o.title?.toLowerCase().includes(s) || o.customer_name?.toLowerCase().includes(s);
  });

  return (
    <div data-testid={ORDERS.root} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-primary font-bold">commesse</div>
          <h1 className="text-3xl sm:text-4xl">Ordini & Lavorazioni 📋</h1>
          <p className="text-muted-foreground mt-1">Trascina (mentalmente!) gli ordini tra le colonne per aggiornare lo stato.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input
              className="crafteria-input pl-9 w-full sm:w-64"
              placeholder="Cerca…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {can("orders", "edit") && (
            <button data-testid={ORDERS.addBtn} className="crafteria-btn-primary flex items-center gap-2" onClick={openNew}>
              <Plus size={16}/> Nuovo ordine
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 overflow-x-auto scrollbar-soft">
        {COLUMNS.map((col) => {
          const items = filtered.filter((o) => o.status === col.value);
          return (
            <div key={col.value} data-testid={ORDERS.column(col.value)}
                 className="rounded-3xl bg-muted/40 p-3 min-h-[60vh]">
              <div className="flex items-center justify-between px-2 py-2">
                <h3 className="font-extrabold flex items-center gap-2">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${col.color.split(' ')[0]}`}/>
                  {col.label}
                </h3>
                <span className="text-xs text-muted-foreground font-semibold">{items.length}</span>
              </div>
              <div className="flex flex-col gap-3 mt-2">
                {items.map((o) => {
                  const t = techMeta(o.technique);
                  return (
                    <div key={o.id} data-testid={ORDERS.card(o.id)}
                         className="crafteria-card p-4 hover:-translate-y-0.5 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold truncate">{o.title}</div>
                          <div className="text-xs text-muted-foreground">👤 {o.customer_name}</div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${t.color}`}>{t.label}</span>
                      </div>
                      {o.description && <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{o.description}</div>}
                      <div className="flex items-center justify-between mt-3 text-xs">
                        <span className="font-semibold">{formatEUR(o.total)}</span>
                        {o.due_date && <span className="text-muted-foreground">📅 {formatDate(o.due_date)}</span>}
                      </div>
                      {can("orders", "edit") && (
                        <div className="flex gap-1 mt-3">
                          <select
                            className="flex-1 text-xs rounded-lg bg-muted px-2 py-1 border border-transparent focus:border-primary outline-none"
                            value={o.status}
                            onChange={(e) => updateStatus.mutate({ id: o.id, status: e.target.value })}
                            data-testid={`order-status-${o.id}`}
                          >
                            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                          <button onClick={() => openEdit(o)} className="p-1.5 rounded-lg hover:bg-muted" data-testid={`edit-order-${o.id}`}>
                            <Edit2 size={14}/>
                          </button>
                          {can("orders", "delete") && (
                            <button onClick={() => window.confirm("Eliminare?") && del.mutate(o.id)}
                                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive" data-testid={`delete-order-${o.id}`}>
                              <Trash2 size={14}/>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && <div className="text-center text-xs text-muted-foreground py-8">— vuoto —</div>}
              </div>
            </div>
          );
        })}
      </div>

      <OrderDialog open={open} onOpenChange={setOpen} value={edit} onChange={setEdit}
                   onSave={() => save.mutate(edit)} customers={customers}/>
    </div>
  );
}

function OrderDialog({ open, onOpenChange, value, onChange, onSave, customers }) {
  if (!value) return null;
  const set = (k, v) => onChange({ ...value, [k]: v });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-3xl">
        <DialogHeader>
          <DialogTitle>{value.id ? "Modifica ordine" : "Nuovo ordine"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Titolo *"><input className="crafteria-input w-full" value={value.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Cliente *">
            <input list="customers-list" className="crafteria-input w-full" value={value.customer_name}
                   onChange={(e) => set("customer_name", e.target.value)} />
            <datalist id="customers-list">
              {customers.map((c) => <option key={c.id} value={c.name}/>)}
            </datalist>
          </Field>
          <Field label="Tecnica">
            <select className="crafteria-input w-full" value={value.technique} onChange={(e) => set("technique", e.target.value)}>
              {TECHNIQUES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Stato">
            <select className="crafteria-input w-full" value={value.status} onChange={(e) => set("status", e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Totale (€)"><input type="number" step="0.01" className="crafteria-input w-full" value={value.total} onChange={(e) => set("total", parseFloat(e.target.value || 0))}/></Field>
          <Field label="Acconto (€)"><input type="number" step="0.01" className="crafteria-input w-full" value={value.deposit} onChange={(e) => set("deposit", parseFloat(e.target.value || 0))}/></Field>
          <Field label="Scadenza"><input type="date" className="crafteria-input w-full" value={value.due_date || ""} onChange={(e) => set("due_date", e.target.value)}/></Field>
          <Field label="Priorità">
            <select className="crafteria-input w-full" value={value.priority} onChange={(e) => set("priority", e.target.value)}>
              <option value="bassa">Bassa</option><option value="media">Media</option><option value="alta">Alta</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descrizione / note">
              <textarea rows={3} className="crafteria-input w-full" value={value.description || ""} onChange={(e) => set("description", e.target.value)}/>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <button className="crafteria-btn-primary" data-testid={ORDERS.saveBtn} onClick={onSave}>Salva</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-sm">
      <span className="block font-semibold mb-1">{label}</span>
      {children}
    </label>
  );
}
