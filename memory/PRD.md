# PRD — La Crafteria Nerd · Gestionale

## Original problem statement
"Devo creare un Gestionale comodo da usare sia da PC che da mobile, condiviso quasi in tempo reale con una o più persone che lavoreranno con con me. Vorrei che quello che scriviamo e compiliamo venga subito salvato in automatico in una sorta di Cloud o database fisso, così che tutti gli altri possono vederlo quasi in tempo reale. Vorrei generare un Gestionale che gestisce la mia attività di personalizzazioni, stampe e prodotti artigianali. La mia attività si chiama La Crafteria Nerd."
— Sito brand: https://www.lacrafterianerd.com

## User personas
- **Admin (Lala)** — Owner, gestisce tutto: cassa, ordini, magazzino, fatture, collaboratori e permessi.
- **Collaboratore (Cesco / moglie)** — Vede solo i moduli concessi dall'admin OPPURE riceve "grant all" per pari poteri.

## Core requirements (static)
- Multi-utente con sync quasi in tempo reale (refetch ogni 3 s).
- Login solo per persone autorizzate. Primo accesso admin imposta la propria password.
- Permessi granulari per modulo (view / edit / delete) + flag "grant_all".
- Funziona da PC e mobile (sidebar collassabile).
- POS / Cassa per vendite rapide tipo software "Atelier".
- Branding kawaii nerd — mascotte (Lala, Cesco, Draghetto), font Nunito + Poppins, palette cream/yellow/pink/green.

## Architettura
- **Backend**: FastAPI + Motor (MongoDB) + JWT (Bearer in `Authorization` header).
  - Collections: users, customers, products, materials, orders, invoices, calendar_events, sales.
  - UUIDv4 string `id` su tutti i documenti — nessun ObjectId esposto.
- **Frontend**: React 19 + React Router 7 + React Query (refetchInterval 3 s) + Tailwind + Shadcn UI + Recharts + Lucide.

## What's been implemented (2026-05-31)
- 🔐 Auth: check-email, setup-password (primo accesso admin), login, me, change-password.
- 👥 Users: list/create/patch/delete con matrice permessi (10 moduli × 3 azioni) o "grant all".
- 📋 Ordini & Commesse: kanban (nuovo / in_lavorazione / pronto / consegnato / annullato) + ricerca + dialog CRUD.
- 👥 Clienti: tabella CRM con ricerca, anagrafica completa.
- 🐉 Catalogo prodotti: card grid con tecnica (3D / Ricamo / Laser / UV / Tufting / Pimp-My-Game / Eventi / Altro).
- 📦 Magazzino: tabella materiali con scorte, soglia minima, badge "low stock" automatico.
- 🧾 Preventivi & Fatture: builder multi-riga con IVA, calcolo subtotale/totale live, stato (bozza/inviato/pagato/scaduto).
- 📆 Calendario lavorazioni: vista mensile, eventi colorati per tipo.
- 💳 Cassa / POS: grid prodotti touch-friendly, carrello, pagamento (contanti/carta/bonifico/altro), voce libera, sconto.
- 📊 Report: incassi per mese (bar), ricavi per tecnica (pie), top clienti.
- 🎨 Tema brand: cream + yellow + pink + green, Nunito heading + Poppins body, mascotte integrate.
- Backend test suite (26/26 pytest pass).

## Prioritized backlog
- **P1** Stampa / Export PDF preventivi & fatture (oggi solo salvati a DB).
- **P1** Allegati su ordini / preventivi (foto file STL, mockup) — richiede object storage.
- **P1** Drag & Drop reale tra colonne kanban (oggi via dropdown stato).
- **P2** Numerazione progressiva automatica fatture/preventivi (per anno).
- **P2** Notifiche scadenze (oggi previste / domani) — possibili via email/Telegram.
- **P2** Schermata "dettaglio cliente" con timeline ordini + fatturato.
- **P2** Conteggio costi materiali per ordine (BOM) → margine reale.
- **P3** Integrazione fattura elettronica SdI (FatturaPA).
- **P3** Modulo "spese / uscite" per profit & loss completo.
- **P3** Pagamenti Stripe/PayPal incorporati al POS.
- **P3** Multi-sede / più postazioni cassa.

## Test credentials
Vedi `/app/memory/test_credentials.md`.
