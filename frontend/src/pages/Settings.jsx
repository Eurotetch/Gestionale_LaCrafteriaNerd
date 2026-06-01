import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, API_BASE } from "@/lib/api";
import { Send, RefreshCw, CheckCircle2, AlertTriangle, Bell, BellOff, Webhook, MessageSquare, Trash } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const qc = useQueryClient();
  const [discovered, setDiscovered] = useState(null);
  const [manualChat, setManualChat] = useState("");

  const { data: status, isLoading } = useQuery({
    queryKey: ["telegram-status"],
    queryFn: async () => (await api.get("/telegram/status")).data,
    refetchInterval: 10000,
  });

  const setConfig = useMutation({
    mutationFn: async (body) => (await api.patch("/telegram/config", body)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["telegram-status"] }); toast.success("Configurazione salvata"); },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const discover = useMutation({
    mutationFn: async () => (await api.get("/telegram/discover")).data,
    onSuccess: (data) => {
      setDiscovered(data.chats || []);
      if (!data.chats || data.chats.length === 0) {
        toast.info("Nessuna chat rilevata. Scrivi un messaggio al bot o nel gruppo dove l'hai aggiunto, poi riprova.");
      }
    },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const test = useMutation({
    mutationFn: async () => (await api.post("/telegram/test")).data,
    onSuccess: () => toast.success("Messaggio test inviato ✨"),
    onError: (e) => toast.error(formatApiError(e)),
  });

  const sendNow = useMutation({
    mutationFn: async () => (await api.post("/telegram/send-summary-now")).data,
    onSuccess: () => toast.success("Riassunto inviato ✨"),
    onError: (e) => toast.error(formatApiError(e)),
  });

  const { data: webhookInfo } = useQuery({
    queryKey: ["telegram-webhook-info"],
    queryFn: async () => (await api.get("/telegram/webhook-info")).data,
    refetchInterval: 15000,
  });

  const setupWebhook = useMutation({
    mutationFn: async () => {
      const publicUrl = API_BASE.replace(/\/api$/, "");
      return (await api.post(`/telegram/setup-webhook?public_url=${encodeURIComponent(publicUrl)}`)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["telegram-webhook-info"] }); toast.success("Comandi bot attivati ✨"); },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const removeWebhook = useMutation({
    mutationFn: async () => (await api.post("/telegram/delete-webhook")).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["telegram-webhook-info"] }); toast.success("Comandi bot disattivati"); },
  });

  const resetData = useMutation({
    mutationFn: async () => (await api.post("/admin/reset-data", { confirm: "RESET" })).data,
    onSuccess: () => {
      toast.success("Dati operativi azzerati ✨");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(formatApiError(e)),
  });


  const webhookActive = !!webhookInfo?.result?.url;

  const choose = (chat) => {
    setConfig.mutate({ chat_id: String(chat.chat_id), chat_title: chat.title });
    setDiscovered(null);
  };

  return (
    <div className="space-y-6 max-w-3xl" data-testid="settings-root">
      <div>
        <div className="text-xs uppercase tracking-widest text-secondary font-bold">impostazioni</div>
        <h1 className="text-3xl sm:text-4xl">Notifiche Telegram 🐉</h1>
        <p className="text-muted-foreground mt-1">
          Ricevi ogni sera alle {status?.schedule?.split(" ")[0] || "20:00"} un riassunto della giornata e dei lavori del giorno dopo.
        </p>
      </div>

      <div className="crafteria-card p-6 space-y-5">
        {isLoading ? (
          <div className="text-muted-foreground">Caricamento…</div>
        ) : status?.configured ? (
          <>
            <div className="flex items-center gap-3 bg-accent/10 border border-accent/30 rounded-2xl p-3">
              <CheckCircle2 className="text-accent shrink-0" size={20}/>
              <div className="text-sm">
                <div className="font-bold">Bot attivo</div>
                <div className="text-muted-foreground">
                  @{status.bot?.username} — {status.bot?.first_name}
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-extrabold mb-2">Chat destinataria</h3>
              {status.chat_id ? (
                <div className="flex items-center justify-between bg-muted/40 rounded-2xl p-3">
                  <div>
                    <div className="font-semibold">{status.chat_title || "Chat"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{status.chat_id}</div>
                  </div>
                  <button
                    onClick={() => { if (window.confirm("Rimuovere?")) setConfig.mutate({ chat_id: "", chat_title: "" }); }}
                    className="text-xs text-destructive font-semibold">Rimuovi</button>
                </div>
              ) : (
                <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-3 flex items-center gap-2 text-sm">
                  <AlertTriangle size={16} className="text-destructive shrink-0"/>
                  <span>Nessuna chat configurata — il riassunto giornaliero NON viene inviato.</span>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <button onClick={() => discover.mutate()}
                        disabled={discover.isPending}
                        className="rounded-xl bg-muted px-3 py-2 text-sm font-semibold hover:bg-muted/70 inline-flex items-center gap-2"
                        data-testid="discover-chats-btn">
                  <RefreshCw size={14} className={discover.isPending ? "animate-spin" : ""}/>
                  Cerca chat collegate
                </button>
                <span className="text-xs text-muted-foreground">oppure inserisci manualmente:</span>
                <input
                  className="crafteria-input py-1 text-sm w-40"
                  placeholder="chat_id"
                  value={manualChat}
                  onChange={(e) => setManualChat(e.target.value)}
                />
                <button
                  onClick={() => {
                    if (!manualChat.trim()) return;
                    setConfig.mutate({ chat_id: manualChat.trim(), chat_title: "Manuale" });
                    setManualChat("");
                  }}
                  className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold">
                  Salva
                </button>
              </div>

              {discovered && discovered.length > 0 && (
                <div className="mt-3 rounded-2xl border border-border bg-card">
                  <div className="text-xs font-bold uppercase tracking-wider px-3 py-2 border-b border-border">
                    Chat trovate ({discovered.length})
                  </div>
                  {discovered.map((c) => (
                    <button
                      key={c.chat_id}
                      onClick={() => choose(c)}
                      className="w-full text-left px-3 py-3 hover:bg-muted/40 border-b border-border last:border-b-0 flex items-center justify-between"
                      data-testid={`pick-chat-${c.chat_id}`}>
                      <div>
                        <div className="font-semibold">{c.title}</div>
                        <div className="text-xs text-muted-foreground font-mono">{c.chat_id} · {c.type}</div>
                      </div>
                      <span className="text-xs text-accent font-bold">Seleziona →</span>
                    </button>
                  ))}
                </div>
              )}

              {discovered && discovered.length === 0 && (
                <div className="mt-3 text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">
                  Nessuna chat rilevata. Apri Telegram, scrivi un messaggio al bot
                  <strong> @{status.bot?.username}</strong> (o nel gruppo dove l'hai aggiunto),
                  poi riprova "Cerca chat collegate".
                </div>
              )}
            </div>

            <div>
              <h3 className="font-extrabold mb-2">Riassunto giornaliero</h3>
              <label className="flex items-center gap-3 cursor-pointer bg-muted/30 rounded-2xl p-3">
                <input
                  type="checkbox"
                  checked={!!status.daily_summary_enabled}
                  onChange={(e) => setConfig.mutate({ daily_summary_enabled: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                  data-testid="daily-summary-toggle"
                />
                <div className="flex-1">
                  <div className="font-semibold flex items-center gap-2">
                    {status.daily_summary_enabled ? <Bell size={14}/> : <BellOff size={14}/>}
                    Invio automatico alle {status.schedule}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Riepilogo della giornata + ordini in scadenza domani + attenzioni (fatture scadute, materiali sotto soglia).
                  </div>
                </div>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => test.mutate()}
                disabled={!status.chat_id || test.isPending}
                className="rounded-2xl bg-secondary text-secondary-foreground font-semibold px-4 py-2.5 hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-2"
                data-testid="telegram-test-btn">
                <Send size={14}/> Invia messaggio di test
              </button>
              <button
                onClick={() => sendNow.mutate()}
                disabled={!status.chat_id || sendNow.isPending}
                className="rounded-2xl bg-accent text-accent-foreground font-semibold px-4 py-2.5 hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-2"
                data-testid="telegram-send-now-btn">
                <Bell size={14}/> Invia riassunto adesso
              </button>
            </div>

            <div className="border-t border-border pt-5">
              <h3 className="font-extrabold mb-1 flex items-center gap-2">
                <MessageSquare size={16}/> Comandi bot interattivi
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Attiva il webhook per ricevere risposte in tempo reale ai comandi:
                <code className="bg-muted px-1 mx-1 rounded">/scadenze</code>,
                <code className="bg-muted px-1 mx-1 rounded">/incassi</code>,
                <code className="bg-muted px-1 mx-1 rounded">/magazzino</code>,
                <code className="bg-muted px-1 mx-1 rounded">/riassunto</code>,
                <code className="bg-muted px-1 mx-1 rounded">/help</code>.
                <br/>
                <span className="text-xs">
                  Nei gruppi scrivi i comandi con la menzione del bot, es. <code>/scadenze@gestionale_lacrafterianerd_bot</code>.
                </span>
              </p>
              <div className={`rounded-2xl p-3 ${webhookActive ? "bg-accent/10 border border-accent/30" : "bg-muted/40 border border-border"}`}>
                {webhookActive ? (
                  <div className="text-sm">
                    <div className="font-bold flex items-center gap-2 text-accent">
                      <CheckCircle2 size={14}/> Webhook attivo
                    </div>
                    <div className="text-xs text-muted-foreground font-mono break-all mt-1">{webhookInfo.result.url}</div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Webhook non attivo — i comandi del bot non risponderanno.</div>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setupWebhook.mutate()}
                  disabled={setupWebhook.isPending}
                  className="rounded-2xl bg-primary text-primary-foreground font-semibold px-4 py-2.5 hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-2"
                  data-testid="setup-webhook-btn">
                  <Webhook size={14}/> {webhookActive ? "Riconfigura webhook" : "Attiva comandi bot"}
                </button>
                {webhookActive && (
                  <button
                    onClick={() => { if (window.confirm("Disattivare i comandi?")) removeWebhook.mutate(); }}
                    className="rounded-2xl bg-muted px-4 py-2.5 text-sm font-semibold hover:bg-muted/70">
                    Disattiva
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm bg-destructive/10 border border-destructive/30 rounded-2xl p-3 flex items-center gap-2">
            <AlertTriangle className="text-destructive" size={16}/>
            Bot non configurato. Imposta <code>TELEGRAM_BOT_TOKEN</code> nelle env.
          </div>
        )}
      </div>
      <div className="crafteria-card p-6 border-2 border-destructive/40 bg-destructive/5 space-y-3">
        <h3 className="font-extrabold flex items-center gap-2 text-destructive">
          <Trash size={16}/> Zona pericolosa — Reset dati operativi
        </h3>
        <p className="text-sm text-muted-foreground">
          <strong>Solo per test/sviluppo.</strong> Elimina TUTTE le voci di clienti, prodotti, materiali, ordini, fatture, calendario,
          vendite, allegati e contatori. Mantiene gli utenti e le impostazioni Telegram.
          <strong> L'operazione non è reversibile.</strong>
        </p>
        <button
          onClick={() => {
            const ok = window.prompt('Per confermare, scrivi "AZZERA TUTTO":');
            if (ok === "AZZERA TUTTO") resetData.mutate();
          }}
          disabled={resetData.isPending}
          data-testid="reset-data-btn"
          className="rounded-2xl bg-destructive text-destructive-foreground font-semibold px-4 py-2.5 hover:brightness-105 disabled:opacity-50 inline-flex items-center gap-2">
          <Trash size={14}/> {resetData.isPending ? "Eliminazione…" : "Azzera tutti i dati operativi"}
        </button>
      </div>
    </div>
  );
}
