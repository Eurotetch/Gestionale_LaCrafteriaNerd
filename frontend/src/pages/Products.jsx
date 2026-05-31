import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { PRODUCTS } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Search, Package } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatEUR, TECHNIQUES, techMeta } from "@/lib/utils";
import { toast } from "sonner";

const empty = () => ({ name: "", description: "", technique: "3D", price: 0, cost: 0, sku: "", image_url: "", active: true });

export default function ProductsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tech, setTech] = useState("");
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await api.get("/products")).data,
    refetchInterval: 3000,
  });

  const save = useMutation({
    mutationFn: async (o) => o.id ? (await api.patch(`/products/${o.id}`, o)).data : (await api.post("/products", o)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setOpen(false); toast.success("Prodotto salvato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/products/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("Eliminato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const filtered = items.filter((p) => {
    const s = search.toLowerCase();
    return (!tech || p.technique === tech) && (!s || (p.name || "").toLowerCase().includes(s) || (p.sku || "").toLowerCase().includes(s));
  });

  return (
    <div data-testid={PRODUCTS.root} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent font-bold">catalogo</div>
          <h1 className="text-3xl sm:text-4xl">Prodotti & Personalizzazioni 🐉</h1>
          <p className="text-muted-foreground mt-1">Tutto ciò che esce dalla bottega.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input className="crafteria-input pl-9 w-full sm:w-56" placeholder="Cerca…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="crafteria-input" value={tech} onChange={(e) => setTech(e.target.value)}>
            <option value="">Tutte le tecniche</option>
            {TECHNIQUES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {can("products", "edit") && (
            <button data-testid={PRODUCTS.addBtn} className="crafteria-btn-primary flex items-center gap-2" onClick={() => { setEdit(empty()); setOpen(true); }}>
              <Plus size={16}/> Nuovo
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filtered.map((p) => {
          const t = techMeta(p.technique);
          return (
            <div key={p.id} className="crafteria-card p-5 hover:-translate-y-0.5 transition-all">
              <div className="aspect-square rounded-2xl bg-muted/60 mb-3 grid place-items-center overflow-hidden">
                {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover"/> : <Package size={36} className="text-muted-foreground"/>}
              </div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-extrabold leading-tight">{p.name}</h3>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${t.color} shrink-0`}>{t.label}</span>
              </div>
              {p.sku && <div className="text-xs text-muted-foreground mt-1">SKU: {p.sku}</div>}
              {p.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{p.description}</p>}
              <div className="flex items-end justify-between mt-3">
                <div>
                  <div className="text-xs text-muted-foreground">Prezzo</div>
                  <div className="text-xl font-extrabold text-accent">{formatEUR(p.price)}</div>
                </div>
                {can("products", "edit") && (
                  <div className="flex gap-1">
                    <button onClick={() => { setEdit({ ...p }); setOpen(true); }} className="p-2 rounded-lg hover:bg-muted" data-testid={`edit-product-${p.id}`}><Edit2 size={14}/></button>
                    {can("products", "delete") && (
                      <button onClick={() => window.confirm("Eliminare?") && del.mutate(p.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" data-testid={`delete-product-${p.id}`}><Trash2 size={14}/></button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="col-span-full text-center text-muted-foreground py-12">Nessun prodotto in catalogo ✨</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl rounded-3xl">
          <DialogHeader><DialogTitle>{edit?.id ? "Modifica prodotto" : "Nuovo prodotto"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label="Nome *"><input className="crafteria-input w-full" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })}/></F>
              <F label="SKU"><input className="crafteria-input w-full" value={edit.sku || ""} onChange={(e) => setEdit({ ...edit, sku: e.target.value })}/></F>
              <F label="Tecnica">
                <select className="crafteria-input w-full" value={edit.technique} onChange={(e) => setEdit({ ...edit, technique: e.target.value })}>
                  {TECHNIQUES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </F>
              <F label="Immagine URL"><input className="crafteria-input w-full" value={edit.image_url || ""} onChange={(e) => setEdit({ ...edit, image_url: e.target.value })}/></F>
              <F label="Prezzo (€) *"><input type="number" step="0.01" className="crafteria-input w-full" value={edit.price} onChange={(e) => setEdit({ ...edit, price: parseFloat(e.target.value || 0) })}/></F>
              <F label="Costo (€)"><input type="number" step="0.01" className="crafteria-input w-full" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: parseFloat(e.target.value || 0) })}/></F>
              <div className="sm:col-span-2">
                <F label="Descrizione">
                  <textarea rows={3} className="crafteria-input w-full" value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })}/>
                </F>
              </div>
            </div>
          )}
          <DialogFooter>
            <button className="crafteria-btn-primary" data-testid={PRODUCTS.saveBtn} onClick={() => save.mutate(edit)}>Salva</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const F = ({ label, children }) => (
  <label className="block text-sm"><span className="block font-semibold mb-1">{label}</span>{children}</label>
);
