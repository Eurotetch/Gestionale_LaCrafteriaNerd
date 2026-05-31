/**
 * Print a POS receipt in 80mm thermal format using a hidden window + window.print().
 */
import { formatEUR } from "@/lib/utils";

const BRAND_NAME = "La Crafteria Nerd";

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printReceipt(sale, options = {}) {
  const operator = options.operator || "Cassa";
  const date = new Date(sale.created_at || Date.now());
  const idShort = (sale.id || "").slice(0, 8).toUpperCase();
  const lines = (sale.items || []).map((it) => {
    const total = (it.price || 0) * (it.quantity || 0);
    return `
      <div class="row">
        <div class="name">${escapeHtml(it.name)}</div>
        <div class="qty">${(it.quantity || 0).toString().replace('.', ',')} × ${formatEUR(it.price || 0)}</div>
        <div class="total">${formatEUR(total)}</div>
      </div>
    `;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Scontrino ${idShort}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Courier New", monospace;
      width: 72mm;
      margin: 0 auto;
      color: #000;
      font-size: 12px;
      line-height: 1.35;
    }
    .center { text-align: center; }
    .bold   { font-weight: 700; }
    .lg     { font-size: 14px; }
    .xl     { font-size: 16px; font-weight: 800; }
    .muted  { color: #444; }
    .sep    { border-top: 1px dashed #000; margin: 6px 0; }
    .row    { display: flex; flex-wrap: wrap; align-items: baseline; margin: 2px 0; }
    .row .name { flex: 1 1 100%; }
    .row .qty  { flex: 1; font-size: 11px; color: #333; }
    .row .total{ font-weight: 700; }
    .totals    { font-size: 13px; }
    .totals .grand { font-size: 18px; font-weight: 800; margin-top: 4px; }
    .between { display: flex; justify-content: space-between; }
    .footer { text-align: center; margin-top: 8px; font-size: 10px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style></head><body>
    <div class="center bold xl">${escapeHtml(BRAND_NAME)}</div>
    <div class="center muted" style="font-size:10px;">Personalizzazioni · Stampe · Artigianato Nerd</div>
    <div class="center muted" style="font-size:10px;">www.lacrafterianerd.com</div>
    <div class="sep"></div>
    <div class="between"><span>${date.toLocaleDateString("it-IT")}</span><span>${date.toLocaleTimeString("it-IT", {hour:"2-digit",minute:"2-digit"})}</span></div>
    <div class="between muted" style="font-size:10px;"><span>Scontrino #${idShort}</span><span>Op: ${escapeHtml(operator)}</span></div>
    ${sale.customer_name ? `<div class="muted" style="font-size:10px;">Cliente: ${escapeHtml(sale.customer_name)}</div>` : ""}
    <div class="sep"></div>
    ${lines || '<div class="muted">— nessuna voce —</div>'}
    <div class="sep"></div>
    <div class="totals">
      <div class="between"><span>Subtotale</span><span>${formatEUR(sale.subtotal || 0)}</span></div>
      ${sale.discount ? `<div class="between"><span>Sconto</span><span>- ${formatEUR(sale.discount)}</span></div>` : ""}
      <div class="between grand"><span>TOTALE</span><span>${formatEUR(sale.total || 0)}</span></div>
      <div class="between" style="margin-top:4px;"><span>Pagamento</span><span class="bold">${escapeHtml((sale.payment_method || "—").toUpperCase())}</span></div>
    </div>
    <div class="sep"></div>
    <div class="footer">
      Grazie e a presto!<br/>
      ✨ La Crafteria Nerd ✨
    </div>
    <script>
      window.onload = function() {
        setTimeout(function() { window.print(); }, 250);
        window.onafterprint = function() { window.close(); };
      };
    </script>
  </body></html>`;

  const w = window.open("", "PRINT", "width=420,height=720");
  if (!w) {
    alert("Apri i pop-up per stampare lo scontrino.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
