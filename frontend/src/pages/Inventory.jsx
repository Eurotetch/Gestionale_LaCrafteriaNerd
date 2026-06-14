import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { INVENTORY } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, Search, AlertTriangle, Tag as TagIcon, ShoppingBag, Factory, PackageOpen, Droplet } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatEUR } from "@/lib/utils";
import { toast } from "sonner";
import NumberInput from "@/components/NumberInput";
import { useBackClose } from "@/hooks/useBackClose";

const empty = (type) => ({ name: "", unit: "pz", stock: 0, min_stock: 0, unit_cost: 0, supplier: "", notes: "", category: "", tags: [], color: "#FFD166", color_hex: "", color_name: "", link_url: "", type: type || "produzione" });

const MATERIAL_TYPES = [
  { value: "produzione",   label: "Materiali di produzione", desc: "Inchiostri, filamenti, legno, lana…", icon: Factory },
  { value: "neutra",       label: "Merce Neutra",            desc: "Calamite, quadri, tazze, tappetini…", icon: PackageOpen },
  { value: "consumabile",  label: "Consumabile",             desc: "Nastro, fogli, colla, lubrificante…", icon: Droplet },
];

const COLOR_PRESETS = [
  "#FFFFFF", "#000000", "#9CA3AF", "#6B7280", "#78350F", "#A16207",
  "#EF4444", "#F97316", "#F59E0B", "#FACC15", "#84CC16", "#22C55E",
  "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#FFD166",
];

const SORT_OPTIONS = [
  { value: "name_asc",      label: "Nome A-Z" },
  { value: "name_desc",     label: "Nome Z-A" },
  { value: "stock_asc",     label: "Scorta crescente" },
  { value: "stock_desc",    label: "Scorta decrescente" },
  { value: "min_stock_asc", label: "Soglia min. crescente" },
  { value: "min_stock_desc",label: "Soglia min. decrescente" },
  { value: "category",      label: "Categoria" },
  { value: "tag",           label: "Tag" },
];

const TAG_COLORS = ["bg-primary/20 text-primary-foreground", "bg-accent/20 text-accent", "bg-secondary/20 text-secondary", "bg-destructive/10 text-destructive"];
const tagColor = (tag) => TAG_COLORS[Math.abs([...tag].reduce((h, c) => h + c.charCodeAt(0), 0)) % TAG_COLORS.length];

export default function InventoryPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [sort, setSort] = useState("name_asc");
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("produzione");

  useBackClose(open, () => setOpen(false));

  const { data: items = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: async () => (await api.get("/materials")).data,
    refetchInterval: 3000,
  });

  const knownCategories = useMemo(() =>
    [...new Set(items.map((m) => m.category).filter((c) => c && c.trim()))].sort(), [items]);
  const knownTags = useMemo(() =>
    [...new Set(items.flatMap((m) => m.tags || []).filter((t) => t && t.trim()))].sort(), [items]);

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

  const filtered = useMemo(() => {
    let out = items.filter((m) => {
      const s = search.toLowerCase();
      if ((m.type || "produzione") !== tab) return false;
      if (s && !((m.name || "").toLowerCase().includes(s) || (m.supplier || "").toLowerCase().includes(s))) return false;
      if (filterCat && m.category !== filterCat) return false;
      if (filterTag && !(m.tags || []).includes(filterTag)) return false;
      return true;
    });
    const cmp = {
      name_asc:       (a, b) => (a.name || "").localeCompare(b.name || ""),
      name_desc:      (a, b) => (b.name || "").localeCompare(a.name || ""),
      stock_asc:      (a, b) => (a.stock ?? 0) - (b.stock ?? 0),
      stock_desc:     (a, b) => (b.stock ?? 0) - (a.stock ?? 0),
      min_stock_asc:  (a, b) => (a.min_stock ?? 0) - (b.min_stock ?? 0),
      min_stock_desc: (a, b) => (b.min_stock ?? 0) - (a.min_stock ?? 0),
      category:       (a, b) => (a.category || "").localeCompare(b.category || ""),
      tag:            (a, b) => ((a.tags || [])[0] || "").localeCompare((b.tags || [])[0] || ""),
    }[sort];
    if (cmp) out = out.slice().sort(cmp);
    return out;
  }, [items, search, filterCat, filterTag, sort, tab]);

  return (
    <div data-testid={INVENTORY.root} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-primary font-bold">magazzino</div>
          <h1 className="text-3xl sm:text-4xl">Inventario Materiali 📦</h1>
          <p className="text-muted-foreground mt-1">Tutto sotto controllo: scorte, soglie minime, fornitori.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input className="crafteria-input pl-9 w-full sm:w-64" placeholder="Cerca…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {can("inventory", "edit") && (
            <button data-testid={INVENTORY.addBtn} className="crafteria-btn-primary flex items-center gap-2" onClick={() => { setEdit(empty(tab)); setOpen(true); }}>
              <Plus size={16}/> Nuovo
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap" data-testid="inventory-tabs">
        {MATERIAL_TYPES.map((t) => {
          const active = tab === t.value;
          const Icon = t.icon;
          return (
            <button key={t.value} onClick={() => setTab(t.value)} data-testid={`inventory-tab-${t.value}`}
                    className={`group relative flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all min-w-[160px] sm:min-w-[200px] border ${active ? "bg-primary/10 border-primary crafteria-shadow" : "bg-card border-border hover:border-primary/40 hover:bg-muted/40"}`}>
              <span className={`grid place-items-center h-9 w-9 rounded-xl shrink-0 transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:text-foreground"}`}>
                <Icon size={18}/>
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-extrabold leading-tight ${active ? "text-primary-foreground" : "text-foreground"}`}>{t.label}</span>
                <span className="block text-[11px] text-muted-foreground truncate">{t.desc}</span>
              </span>
              {active && <span className="absolute left-3 right-3 -bottom-[1px] h-0.5 rounded-full bg-primary"/>}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <select className="crafteria-input" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {knownCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="crafteria-input" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
          <option value="">Tutti i tag</option>
          {knownTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="crafteria-input" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="crafteria-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-5 py-3 font-semibold">Materiale</th>
                <th className="px-2 py-3 font-semibold text-center">Col</th>
                <th className="px-3 py-3 font-semibold">Scorta</th>
                <th className="px-5 py-3 font-semibold">Soglia min</th>
                <th className="px-5 py-3 font-semibold">Costo unit.</th>
                <th className="px-5 py-3 font-semibold">Fornitore</th>
                <th className="px-5 py-3 font-semibold"></th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const low = (m.stock ?? 0) <= (m.min_stock ?? 0);
                return (
                  <tr key={m.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-semibold">
                      <div className="flex items-start gap-2">
                        <span className="h-3 w-3 rounded-full border border-border/60 shrink-0 mt-1" style={{ background: m.color || "transparent" }} title={m.color || ""}/>
                        <div>
                          {can("inventory", "edit") ? (
                            <button type="button" className="text-left hover:underline" onClick={() => { setEdit({ ...m }); setOpen(true); }} data-testid={`edit-material-${m.id}`}>
                              {m.name}
                            </button>
                          ) : m.name}
                          {(m.category || (m.tags || []).length > 0) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {m.category && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{m.category}</span>
                              )}
                              {(m.tags || []).map((t) => (
                                <span key={t} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ${tagColor(t)}`}>
                                  <TagIcon size={9}/> {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center">
                      {m.color_hex && (
                        <button
                          type="button"
                          onClick={() => toast(m.color_name || m.color_hex)}
                          title={m.color_name || m.color_hex}
                          className="h-5 w-5 rounded-md border border-border/60 inline-block hover:ring-2 hover:ring-primary/40 transition-all"
                          style={{ background: m.color_hex }}
                        />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {can("inventory", "edit") ? (
                        <div className="flex items-center gap-1">
                          {low && <AlertTriangle size={14} className="text-destructive shrink-0"/>}
                          <div className="w-14">
                            <StockInput material={m} onSave={(n) => save.mutate({ ...m, stock: n })}/>
                          </div>
                          <span className="text-muted-foreground text-xs">{m.unit}</span>
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
                    <td className="px-5 py-3">
                      <a
                        href={m.link_url || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => { if (!m.link_url) e.preventDefault(); }}
                        aria-disabled={!m.link_url}
                        className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-colors ${m.link_url ? "bg-[#FFD166] text-black hover:brightness-95" : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed pointer-events-none"}`}>
                        <ShoppingBag size={12}/> Ordina
                      </a>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {can("inventory", "delete") && (
                        <button onClick={() => window.confirm("Eliminare?") && del.mutate(m.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" data-testid={`delete-material-${m.id}`}><Trash2 size={14}/></button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">Magazzino vuoto — aggiungi il primo materiale ✨</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-3xl max-h-[85vh] overflow-y-auto scrollbar-soft">
          <DialogHeader><DialogTitle>{edit?.id ? "Modifica materiale" : "Nuovo materiale"}</DialogTitle><DialogDescription className="sr-only">Dati del materiale</DialogDescription></DialogHeader>
          {edit && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <span className="block font-semibold mb-1 text-sm">Categoria magazzino</span>
                <div className="flex flex-wrap gap-2">
                  {MATERIAL_TYPES.map((t) => {
                    const active = edit.type === t.value;
                    const Icon = t.icon;
                    return (
                      <label key={t.value} className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold cursor-pointer border transition-colors ${active ? "bg-primary/15 border-primary text-primary-foreground" : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"}`}>
                        <input type="radio" name="material-type" className="accent-primary" checked={active} onChange={() => setEdit({ ...edit, type: t.value })}/>
                        <Icon size={14}/> {t.label}
                      </label>
                    );
                  })}
                </div>
              </div>
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
              <F label="Link materiale">
                <input className="crafteria-input w-full" placeholder="https://…" value={edit.link_url || ""} onChange={(e) => setEdit({ ...edit, link_url: e.target.value })}/>
              </F>
              <F label="Categoria">
                <input list="material-cat-list" className="crafteria-input w-full" value={edit.category || ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} placeholder="es. Filamenti"/>
                <datalist id="material-cat-list">
                  {knownCategories.map((c) => <option key={c} value={c}/>)}
                </datalist>
              </F>
              <F label="Colore etichetta">
                <div className="flex items-center gap-2">
                  <input type="color" className="h-10 w-14 rounded-lg border border-border cursor-pointer bg-transparent shrink-0"
                         value={edit.color || "#FFD166"} onChange={(e) => setEdit({ ...edit, color: e.target.value })}/>
                  <input className="crafteria-input w-full" value={edit.color || ""} onChange={(e) => setEdit({ ...edit, color: e.target.value })} placeholder="#FFD166"/>
                </div>
                <ColorPalette value={edit.color} onPick={(hex) => setEdit({ ...edit, color: hex })}/>
              </F>
              <F label="Colore (materiale)">
                <div className="flex items-center gap-2">
                  <input type="color" className="h-10 w-14 rounded-lg border border-border cursor-pointer bg-transparent shrink-0"
                         value={edit.color_hex || "#FFFFFF"} onChange={(e) => setEdit({ ...edit, color_hex: e.target.value })}/>
                  <input className="crafteria-input w-full" value={edit.color_hex || ""} onChange={(e) => setEdit({ ...edit, color_hex: e.target.value })} placeholder="#FFFFFF"/>
                </div>
                <ColorPalette value={edit.color_hex} onPick={(hex) => setEdit({ ...edit, color_hex: hex })}/>
              </F>
              <F label="Tag (separati da virgola)">
                <input className="crafteria-input w-full" value={(edit.tags || []).join(", ")}
                       onChange={(e) => setEdit({ ...edit, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                       placeholder="es. urgente, fragile"/>
              </F>
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

function ColorPalette({ value, onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {COLOR_PRESETS.map((hex) => (
        <button
          key={hex}
          type="button"
          title={hex}
          onClick={() => onPick(hex)}
          className={`h-6 w-6 rounded-full border transition-all ${(value || "").toLowerCase() === hex.toLowerCase() ? "ring-2 ring-primary border-primary scale-110" : "border-border/60 hover:scale-110"}`}
          style={{ background: hex }}
        />
      ))}
    </div>
  );
}

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
