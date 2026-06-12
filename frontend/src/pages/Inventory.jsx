import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { INVENTORY } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Search, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatEUR } from "@/lib/utils";
import { toast } from "sonner";
import NumberInput from "@/components/NumberInput";

const empty = () => ({ name: "", unit: "pz", stock: 0, min_stock: 0, unit_cost: 0, supplier: "", notes: "" });

export default function InventoryPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: async () => (await api.get("/materials")).data,
    refetchInterval: 3000,
  });

  const save = useMutation({
    mutationFn: async (o) => o.id ? (await api.patch(`/materials/${o.id}`, o)).data : (await api.post("/materials", o)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["materials"] }); setOpen(false); toast.success("Materiale salvato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/materials/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["materials"] }); toast.success("Eliminato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const filtered = items.filter((m) => {
    const s = search.toLowerCase();
    return !s || (m.name || "").toLowerCase().includes(s) || (m.supplier || "").toLowerCase().includes(s);
  });

  return (
    <div data-testid={INVENTORY.root} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-primary font-bold">magazzino</div>
          <h1 className="text-3xl sm:text-4xl">Inventario Materiali 📦</h1>
          <p className="text-muted-foreground mt-1">Tutto sotto controllo: scorte, soglie minime, fornitori.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input className="crafteria-input pl-9 w-full sm:w-64" placeholder="Cerca…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {can("inventory", "edit") && (
            <button data-testid={INVENTORY.addBtn} className="crafteria-btn-primary flex items-center gap-2" onClick={() => { setEdit(empty()); setOpen(true); }}>
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
                <th className="px-5 py-3 font-semibold">Materiale</th>
                <th className="px-5 py-3 font-semibold">Scorta</th>
                <th className="px-5 py-3 font-semibold">Soglia min</th>
                <th className="px-5 py-3 font-semibold">Costo unit.</th>
                <th className="px-5 py-3 font-semibold">Fornitore</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const low = (m.stock ?? 0) <= (m.min_stock ?? 0);
                return (
                  <tr key={m.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-semibold">{m.name}</td>
                    <td className="px-5 py-3">
                      {can("inventory", "edit") ? (
                        <div className="flex items-center gap-1.5">
                          {low && <AlertTriangle size={14} className="text-destructive shrink-0"/>}
                          <div className="w-20">
                            <StockInput material={m} onSave={(n) => save.mutate({ ...m, stock: n })}/>
                          </div>
                          <span className="text-muted-foreground">{m.unit}</span>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 font-bold ${low ? "text-destructive" : ""}`}>
                          {low && <AlertTriangle size={14}/>}
                          {m.stock} {m.unit}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{m.min_stock} {m.unit}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatEUR(m.unit_cost)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{m.supplier || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {can("inventory", "edit") && (
                        <button onClick={() => { setEdit({ ...m }); setOpen(true); }} className="p-2 rounded-lg hover:bg-muted" data-testid={`edit-material-${m.id}`}><Edit2 size={14}/></button>
                      )}
                      {can("inventory", "delete") && (
                        <button onClick={() => window.confirm("Eliminare?") && del.mutate(m.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" data-testid={`delete-material-${m.id}`}><Trash2 size={14}/></button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">Magazzino vuoto — aggiungi il primo materiale ✨</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader><DialogTitle>{edit?.id ? "Modifica materiale" : "Nuovo materiale"}</DialogTitle><DialogDescription className="sr-only">Dati del materiale</DialogDescription></DialogHeader>
          {edit && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label="Nome *"><input className="crafteria-input w-full" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })}/></F>
              <F label="Unità">
                <select className="crafteria-input w-full" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}>
                  <option>pz</option><option>kg</option><option>g</option><option>m</option><option>cm</option><option>ml</option><option>l</option>
                </select>
              </F>
              <F label="Scorta"><NumberInput value={edit.stock} onChange={(n) => setEdit({ ...edit, stock: n })} className="w-full"/></F>
              <F label="Soglia min."><NumberInput value={edit.min_stock} onChange={(n) => setEdit({ ...edit, min_stock: n })} className="w-full"/></F>
              <F label="Costo unit. (€)"><NumberInput value={edit.unit_cost} onChange={(n) => setEdit({ ...edit, unit_cost: n })} className="w-full"/></F>
              <F label="Fornitore"><input className="crafteria-input w-full" value={edit.supplier || ""} onChange={(e) => setEdit({ ...edit, supplier: e.target.value })}/></F>
              <div className="sm:col-span-2">
                <F label="Note"><textarea rows={3} className="crafteria-input w-full" value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })}/></F>
              </div>
            </div>
          )}
          <DialogFooter>
            <button className="crafteria-btn-primary" data-testid={INVENTORY.saveBtn} onClick={() => save.mutate(edit)}>Salva</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const F = ({ label, children }) => (
  <label className="block text-sm"><span className="block font-semibold mb-1">{label}</span>{children}</label>
);

function StockInput({ material, onSave }) {
  const [value, setValue] = useState(material.stock);
  useEffect(() => setValue(material.stock), [material.stock]);
  return (
    <NumberInput
      value={value}
      onChange={setValue}
      onBlur={() => { if (value !== material.stock) onSave(value); }}
      step="1"
      className="text-right py-1"
      data-testid={`stock-input-${material.id}`}
    />
  );
}
