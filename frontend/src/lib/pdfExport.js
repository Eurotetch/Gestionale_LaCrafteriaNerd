import jsPDF from "jspdf";
import { formatEUR, formatDate } from "@/lib/utils";

const BRAND = {
  yellow: "#FFD166",
  green: "#06D6A0",
  pink: "#F38D9B",
  dark: "#4A3F35",
  muted: "#8C7C6B",
  cream: "#FFFDF7",
};

export function exportInvoicePDF(inv) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  // Header band
  doc.setFillColor(BRAND.yellow);
  doc.rect(0, 0, W, 90, "F");
  doc.setTextColor(BRAND.dark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("La Crafteria Nerd", M, 38);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Personalizzazioni · Stampe · Artigianato Nerd", M, 56);
  doc.text("www.lacrafterianerd.com  •  ✨", M, 72);

  // Document title
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  const docLabel = inv.kind === "fattura" ? "FATTURA" : "PREVENTIVO";
  doc.text(docLabel, W - M, 38, { align: "right" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`N° ${inv.number || "—"}`, W - M, 56, { align: "right" });
  doc.text(`Data: ${formatDate(inv.issue_date || inv.created_at)}`, W - M, 72, { align: "right" });

  let y = 130;

  // Customer
  doc.setFontSize(9);
  doc.setTextColor(BRAND.muted);
  doc.text("CLIENTE", M, y);
  doc.setFontSize(13);
  doc.setTextColor(BRAND.dark);
  doc.setFont("helvetica", "bold");
  doc.text(inv.customer_name || "—", M, y + 18);
  if (inv.due_date) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(BRAND.muted);
    doc.text(`Scadenza: ${formatDate(inv.due_date)}`, W - M, y + 18, { align: "right" });
  }

  y += 60;

  // Items table header
  doc.setFillColor(245, 241, 234);
  doc.rect(M, y, W - M * 2, 28, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(BRAND.dark);
  doc.text("DESCRIZIONE", M + 12, y + 18);
  doc.text("QTÀ", W - M - 200, y + 18, { align: "right" });
  doc.text("PREZZO", W - M - 110, y + 18, { align: "right" });
  doc.text("TOTALE", W - M - 12, y + 18, { align: "right" });

  y += 38;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  (inv.items || []).forEach((it) => {
    if (y > H - 200) {
      doc.addPage(); y = M + 20;
    }
    const total = (it.quantity || 0) * (it.price || 0);
    doc.text(String(it.name || "—").slice(0, 80), M + 12, y);
    doc.text(String(it.quantity || 0), W - M - 200, y, { align: "right" });
    doc.text(formatEUR(it.price || 0), W - M - 110, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(formatEUR(total), W - M - 12, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 22;
  });

  y += 10;
  doc.setDrawColor(220);
  doc.line(M, y, W - M, y);
  y += 24;

  // Totals
  doc.setFontSize(11);
  doc.setTextColor(BRAND.muted);
  doc.text("Imponibile", W - M - 110, y, { align: "right" });
  doc.setTextColor(BRAND.dark);
  doc.text(formatEUR(inv.subtotal || 0), W - M - 12, y, { align: "right" });
  y += 18;

  doc.setTextColor(BRAND.muted);
  doc.text(`IVA ${inv.vat_rate || 0}%`, W - M - 110, y, { align: "right" });
  doc.setTextColor(BRAND.dark);
  doc.text(formatEUR((inv.total || 0) - (inv.subtotal || 0)), W - M - 12, y, { align: "right" });
  y += 26;

  // Grand total band
  doc.setFillColor(BRAND.yellow);
  doc.roundedRect(W - M - 220, y - 4, 220, 36, 8, 8, "F");
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(BRAND.dark);
  doc.text("TOTALE", W - M - 200, y + 18);
  doc.setFontSize(16);
  doc.text(formatEUR(inv.total || 0), W - M - 12, y + 20, { align: "right" });
  y += 60;

  // Notes
  if (inv.notes) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(BRAND.muted);
    doc.text("NOTE", M, y);
    doc.setTextColor(BRAND.dark);
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(inv.notes, W - M * 2);
    doc.text(lines, M, y + 16);
    y += 16 + lines.length * 14;
  }

  // Footer
  doc.setFillColor(BRAND.cream);
  doc.rect(0, H - 50, W, 50, "F");
  doc.setFontSize(9);
  doc.setTextColor(BRAND.muted);
  doc.text("Grazie di scegliere La Crafteria Nerd ✨  •  www.lacrafterianerd.com", W / 2, H - 22, { align: "center" });

  const filename = `${docLabel}_${inv.number || inv.id?.slice(0, 8) || "doc"}.pdf`;
  doc.save(filename);
}
