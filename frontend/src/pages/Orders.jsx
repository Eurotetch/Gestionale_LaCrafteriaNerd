import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { ORDERS } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Search, GripVertical } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatEUR, formatDate, TECHNIQUES, STATUS_OPTIONS, techMeta } from "@/lib/utils";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import Attachments from "@/components/Attachments";
import { FileText, Receipt } from "lucide-react";
import NumberInput from "@/components/NumberInput";

const COLUMNS = STATUS_OPTIONS.filter((s) => s.value !== "annullato");

const emptyOrder = () => ({
  customer_name: "", title: "", description: "", technique: "3D",
  status: "nuovo", items: [], materials_used: [], total: 0, deposit: 0,
  due_date: "", priority: "media",
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
  const { data: materials = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: async () => (await api.get("/materials")).data,
    enabled: can("inventory", "view"),
  });

  const save = useMutation({
    mutationFn: async (o) => {
      if (o.id) return (await api.patch(`/orders/${o.id}`, o)).data;
      return (await api.post("/orders", o)).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      // keep the dialog open after first save for new orders so user can add attachments
      if (data?.id && !edit?.id) setEdit(data);
      else setOpen(false);
      toast.success("Ordine salvato");
    },
    onError: (e) => toast.error(formatApiError(e)),
  });
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => (await api.patch(`/orders/${id}`, { status })).data,
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["orders"] });
      const prev = qc.getQueryData(["orders"]);
      qc.setQueryData(["orders"], (old = []) => old.map((o) => o.id === id ? { ...o, status } : o));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["orders"], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/orders/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); toast.success("Eliminato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });
  const convert = useMutation({
    mutationFn: async ({ id, kind }) => (await api.post(`/orders/${id}/convert?kind=${kind}`)).data,
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`${vars.kind === "fattura" ? "Fattura" : "Preventivo"} ${data.number} creata`);
    },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const openNew = () => { setEdit(emptyOrder()); setOpen(true); };
  const openEdit = (o) => { setEdit({ ...o, materials_used: o.materials_used || [], items: o.items || [] }); setOpen(true); };

  // Listen for convert events from the dialog
  useEffect(() => {
    const h = (e) => convert.mutate(e.detail);
    window.addEventListener("crafteria-convert", h);
    return () => window.removeEventListener("crafteria-convert", h);
  }, [convert]);

  const filtered = orders.filter((o) => {
    const s = search.toLowerCase();
    return !s || o.title?.toLowerCase().includes(s) || o.customer_name?.toLowerCase().includes(s);
  });

  const onDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;
    updateStatus.mutate({ id: draggableId, status: destination.droppableId });
  };

  return (
    <div data-testid={ORDERS.root} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-primary font-bold">commesse</div>
          <h1 className="text-3xl sm:text-4xl">Ordini & Lavorazioni 📋</h1>
          <p className="text-muted-foreground mt-1">Trascina gli ordini tra le colonne per cambiarne lo stato.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input className="crafteria-input pl-9 w-full sm:w-64" placeholder="Cerca…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {can("orders", "edit") && (
            <button data-testid={ORDERS.addBtn} className="crafteria-btn-primary flex items-center gap-2" onClick={openNew}>
              <Plus size={16}/> Nuovo ordine
            </button>
          )}
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const items = filtered.filter((o) => o.status === col.value);
            return (
              <Droppable droppableId={col.value} key={col.value} isDropDisabled={!can("orders", "edit")}>
                {(provided, snapshot) => (
                  <div
                    data-testid={ORDERS.column(col.value)}
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`rounded-3xl p-3 min-h-[60vh] transition-colors ${snapshot.isDraggingOver ? "bg-primary/10 ring-2 ring-primary/40" : "bg-muted/40"}`}
                  >
                    <div className="flex items-center justify-between px-2 py-2">
                      <h3 className="font-extrabold flex items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${col.color.split(" ")[0]}`}/>
                        {col.label}
                      </h3>
                      <span className="text-xs text-muted-foreground font-semibold">{items.length}</span>
                    </div>
                    <div className="flex flex-col gap-3 mt-2">
                      {items.map((o, idx) => {
                        const t = techMeta(o.technique);
                        return (
                          <Draggable draggableId={o.id} index={idx} key={o.id} isDragDisabled={!can("orders", "edit")}>
                            {(prov, snap) => (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                data-testid={ORDERS.card(o.id)}
                                className={`crafteria-card p-4 transition-all ${snap.isDragging ? "rotate-1 ring-2 ring-primary scale-[1.02]" : "hover:-translate-y-0.5"}`}
                              >
                                <div className="flex items-start gap-2">
                                  {can("orders", "edit") && (
                                    <div
                                      {...prov.dragHandleProps}
                                      className="text-muted-foreground cursor-grab active:cursor-grabbing pt-0.5 -m-1 p-1 rounded-md hover:bg-muted/70 touch-none select-none"
                                      style={{ touchAction: "none" }}
                                      aria-label="Trascina">
                                      <GripVertical size={18}/>
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="font-bold truncate">{o.title}</div>
                                    <div className="text-xs text-muted-foreground">👤 {o.customer_name}</div>
                                  </div>
                                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${t.color} shrink-0`}>{t.label}</span>
                                </div>
                                {o.description && <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{o.description}</div>}
                                <div className="flex items-center justify-between mt-3 text-xs">
                                  <span className="font-semibold">{formatEUR(o.total)}</span>
                                  {o.due_date && <span className="text-muted-foreground">📅 {formatDate(o.due_date)}</span>}
                                </div>
                                {can("orders", "edit") && (
                                  <div className="flex gap-1 mt-3">
                                    <button onClick={() => openEdit(o)} className="flex-1 text-xs rounded-lg bg-muted px-2 py-1 hover:bg-muted/70 inline-flex items-center justify-center gap-1" data-testid={`edit-order-${o.id}`}>
                                      <Edit2 size={12}/> Modifica
                                    </button>
                                    {can("invoices", "edit") && (
                                      <>
                                        <button onClick={() => convert.mutate({ id: o.id, kind: "preventivo" })}
                                                title="Genera preventivo"
                                                className="p-1.5 rounded-lg hover:bg-secondary/20 text-secondary" data-testid={`convert-p-${o.id}`}>
                                          <FileText size={14}/>
                                        </button>
                                        <button onClick={() => convert.mutate({ id: o.id, kind: "fattura" })}
                                                title="Genera fattura"
                                                className="p-1.5 rounded-lg hover:bg-accent/20 text-accent" data-testid={`convert-f-${o.id}`}>
                                          <Receipt size={14}/>
                                        </button>
                                      </>
                                    )}
                                    {can("orders", "delete") && (
                                      <button onClick={() => window.confirm("Eliminare?") && del.mutate(o.id)}
                                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive" data-testid={`delete-order-${o.id}`}>
                                        <Trash2 size={14}/>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                      {items.length === 0 && <div className="text-center text-xs text-muted-foreground py-8">— trascina qui —</div>}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      <OrderDialog open={open} onOpenChange={setOpen} value={edit} onChange={setEdit}
                   onSave={() => save.mutate(edit)} customers={customers} materials={materials}
                   canEdit={can("orders", "edit")}/>
    </div>
  );
}

function OrderDialog({ open, onOpenChange, value, onChange, onSave, customers, materials, canEdit }) {
  if (!value) return null;
  const set = (k, v) => onChange({ ...value, [k]: v });

  const setMaterial = (i, k, v) => {
    const next = [...(value.materials_used || [])]; next[i] = { ...next[i], [k]: v };
    onChange({ ...value, materials_used: next });
  };
  const addMaterial = (m) => {
    onChange({ ...value, materials_used: [...(value.materials_used || []),
      { material_id: m?.id || null, name: m?.name || "", unit: m?.unit || "pz", quantity: 1, unit_cost: m?.unit_cost || 0 }] });
  };
  const rmMaterial = (i) => onChange({ ...value, materials_used: value.materials_used.filter((_, idx) => idx !== i) });

  const totalMatCost = (value.materials_used || []).reduce((s, m) => s + (m.quantity || 0) * (m.unit_cost || 0), 0);
  const margin = (value.total || 0) - totalMatCost;
  const marginPct = (value.total || 0) > 0 ? (margin / value.total) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{value.id ? "Modifica ordine" : "Nuovo ordine"}</DialogTitle>
          <DialogDescription className="sr-only">Compila i dati dell'ordine</DialogDescription>
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
          <Field label="Totale (€)"><NumberInput value={value.total} onChange={(n) => set("total", n)} className="w-full"/></Field>
          <Field label="Acconto (€)"><NumberInput value={value.deposit} onChange={(n) => set("deposit", n)} className="w-full"/></Field>
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

        {/* BOM: materials used */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm">🧮 Materiali impiegati (BOM)</span>
            <div className="flex items-center gap-2">
              <select className="crafteria-input text-xs py-1" value="" onChange={(e) => {
                const m = materials.find((x) => x.id === e.target.value);
                if (m) addMaterial(m);
              }}>
                <option value="">+ aggiungi dal magazzino…</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
              </select>
              <button type="button" onClick={() => addMaterial(null)} className="text-xs text-accent font-semibold">+ libero</button>
            </div>
          </div>
          {(value.materials_used || []).length > 0 && (
            <div className="space-y-1.5 rounded-2xl bg-muted/30 p-2">
                  {edit.materials_used.map((m, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center text-sm">
                    <input className="crafteria-input col-span-5 py-1" placeholder="Materiale" value={m.name} onChange={(e) => setMaterial(i, "name", e.target.value)}/>
                    <div className="col-span-2"><NumberInput value={m.quantity} onChange={(n) => setMaterial(i, "quantity", n)} placeholder="Qty" className="py-1"/></div>
                    <input className="crafteria-input col-span-1 py-1" placeholder="u." value={m.unit} onChange={(e) => setMaterial(i, "unit", e.target.value)}/>
                    <div className="col-span-3"><NumberInput value={m.unit_cost} onChange={(n) => setMaterial(i, "unit_cost", n)} placeholder="Costo unit." className="py-1"/></div>
                    <button onClick={() => rmMaterial(i)} className="col-span-1 text-destructive">×</button>
                  </div>
                ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
            <KPI label="Costo materiali" value={formatEUR(totalMatCost)} tone="muted"/>
            <KPI label="Margine" value={formatEUR(margin)} tone={margin >= 0 ? "accent" : "destructive"}/>
            <KPI label="Margine %" value={`${marginPct.toFixed(1)}%`} tone={marginPct >= 30 ? "accent" : marginPct >= 0 ? "primary" : "destructive"}/>
          </div>
        </div>

        {/* Attachments — only after the order has an id */}
        {value.id && (
          <div className="mt-3">
            <Attachments parentType="orders" parentId={value.id} canEdit={canEdit}/>
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          {value.id && canEdit && (
            <>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("crafteria-convert", { detail: { id: value.id, kind: "preventivo" } }))}
                className="rounded-2xl bg-secondary/20 text-secondary px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 hover:brightness-95">
                📝 Genera preventivo
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("crafteria-convert", { detail: { id: value.id, kind: "fattura" } }))}
                className="rounded-2xl bg-accent/20 text-accent px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 hover:brightness-95">
                🧾 Genera fattura
              </button>
            </>
          )}
          <button className="crafteria-btn-primary" data-testid={ORDERS.saveBtn} onClick={onSave}>
            {value.id ? "Salva modifiche" : "Crea ordine"}
          </button>
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

function KPI({ label, value, tone = "muted" }) {
  const toneCls = {
    muted: "bg-muted/60 text-foreground",
    accent: "bg-accent/15 text-accent",
    primary: "bg-primary/20 text-primary-foreground",
    destructive: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <div className={`rounded-xl px-3 py-2 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold opacity-70">{label}</div>
      <div className="font-extrabold">{value}</div>
    </div>
  );
}
