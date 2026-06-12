import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, API_BASE } from "@/lib/api";
import { PRODUCTS } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Search, Package, Wand2, Upload, LayoutGrid, Grid2x2, List as ListIcon, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatEUR, formatDate, TECHNIQUES, techMeta } from "@/lib/utils";
import { toast } from "sonner";
import NumberInput from "@/components/NumberInput";

const empty = () => ({
  name: "", description: "", technique: "3D", category: "",
  price: 0, cost: 0, sku: "", image_url: "", active: true,
});

const SORT_OPTIONS = [
  { value: "name_asc",     label: "Nome A-Z" },
  { value: "name_desc",    label: "Nome Z-A" },
  { value: "price_asc",    label: "Prezzo crescente" },
  { value: "price_desc",   label: "Prezzo decrescente" },
  { value: "sku_asc",      label: "SKU A-Z" },
  { value: "date_desc",    label: "Più recenti" },
  { value: "date_asc",     label: "Più vecchi" },
  { value: "technique",    label: "Tecnica" },
  { value: "category",     label: "Categoria" },
];

export default function ProductsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterTech, setFilterTech] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [sort, setSort] = useState("date_desc");
  const [view, setView] = useState("full"); // full | grid | list
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await api.get("/products")).data,
    refetchInterval: 3000,
  });

  const { data: catData } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => (await api.get("/products/categories")).data,
  });
  const knownCategories = catData?.categories || [];

  const save = useMutation({
    mutationFn: async (o) => {
      if (!o.category?.trim()) throw new Error("La categoria è obbligatoria");
      return o.id ? (await api.patch(`/products/${o.id}`, o)).data
                  : (await api.post("/products", o)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product-categories"] });
      setOpen(false); toast.success("Prodotto salvato");
    },
    onError: (e) => toast.error(e.message?.includes("categoria") ? e.message : formatApiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/products/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("Eliminato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const filtered = useMemo(() => {
    let out = items.slice();
    if (filterTech) out = out.filter((p) => p.technique === filterTech);
    if (filterCat)  out = out.filter((p) => p.category === filterCat);
    if (search) {
      const s = search.toLowerCase();
      out = out.filter((p) => (p.name || "").toLowerCase().includes(s) || (p.sku || "").toLowerCase().includes(s));
    }
    const cmp = {
      name_asc:  (a, b) => (a.name || "").localeCompare(b.name || ""),
      name_desc: (a, b) => (b.name || "").localeCompare(a.name || ""),
      price_asc: (a, b) => (a.price || 0) - (b.price || 0),
      price_desc:(a, b) => (b.price || 0) - (a.price || 0),
      sku_asc:   (a, b) => (a.sku || "").localeCompare(b.sku || ""),
      date_desc: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
      date_asc:  (a, b) => (a.created_at || "").localeCompare(b.created_at || ""),
      technique: (a, b) => (a.technique || "").localeCompare(b.technique || ""),
      category:  (a, b) => (a.category || "").localeCompare(b.category || ""),
    }[sort];
    if (cmp) out.sort(cmp);
    return out;
  }, [items, filterTech, filterCat, search, sort]);

  const ViewToggle = (
    <div className="flex gap-1 rounded-2xl bg-muted/60 p-1" data-testid="view-toggle">
      <ViewBtn current={view} value="full"  setView={setView} icon={LayoutGrid}  label="Card"/>
      <ViewBtn current={view} value="grid"  setView={setView} icon={Grid2x2}     label="Mini"/>
      <ViewBtn current={view} value="list"  setView={setView} icon={ListIcon}    label="Elenco"/>
    </div>
  );

  return (
    <div data-testid={PRODUCTS.root} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent font-bold">catalogo</div>
          <h1 className="text-3xl sm:text-4xl">Prodotti & Personalizzazioni 🐉</h1>
          <p className="text-muted-foreground mt-1">Tutto ciò che esce dalla bottega.</p>
        </div>
        {can("products", "edit") && (
          <button data-testid={PRODUCTS.addBtn} className="crafteria-btn-primary flex items-center gap-2"
                  onClick={() => { setEdit(empty()); setOpen(true); }}>
            <Plus size={16}/> Nuovo prodotto
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <input className="crafteria-input pl-9 w-56" placeholder="Cerca nome o SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="crafteria-input" value={filterTech} onChange={(e) => setFilterTech(e.target.value)}>
          <option value="">Tutte le tecniche</option>
          {TECHNIQUES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="crafteria-input" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {knownCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="crafteria-input" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="ml-auto">{ViewToggle}</div>
      </div>

      {/* Body */}
      {view === "full" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((p) => <ProductCardFull key={p.id} p={p} can={can}
            onEdit={() => { setEdit({ ...p }); setOpen(true); }}
            onDel={() => window.confirm("Eliminare?") && del.mutate(p.id)}/>)}
        </div>
      )}
      {view === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {filtered.map((p) => <ProductCardMini key={p.id} p={p}
            onClick={() => { setEdit({ ...p }); setOpen(true); }}/>)}
        </div>
      )}
      {view === "list" && (
        <div className="crafteria-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-soft">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-5 py-3 font-semibold">SKU</th>
                  <th className="px-5 py-3 font-semibold">Nome</th>
                  <th className="px-5 py-3 font-semibold">Categoria</th>
                  <th className="px-5 py-3 font-semibold">Tecnica</th>
                  <th className="px-5 py-3 font-semibold text-right">Prezzo</th>
                  <th className="px-5 py-3 font-semibold">Inserito</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const t = techMeta(p.technique);
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-5 py-3 font-mono text-xs">{p.sku || "—"}</td>
                      <td className="px-5 py-3 font-semibold">{p.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.category || "—"}</td>
                      <td className="px-5 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.color}`}>{t.label}</span></td>
                      <td className="px-5 py-3 text-right font-bold text-accent">{formatEUR(p.price)}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{formatDate(p.created_at)}</td>
                      <td className="px-5 py-3 text-right space-x-1">
                        {can("products", "edit") && (
                          <button onClick={() => { setEdit({ ...p }); setOpen(true); }} className="p-2 rounded-lg hover:bg-muted" data-testid={`edit-product-${p.id}`}><Edit2 size={14}/></button>
                        )}
                        {can("products", "delete") && (
                          <button onClick={() => window.confirm("Eliminare?") && del.mutate(p.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" data-testid={`delete-product-${p.id}`}><Trash2 size={14}/></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Nessun prodotto ✨</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {filtered.length === 0 && view !== "list" && (
        <div className="text-center text-muted-foreground py-12">Nessun prodotto in catalogo ✨</div>
      )}

      <ProductDialog open={open} onOpenChange={setOpen} value={edit} onChange={setEdit}
                     onSave={() => save.mutate(edit)}
                     knownCategories={knownCategories}/>
    </div>
  );
}

function ViewBtn({ current, value, setView, icon: Icon, label }) {
  const active = current === value;
  return (
    <button onClick={() => setView(value)} data-testid={`view-${value}`}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 ${active ? "bg-card crafteria-shadow" : "text-muted-foreground hover:text-foreground"}`}>
      <Icon size={14}/> {label}
    </button>
  );
}

function ProductCardFull({ p, can, onEdit, onDel }) {
  const t = techMeta(p.technique);
  return (
    <div className="crafteria-card p-5 hover:-translate-y-0.5 transition-all" data-testid={`product-card-${p.id}`}>
      <div className="aspect-square rounded-2xl bg-muted/60 mb-3 grid place-items-center overflow-hidden">
        {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover"/> : <Package size={36} className="text-muted-foreground"/>}
      </div>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-extrabold leading-tight">{p.name}</h3>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${t.color} shrink-0`}>{t.label}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-1 flex justify-between">
        <span>{p.category || "senza categoria"}</span>
        {p.sku && <span className="font-mono">{p.sku}</span>}
      </div>
      {p.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{p.description}</p>}
      <div className="flex items-end justify-between mt-3">
        <div>
          <div className="text-xs text-muted-foreground">Prezzo</div>
          <div className="text-xl font-extrabold text-accent">{formatEUR(p.price)}</div>
        </div>
        {can("products", "edit") && (
          <div className="flex gap-1">
            <button onClick={onEdit} className="p-2 rounded-lg hover:bg-muted" data-testid={`edit-product-${p.id}`}><Edit2 size={14}/></button>
            {can("products", "delete") && (
              <button onClick={onDel} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" data-testid={`delete-product-${p.id}`}><Trash2 size={14}/></button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCardMini({ p, onClick }) {
  return (
    <button onClick={onClick} className="crafteria-card p-3 text-left hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/30 transition-all"
            data-testid={`product-mini-${p.id}`}>
      <div className="aspect-square rounded-xl bg-muted/60 mb-2 grid place-items-center overflow-hidden">
        {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover"/> : <Package size={24} className="text-muted-foreground"/>}
      </div>
      <div className="font-bold text-xs leading-tight line-clamp-2">{p.name}</div>
      <div className="text-sm font-extrabold text-accent mt-1">{formatEUR(p.price)}</div>
    </button>
  );
}

function ProductDialog({ open, onOpenChange, value, onChange, onSave, knownCategories }) {
  const fileRef = useRef(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [gen, setGen] = useState(false);

  if (!value) return null;
  const set = (k, v) => onChange({ ...value, [k]: v });

  const generateSku = async () => {
    if (!value.category?.trim()) { toast.error("Imposta prima la categoria"); return; }
    setGen(true);
    try {
      const { data } = await api.post(`/products/next-sku?category=${encodeURIComponent(value.category)}`);
      set("sku", data.sku);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setGen(false); }
  };

  const uploadImage = async (file) => {
    if (!file) return;
    if (!value.id) {
      // Create a draft id-less product first via save then upload — simpler: ask user to save first
      toast.error("Salva prima il prodotto, poi potrai caricare un'immagine");
      return;
    }
    if (file.size > 25 * 1024 * 1024) { toast.error("Immagine troppo grande (max 25 MB)"); return; }
    setUploadingImg(true);
    try {
      const form = new FormData(); form.append("file", file);
      const { data } = await api.post(`/upload?parent_type=products&parent_id=${value.id}`, form,
                                       { headers: { "Content-Type": "multipart/form-data" }});
      const token = localStorage.getItem("crafteria_token");
      const url = token ? `${API_BASE}/files/${data.id}/download?auth=${encodeURIComponent(token)}` : `${API_BASE}/files/${data.id}/download`;
      set("image_url", url);
      toast.success("Immagine caricata ✨");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setUploadingImg(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{value.id ? "Modifica prodotto" : "Nuovo prodotto"}</DialogTitle>
          <DialogDescription className="sr-only">Compila i dati del prodotto</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nome *">
            <input className="crafteria-input w-full" value={value.name} onChange={(e) => set("name", e.target.value)}/>
          </Field>

          <Field label="Categoria *">
            <input list="cat-list" className="crafteria-input w-full" value={value.category || ""}
                   onChange={(e) => set("category", e.target.value)}
                   placeholder="es. Portachiavi" data-testid="product-category-input"/>
            <datalist id="cat-list">
              {knownCategories.map((c) => <option key={c} value={c}/>)}
            </datalist>
          </Field>

          <Field label="Tecnica">
            <select className="crafteria-input w-full" value={value.technique} onChange={(e) => set("technique", e.target.value)}>
              {TECHNIQUES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          <Field label="SKU">
            <div className="flex gap-1">
              <input className="crafteria-input w-full font-mono" value={value.sku || ""}
                     onChange={(e) => set("sku", e.target.value.toUpperCase())}
                     placeholder="manuale o genera ↓" data-testid="product-sku-input"/>
              <button type="button" onClick={generateSku} disabled={gen}
                      title="Genera SKU progressivo dalla categoria"
                      className="rounded-xl bg-muted hover:bg-muted/70 px-3 disabled:opacity-50"
                      data-testid="sku-generate-btn">
                {gen ? <Loader2 className="animate-spin" size={14}/> : <Wand2 size={14}/>}
              </button>
            </div>
          </Field>

          <Field label="Prezzo (€) *">
            <NumberInput value={value.price} onChange={(n) => set("price", n)} min="0" className="w-full"/>
          </Field>
          <Field label="Costo (€)">
            <NumberInput value={value.cost} onChange={(n) => set("cost", n)} min="0" className="w-full"/>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Immagine">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input className="crafteria-input flex-1" value={value.image_url || ""}
                         onChange={(e) => set("image_url", e.target.value)}
                         placeholder="https://… (incolla un URL)"/>
                  <button type="button" onClick={() => fileRef.current?.click()}
                          disabled={uploadingImg}
                          title={value.id ? "Carica dal computer" : "Salva prima il prodotto"}
                          className="rounded-xl bg-primary text-primary-foreground px-3 font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                          data-testid="image-upload-btn">
                    {uploadingImg ? <Loader2 className="animate-spin" size={14}/> : <Upload size={14}/>}
                    Carica
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                         onChange={(e) => uploadImage(e.target.files?.[0])}/>
                </div>
                {value.image_url && (
                  <img src={value.image_url} alt="" className="h-32 w-32 object-cover rounded-xl border border-border"/>
                )}
              </div>
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Descrizione">
              <textarea rows={3} className="crafteria-input w-full" value={value.description || ""} onChange={(e) => set("description", e.target.value)}/>
            </Field>
          </div>

          {value.created_at && (
            <div className="sm:col-span-2 text-xs text-muted-foreground">
              Inserito il <strong>{formatDate(value.created_at)}</strong>
            </div>
          )}
        </div>
        <DialogFooter>
          <button className="crafteria-btn-primary" data-testid={PRODUCTS.saveBtn} onClick={onSave}>Salva</button>
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
