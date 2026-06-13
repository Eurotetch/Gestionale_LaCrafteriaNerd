import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { POS } from "@/constants/testIds";
import { Plus, Minus, Trash2, ShoppingCart, Package, Printer, Pencil, LayoutGrid, Grid2x2, List as ListIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatEUR, TECHNIQUES, techMeta } from "@/lib/utils";
import { toast } from "sonner";
import { printReceipt } from "@/lib/receiptPrint";
import NumberInput from "@/components/NumberInput";

const PAYMENT_METHODS = [
  { value: "contanti", label: "💵 Contanti" },
  { value: "carta",    label: "💳 Carta/POS" },
  { value: "bonifico", label: "🏦 Bonifico" },
  { value: "paypal",   label: "🅿️ PayPal" },
  { value: "altro",    label: "✨ Altro" },
];

export default function POSPage() {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const [tech, setTech] = useState("");
  const [cart, setCart] = useState([]);
  const [payment, setPayment] = useState("contanti");
  const [discount, setDiscount] = useState(0);
  const [customer, setCustomer] = useState("");
  const [search, setSearch] = useState("");
  const [customQty, setCustomQty] = useState(1);
  const [lastSale, setLastSale] = useState(null);
  const [autoPrint, setAutoPrint] = useState(true);
  const [view, setView] = useState("full"); // full | grid | list

  const { data: products = [] } = useQuery({
    queryKey: ["products"], queryFn: async () => (await api.get("/products")).data,
  });

  const { data: catData } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => (await api.get("/products/categories")).data,
  });
  const knownCategories = catData?.categories || [];

  const checkout = useMutation({
    mutationFn: async (payload) => (await api.post("/sales", payload)).data,
    onSuccess: (sale) => {
      toast.success("Vendita registrata! ✨");
      setLastSale(sale);
      if (autoPrint) {
        setTimeout(() => printReceipt(sale, { operator: user?.name }), 200);
      }
      setCart([]); setDiscount(0); setCustomer("");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const filtered = useMemo(() => products.filter((p) => {
    if (p.active === false) return false;
    if (tech && p.technique !== tech) return false;
    const s = search.toLowerCase();
    return !s || (p.name || "").toLowerCase().includes(s) || (p.sku || "").toLowerCase().includes(s);
  }), [products, tech, search]);

  const addToCart = (p) => {
    setCart((c) => {
      const idx = c.findIndex((it) => it.product_id === p.id);
      if (idx >= 0) { const next = [...c]; next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 }; return next; }
      return [...c, { product_id: p.id, name: p.name, quantity: 1, price: p.price }];
    });
  };
  const updateQty = (i, delta) => setCart((c) => c.map((it, idx) => idx === i ? { ...it, quantity: Math.max(0, it.quantity + delta) } : it).filter((it) => it.quantity > 0));
  const removeItem = (i) => setCart((c) => c.filter((_, idx) => idx !== i));
  const updateCartItem = (i, field, value) => setCart((c) => c.map((it, idx) => idx === i ? { ...it, [field]: value } : it));

  const createProduct = useMutation({
    mutationFn: async (payload) => (await api.post("/products", payload)).data,
  });

  const addCustom = async ({ name, price, addToCatalog, category, technique, cost, imageUrl }) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Inserisci il nome del prodotto per la voce libera");
      return;
    }
    const numPrice = parseFloat(price) || 0;
    if (!addToCatalog) {
      setCart((c) => [...c, { name: trimmedName, quantity: customQty || 1, price: numPrice }]);
      setCustomQty(1);
      return;
    }
    try {
      let sku = "";
      try {
        const { data } = await api.post(`/products/next-sku?category=${encodeURIComponent(category || "Varie")}`);
        sku = data.sku;
      } catch { /* SKU facoltativo */ }
      const product = await createProduct.mutateAsync({
        name: trimmedName,
        description: "",
        technique: technique || "3D",
        category: category || "",
        price: numPrice,
        cost: parseFloat(cost) || 0,
        sku,
        image_url: imageUrl || "",
        active: true,
        tags: ["new"],
      });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product-categories"] });
      setCart((c) => [...c, { product_id: product.id, name: product.name, quantity: customQty || 1, price: product.price }]);
      toast.success("Prodotto creato e aggiunto al catalogo ✨");
    } catch (e) {
      toast.error(formatApiError(e));
      return;
    }
    setCustomQty(1);
  };

  const subtotal = cart.reduce((s, it) => s + (it.price * it.quantity), 0);
  const total = Math.max(0, subtotal - (discount || 0));

  const handleCheckout = () => {
    if (cart.length === 0) return toast.error("Carrello vuoto");
    checkout.mutate({
      items: cart, subtotal, discount: discount || 0, total,
      payment_method: payment, customer_name: customer || undefined,
    });
  };

  return (
    <div data-testid={POS.root} className="space-y-4">
      {/* BLOCCO 1: CARRELLO (sticky) */}
      <div className="lg:sticky lg:top-2 z-10 crafteria-card p-4 flex flex-col">
        <div className="flex items-center gap-2 flex-wrap">
          <ShoppingCart size={20}/>
          <h2 className="text-xl font-extrabold">Carrello</h2>
          <span className="text-sm text-muted-foreground">{cart.length} voci</span>
          <input className="crafteria-input flex-1 min-w-[160px] py-1.5" placeholder="👤 Nome cliente (facoltativo)" value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <span className="text-2xl font-extrabold text-accent ml-auto" data-testid="pos-total">{formatEUR(total)}</span>
        </div>

        <div className="max-h-[18vh] overflow-y-auto scrollbar-soft my-2 space-y-1.5">
          {cart.length === 0 && (
            <div className="text-center py-3 text-sm text-muted-foreground">Tocca un prodotto qui sotto per aggiungerlo</div>
          )}
          {cart.map((it, i) => (
            <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-2xl p-2">
              <div className="flex-1 min-w-0">
                {it.product_id ? (
                  <>
                    <div className="font-semibold text-sm truncate" title={it.name} onClick={() => toast(it.name)}>{it.name}</div>
                    <div className="text-xs text-muted-foreground">{formatEUR(it.price)} cad.</div>
                  </>
                ) : (
                  <>
                    <input
                      className="crafteria-input w-full text-sm font-semibold py-1 px-2 mb-1"
                      value={it.name}
                      title={it.name}
                      onChange={(e) => updateCartItem(i, "name", e.target.value)}
                      data-testid={`cart-name-${i}`}
                    />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent/20 text-accent inline-flex items-center gap-0.5 shrink-0" title="Articolo aggiunto manualmente">
                        <Pencil size={9}/> Manuale
                      </span>
                      <div className="w-20"><NumberInput value={it.price} onChange={(n) => updateCartItem(i, "price", n)} className="text-xs py-1" placeholder="Prezzo" data-testid={`cart-price-${i}`}/></div>
                      <span className="text-xs text-muted-foreground">cad.</span>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1 bg-card rounded-xl p-0.5 border border-border">
                <button onClick={() => updateQty(i, -1)} className="h-7 w-7 grid place-items-center hover:bg-muted rounded-lg" data-testid={`cart-decrease-${i}`}><Minus size={12}/></button>
                <span className="min-w-[24px] text-center text-sm font-bold">{it.quantity}</span>
                <button onClick={() => updateQty(i, +1)} className="h-7 w-7 grid place-items-center hover:bg-muted rounded-lg" data-testid={`cart-increase-${i}`}><Plus size={12}/></button>
              </div>
              <div className="font-bold w-20 text-right text-sm">{formatEUR(it.price * it.quantity)}</div>
              <button onClick={() => removeItem(i)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive" data-testid={`cart-remove-${i}`}><Trash2 size={14}/></button>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 pt-2 border-t border-border">
          <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Subtotale</span><span className="font-semibold">{formatEUR(subtotal)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Sconto (€)</span>
              <div className="w-20"><NumberInput value={discount} onChange={(n) => setDiscount(n)} min="0" className="text-right py-1"/></div>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {PAYMENT_METHODS.map((p) => (
                <button key={p.value}
                        data-testid={`pos-payment-${p.value}`}
                        onClick={() => setPayment(p.value)}
                        className={`rounded-xl py-1.5 px-2 text-[10px] font-bold transition-all ${payment === p.value ? "bg-primary text-primary-foreground crafteria-shadow" : "bg-muted/60 hover:bg-muted"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            <button data-testid={POS.clearBtn} className="rounded-2xl bg-muted px-4 py-2 font-semibold hover:bg-muted/70 text-sm" onClick={() => setCart([])}>Svuota</button>
            <button
              data-testid={POS.checkoutBtn}
              onClick={handleCheckout}
              disabled={cart.length === 0 || !can("pos", "edit") || checkout.isPending}
              className="flex-1 crafteria-btn-primary py-2.5 text-lg disabled:opacity-50"
            >
              {checkout.isPending ? "…" : "✨ Incassa"}
            </button>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer shrink-0">
              <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} className="accent-primary"/>
              Stampa auto
            </label>
            {lastSale && (
              <button
                onClick={() => printReceipt(lastSale, { operator: user?.name })}
                className="rounded-xl bg-card border border-border px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-card/70 shrink-0"
                data-testid="pos-reprint-btn">
                <Printer size={12}/> Ristampa #{(lastSale.id || "").slice(0, 6).toUpperCase()}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BLOCCO 2A: VOCE LIBERA */}
      <CustomItemRow onAdd={addCustom} qty={customQty} setQty={setCustomQty} knownCategories={knownCategories}/>

      {/* BLOCCO 2B: CATALOGO */}
      <div className="space-y-3 min-w-0">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-primary font-bold">cassa</div>
            <h1 className="text-3xl sm:text-4xl">POS — Vendita Rapida 💛</h1>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <input className="crafteria-input w-48" placeholder="Cerca prodotto…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="crafteria-input" value={tech} onChange={(e) => setTech(e.target.value)}>
              <option value="">Tutte le tecniche</option>
              {TECHNIQUES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="flex gap-1 rounded-2xl bg-muted/60 p-1" data-testid="pos-view-toggle">
              <ViewBtn current={view} value="full" setView={setView} icon={LayoutGrid} label="Card"/>
              <ViewBtn current={view} value="grid" setView={setView} icon={Grid2x2} label="Mini"/>
              <ViewBtn current={view} value="list" setView={setView} icon={ListIcon} label="Elenco"/>
            </div>
          </div>
        </div>

        {view === "full" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((p) => {
              const t = techMeta(p.technique);
              return (
                <button key={p.id}
                        data-testid={`pos-product-${p.id}`}
                        onClick={() => addToCart(p)}
                        className="crafteria-card p-4 text-left hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/40 transition-all">
                  <div className="aspect-square rounded-2xl bg-muted/70 mb-3 grid place-items-center overflow-hidden">
                    {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover"/> : <Package size={28} className="text-muted-foreground"/>}
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-sm leading-tight line-clamp-2">{p.name}</span>
                    {p.tags?.includes("new") && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground shrink-0">NUOVO</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.color}`}>{t.label}</span>
                    <span className="text-base font-extrabold text-accent">{formatEUR(p.price)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {view === "grid" && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7 gap-2.5">
            {filtered.map((p) => (
              <button key={p.id}
                      data-testid={`pos-product-${p.id}`}
                      onClick={() => addToCart(p)}
                      className="crafteria-card p-2.5 text-left hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/40 transition-all">
                <div className="aspect-square rounded-xl bg-muted/70 mb-1.5 grid place-items-center overflow-hidden">
                  {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover"/> : <Package size={20} className="text-muted-foreground"/>}
                </div>
                <div className="font-bold text-xs leading-tight line-clamp-2">{p.name}</div>
                <div className="text-sm font-extrabold text-accent mt-0.5">{formatEUR(p.price)}</div>
              </button>
            ))}
          </div>
        )}

        {view === "list" && (
          <div className="crafteria-card overflow-hidden">
            <div className="overflow-x-auto scrollbar-soft max-h-[50vh]">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left sticky top-0">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Nome</th>
                    <th className="px-4 py-2 font-semibold">Tecnica</th>
                    <th className="px-4 py-2 font-semibold text-right">Prezzo</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const t = techMeta(p.technique);
                    return (
                      <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-2 font-semibold">{p.name}</td>
                        <td className="px-4 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.color}`}>{t.label}</span></td>
                        <td className="px-4 py-2 text-right font-bold text-accent">{formatEUR(p.price)}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => addToCart(p)} data-testid={`pos-product-${p.id}`} className="crafteria-btn-primary py-1 px-3 text-xs">Aggiungi</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {filtered.length === 0 && <div className="text-center text-muted-foreground py-10">Nessun prodotto. Aggiungili dal Catalogo ✨</div>}
      </div>
    </div>
  );
}

function ViewBtn({ current, value, setView, icon: Icon, label }) {
  const active = current === value;
  return (
    <button onClick={() => setView(value)} data-testid={`pos-view-${value}`}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 ${active ? "bg-card crafteria-shadow" : "text-muted-foreground hover:text-foreground"}`}>
      <Icon size={14}/> {label}
    </button>
  );
}

function CustomItemRow({ onAdd, qty, setQty, knownCategories }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [addToCatalog, setAddToCatalog] = useState(false);
  const [category, setCategory] = useState("");
  const [technique, setTechnique] = useState("3D");
  const [cost, setCost] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const handleAdd = async () => {
    await onAdd({ name, price, addToCatalog, category, technique, cost, imageUrl: imageUrl });
    setName(""); setPrice(""); setCost(""); setImageUrl("");
    setAddToCatalog(false); setCategory(""); setTechnique("3D");
  };

  return (
    <div className="crafteria-card p-2.5 flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs font-semibold mr-1 shrink-0">+ Voce libera:</span>
        <input className="crafteria-input flex-1 min-w-[140px] py-1 text-sm" placeholder="Nome Prodotto" value={name} onChange={(e) => setName(e.target.value)} data-testid="pos-custom-name"/>
        <div className="w-20"><NumberInput value={parseFloat(price) || 0} onChange={(n) => setPrice(String(n))} placeholder="Prezzo" className="py-1 text-sm"/></div>
        <div className="w-16"><NumberInput value={qty} onChange={(n) => setQty(n)} step="1" min="1" placeholder="Qty" className="py-1 text-sm"/></div>
        <button onClick={handleAdd} className="crafteria-btn-primary py-1.5 px-3 text-sm" data-testid="pos-custom-add">Aggiungi</button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer shrink-0">
          <input type="checkbox" checked={addToCatalog} onChange={(e) => setAddToCatalog(e.target.checked)} className="accent-primary" data-testid="pos-custom-add-to-catalog"/>
          Aggiungi al catalogo
        </label>
      </div>

      {addToCatalog && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 border-t border-border/50">
          <div>
            <input list="pos-custom-cat-list" className="crafteria-input w-full text-xs py-1" placeholder="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="pos-custom-category"/>
            <datalist id="pos-custom-cat-list">
              {knownCategories.map((c) => <option key={c} value={c}/>)}
            </datalist>
          </div>
          <select className="crafteria-input w-full text-xs py-1" value={technique} onChange={(e) => setTechnique(e.target.value)} data-testid="pos-custom-technique">
            {TECHNIQUES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <NumberInput value={parseFloat(cost) || 0} onChange={(n) => setCost(String(n))} placeholder="Costo" className="text-xs py-1" data-testid="pos-custom-cost"/>
          <input className="crafteria-input w-full text-xs py-1" placeholder="URL immagine" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} data-testid="pos-custom-image"/>
        </div>
      )}
    </div>
  );
}
