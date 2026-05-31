import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatEUR(n) {
  const v = Number(n || 0);
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
}

export function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export const TECHNIQUES = [
  { value: "3D",     label: "🐉 Stampa 3D",        color: "bg-emerald-100 text-emerald-700" },
  { value: "Ricamo", label: "🧵 Ricamo",           color: "bg-pink-100 text-pink-700" },
  { value: "Laser",  label: "⚡ Laser",             color: "bg-amber-100 text-amber-700" },
  { value: "UV",     label: "🖨️ Stampa UV",        color: "bg-sky-100 text-sky-700" },
  { value: "Tufting",label: "🪡 Tufting",          color: "bg-violet-100 text-violet-700" },
  { value: "PimpMyGame", label: "🎲 Pimp-My-Game", color: "bg-fuchsia-100 text-fuchsia-700" },
  { value: "Eventi", label: "💒 Eventi",           color: "bg-rose-100 text-rose-700" },
  { value: "Altro",  label: "✨ Altro",             color: "bg-stone-100 text-stone-700" },
];

export function techMeta(tech) {
  return TECHNIQUES.find((t) => t.value === tech) || TECHNIQUES[TECHNIQUES.length - 1];
}

export const STATUS_OPTIONS = [
  { value: "nuovo",          label: "Nuovo",          color: "bg-secondary/30 text-secondary" },
  { value: "in_lavorazione", label: "In lavorazione", color: "bg-primary/40 text-primary-foreground" },
  { value: "pronto",         label: "Pronto",         color: "bg-accent/25 text-accent" },
  { value: "consegnato",     label: "Consegnato",     color: "bg-muted text-foreground/70" },
  { value: "annullato",      label: "Annullato",      color: "bg-destructive/15 text-destructive" },
];

export function statusMeta(s) {
  return STATUS_OPTIONS.find((x) => x.value === s) || STATUS_OPTIONS[0];
}
