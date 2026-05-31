import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { POS } from "@/constants/testIds";
import { Plus, Minus, Trash2, ShoppingCart, Package, Printer } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatEUR, TECHNIQUES, techMeta } from "@/lib/utils";
import { toast } from "sonner";
import { printReceipt } from "@/lib/receiptPrint";

const PAYMENT_METHODS = [
  { value: "contanti", label: "💵 Contanti" },
  { value: "carta",    label: "💳 Carta" },
  { value: "bonifico", label: "🏦 Bonifico" },
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

  const { data: products = [] } = useQuery({
    queryKey: ["products"], queryFn: async () => (await api.get("/products")).data,
  });

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
  const addCustom = (name, price) => {
    if (!name || !price) return;
    setCart((c) => [...c, { name, quantity: customQty || 1, price: parseFloat(price) }]);
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
    <div data-testid={POS.root} className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 min-h-[calc(100vh-6rem)]">
      {/* PRODUCTS */}
      <div className="space-y-4 min-w-0">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-primary font-bold">cassa</div>
            <h1 className="text-3xl sm:text-4xl">POS — Vendita Rapida 💛</h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            <input className="crafteria-input w-48" placeholder="Cerca prodotto…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="crafteria-input" value={tech} onChange={(e) => setTech(e.target.value)}>
              <option value="">Tutte le tecniche</option>
              {TECHNIQUES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

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
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.color}`}>{t.label}</span>
                  <span className="text-base font-extrabold text-accent">{formatEUR(p.price)}</span>
                </div>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && <div className="text-center text-muted-foreground py-10">Nessun prodotto. Aggiungili dal Catalogo ✨</div>}

        {/* Quick add custom */}
        <CustomItemRow onAdd={addCustom} qty={customQty} setQty={setCustomQty}/>
      </div>

      {/* CART */}
      <div className="lg:sticky lg:top-6 self-start crafteria-card p-5 flex flex-col max-h-[calc(100vh-3rem)]">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <ShoppingCart size={20}/>
          <h2 className="text-xl font-extrabold">Carrello</h2>
          <span className="ml-auto text-sm text-muted-foreground">{cart.length} voci</span>
        </div>

        <input className="crafteria-input mt-3" placeholder="👤 Nome cliente (facoltativo)" value={customer} onChange={(e) => setCustomer(e.target.value)} />

        <div className="flex-1 overflow-y-auto scrollbar-soft my-3 space-y-2">
          {cart.length === 0 && (
            <div className="text-center py-10">
              <img src="https://www.lacrafterianerd.com/img/site/Cesco.png" className="h-24 mx-auto opacity-70" alt=""/>
              <div className="text-muted-foreground mt-2">Tocca un prodotto per aggiungerlo</div>
            </div>
          )}
          {cart.map((it, i) => (
            <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-2xl p-2.5">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{it.name}</div>
                <div className="text-xs text-muted-foreground">{formatEUR(it.price)} cad.</div>
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

        <div className="space-y-2 pt-3 border-t border-border">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotale</span><span className="font-semibold">{formatEUR(subtotal)}</span></div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Sconto (€)</span>
            <input type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value || 0))} className="crafteria-input w-24 text-right py-1"/>
          </div>
          <div className="flex justify-between items-baseline pt-1 border-t border-border/50">
            <span className="font-bold">TOTALE</span>
            <span className="text-3xl font-extrabold text-accent" data-testid="pos-total">{formatEUR(total)}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {PAYMENT_METHODS.map((p) => (
              <button key={p.value}
                      data-testid={`pos-payment-${p.value}`}
                      onClick={() => setPayment(p.value)}
                      className={`rounded-xl py-2 text-xs font-bold transition-all ${payment === p.value ? "bg-primary text-primary-foreground crafteria-shadow" : "bg-muted/60 hover:bg-muted"}`}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <button data-testid={POS.clearBtn} className="flex-1 rounded-2xl bg-muted py-3 font-semibold hover:bg-muted/70" onClick={() => setCart([])}>Svuota</button>
            <button
              data-testid={POS.checkoutBtn}
              onClick={handleCheckout}
              disabled={cart.length === 0 || !can("pos", "edit") || checkout.isPending}
              className="flex-[2] crafteria-btn-primary py-3 text-lg disabled:opacity-50"
            >
              {checkout.isPending ? "…" : "✨ Incassa"}
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground mt-1 cursor-pointer">
            <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} className="accent-primary"/>
            Stampa scontrino automaticamente dopo l'incasso
          </label>

          {lastSale && (
            <div className="bg-muted/40 rounded-2xl p-3 mt-2 flex items-center justify-between text-sm">
              <div>
                <div className="font-semibold">Ultima vendita: {formatEUR(lastSale.total)}</div>
                <div className="text-xs text-muted-foreground">#{(lastSale.id || "").slice(0, 8).toUpperCase()}</div>
              </div>
              <button
                onClick={() => printReceipt(lastSale, { operator: user?.name })}
                className="rounded-xl bg-card border border-border px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-card/70"
                data-testid="pos-reprint-btn">
                <Printer size={12}/> Ristampa
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomItemRow({ onAdd, qty, setQty }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  return (
    <div className="crafteria-card p-4 flex flex-wrap gap-2 items-center">
      <span className="text-sm font-semibold mr-1">+ Voce libera:</span>
      <input className="crafteria-input flex-1 min-w-[160px]" placeholder="Descrizione" value={name} onChange={(e) => setName(e.target.value)} data-testid="pos-custom-name"/>
      <input type="number" step="0.01" className="crafteria-input w-24" placeholder="Prezzo" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="pos-custom-price"/>
      <input type="number" min="1" className="crafteria-input w-20" placeholder="Qty" value={qty} onChange={(e) => setQty(parseInt(e.target.value || 1))}/>
      <button onClick={() => { onAdd(name, price); setName(""); setPrice(""); }}
              className="crafteria-btn-primary" data-testid="pos-custom-add">Aggiungi</button>
    </div>
  );
}
