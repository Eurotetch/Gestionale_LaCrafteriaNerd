# PRD — La Crafteria Nerd · Gestionale

## Original problem statement
"Devo creare un Gestionale comodo da usare sia da PC che da mobile, condiviso quasi in tempo reale con una o più persone che lavoreranno con con me. Vorrei che quello che scriviamo e compiliamo venga subito salvato in automatico in una sorta di Cloud o database fisso, così che tutti gli altri possono vederlo quasi in tempo reale. Vorrei generare un Gestionale che gestisce la mia attività di personalizzazioni, stampe e prodotti artigianali. La mia attività si chiama La Crafteria Nerd."

## User personas
- **Admin (Lala)** — Owner.
- **Collaboratore (Cesco / moglie)** — Permessi granulari o "grant all".

## Architettura
- **Backend**: FastAPI + Motor (MongoDB) + JWT Bearer + Emergent Object Storage.
- **Frontend**: React 19 + React Query (3s polling) + Tailwind + Shadcn UI + Recharts + Lucide + @hello-pangea/dnd + jsPDF.

## Implementato (2026-05-31)
### Iterazione 1 — MVP
- Auth: check-email, setup-password (primo accesso admin), login, me, change-password.
- Users: CRUD admin-only con matrice permessi 10 moduli × view/edit/delete.
- Ordini & Commesse (kanban statico), Clienti, Prodotti, Magazzino, Fatture, Calendario, POS, Report.

### Iterazione 2 — Fix login UX + Feature expansion
- 🐛 FIX: Login a 2 step (① email → ② password/setup). Niente più ambiguità tra Verifica e Entra.
- ✅ **Drag & Drop reale tra colonne kanban** (`@hello-pangea/dnd`, optimistic update, drag handle, ring di evidenziazione, no animazioni jittery).
- ✅ **Export PDF preventivi/fatture** brand La Crafteria Nerd (header giallo, footer cream, jsPDF).
- ✅ **Allegati su Ordini / Clienti / Fatture** via Emergent Object Storage (image, PDF, STL, .txt; 25 MB max; soft-delete; download via Bearer o ?auth=token per <img>).
- ✅ **Numerazione progressiva fatture/preventivi** (counters MongoDB → P-2026-0001 / F-2026-0001).
- ✅ **Notifiche scadenze** su Dashboard (ordini in ritardo, in scadenza 7gg, fatture scadute con click-through).
- ✅ **Dettaglio cliente con timeline** unificata (ordini + fatture + vendite POS + statistiche aggregate).
- ✅ **BOM materiali per ordine** con calcolo margine e margine % in tempo reale.

## Backlog (per prossime iterazioni)
- **P1** Drag & Drop file upload (oggi solo click-to-browse).
- **P1** Conversione ordine → preventivo/fattura con un click.
- **P1** Scarico automatico magazzino quando ordine → consegnato (usa BOM).
- **P2** Notifiche email/Telegram per scadenze.
- **P2** Multi-azienda / multi-sede (oggi 1 sola).
- **P3** Fattura elettronica SdI (FatturaPA).
- **P3** Pagamenti Stripe / SumUp integrati al POS.
- **P3** App mobile nativa (PWA è già responsive).

## Test credentials
Vedi `/app/memory/test_credentials.md`.
