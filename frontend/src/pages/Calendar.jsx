import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { CALENDAR } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useBackClose } from "@/hooks/useBackClose";
import { toast } from "sonner";

const KINDS = [
  { value: "lavorazione", label: "🛠️ Lavorazione", color: "bg-primary/30 text-primary-foreground" },
  { value: "scadenza",    label: "⏰ Scadenza",     color: "bg-destructive/15 text-destructive" },
  { value: "evento",      label: "✨ Evento",       color: "bg-accent/20 text-accent" },
];

const pad2 = (n) => String(n).padStart(2, "0");
const empty = (startValue) => ({ title: "", description: "", start: startValue || new Date().toISOString().slice(0, 10), end: "", kind: "lavorazione" });

function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Returns all day-keys (YYYY-MM-DD) between startStr and endStr inclusive.
function rangeDayKeys(startStr, endStr) {
  const keys = [];
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  let d = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (d <= end) {
    keys.push(dateKey(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return keys;
}

export default function CalendarPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);
  const [dayView, setDayView] = useState(null); // Date | null
  const [highlightId, setHighlightId] = useState(null);
  const location = useLocation();

  useBackClose(!!dayView, () => setDayView(null));
  useBackClose(open, () => setOpen(false));

  // Apertura agenda su un giorno/evento specifico, arrivando dalla Dashboard
  useEffect(() => {
    const st = location.state;
    if (st?.openDate) {
      const d = new Date(st.openDate.slice(0, 10) + "T00:00:00");
      setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
      setDayView(d);
      setHighlightId(st.eventId || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: events = [] } = useQuery({
    queryKey: ["calendar"],
    queryFn: async () => (await api.get("/calendar")).data,
    refetchInterval: 3000,
  });

  const save = useMutation({
    mutationFn: async (o) => o.id ? (await api.patch(`/calendar/${o.id}`, o)).data : (await api.post("/calendar", o)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calendar"] }); setOpen(false); toast.success("Salvato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/calendar/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["calendar"] }); toast.success("Eliminato"); setOpen(false); },
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = monthMatrix(year, month);
  const monthName = cursor.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const eventsByDay = events.reduce((acc, ev) => {
    const startStr = (ev.start || "").slice(0, 10);
    const endStr = (ev.end || "").slice(0, 10);
    const isAllDay = (ev.start || "").length <= 10;
    if (isAllDay && endStr && endStr > startStr) {
      rangeDayKeys(startStr, endStr).forEach((d) => { (acc[d] = acc[d] || []).push(ev); });
    } else {
      (acc[startStr] = acc[startStr] || []).push(ev);
    }
    return acc;
  }, {});

  const openEdit = (ev) => { setEdit({ ...ev }); setOpen(true); };
  const openNew = (startValue) => { setEdit(empty(startValue)); setOpen(true); };

  const hasTime = (edit?.start || "").length > 10;
  const toggleHasTime = (checked) => {
    if (checked) {
      setEdit({ ...edit, start: (edit.start || "").slice(0, 10) + "T09:00", end: edit.end ? edit.end.slice(0, 10) + "T10:00" : "" });
    } else {
      setEdit({ ...edit, start: (edit.start || "").slice(0, 10), end: edit.end ? edit.end.slice(0, 10) : "" });
    }
  };

  return (
    <div data-testid={CALENDAR.root} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent font-bold">agenda</div>
          <h1 className="text-3xl sm:text-4xl">Calendario Lavorazioni 📆</h1>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <button className="p-2 rounded-xl hover:bg-muted" title="Anno precedente" onClick={() => setCursor(new Date(year - 1, month, 1))}><ChevronsLeft size={16}/></button>
          <button className="p-2 rounded-xl hover:bg-muted" title="Mese precedente" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={16}/></button>
          <div className="font-bold capitalize min-w-[140px] text-center">{monthName}</div>
          <button className="p-2 rounded-xl hover:bg-muted" title="Mese successivo" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={16}/></button>
          <button className="p-2 rounded-xl hover:bg-muted" title="Anno successivo" onClick={() => setCursor(new Date(year + 1, month, 1))}><ChevronsRight size={16}/></button>
          <button className="text-xs font-bold rounded-xl px-3 py-2 bg-muted hover:bg-muted/70 ml-1" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>Oggi</button>
          {can("calendar", "edit") && (
            <button data-testid={CALENDAR.addBtn} className="crafteria-btn-primary flex items-center gap-2 ml-2" onClick={() => openNew()}>
              <Plus size={16}/> Evento
            </button>
          )}
        </div>
      </div>

      <div className="crafteria-card p-3 sm:p-5">
        <div className="grid grid-cols-7 gap-1.5 text-xs uppercase tracking-wider text-muted-foreground font-bold mb-2">
          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (<div key={d} className="px-2 py-1">{d}</div>))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((d, i) => {
            const key = d ? dateKey(d) : `e-${i}`;
            const isToday = d && d.toDateString() === today.toDateString();
            const dayEvents = (d && eventsByDay[key]) || [];
            return (
              <div key={key}
                   onClick={() => d && setDayView(d)}
                   className={`min-h-[90px] rounded-2xl p-2 border ${d ? "bg-card border-border/70 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" : "bg-transparent border-transparent"} ${isToday ? "ring-2 ring-primary" : ""}`}>
                {d && (
                  <>
                    <div className="text-xs font-bold mb-1">{d.getDate()}</div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const k = KINDS.find((x) => x.value === ev.kind) || KINDS[0];
                        return (
                          <div key={ev.id}
                               className={`block w-full text-left text-[10px] font-semibold px-1.5 py-1 rounded-lg ${k.color} truncate`}
                               data-testid={`event-${ev.id}`}>
                            {ev.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} altri</div>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader><DialogTitle>{edit?.id ? "Modifica evento" : "Nuovo evento"}</DialogTitle><DialogDescription className="sr-only">Dati evento</DialogDescription></DialogHeader>
          {edit && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <F label="Titolo *"><input className="crafteria-input w-full" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })}/></F>
              </div>
              <F label="Tipo">
                <select className="crafteria-input w-full" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </F>
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer self-end pb-2">
                <input type="checkbox" checked={hasTime} onChange={(e) => toggleHasTime(e.target.checked)} className="accent-primary"/>
                Imposta orario
              </label>
              <F label={hasTime ? "Inizio *" : "Data inizio *"}>
                <input type={hasTime ? "datetime-local" : "date"} className="crafteria-input w-full"
                       value={hasTime ? (edit.start || "").slice(0, 16) : (edit.start || "").slice(0, 10)}
                       onChange={(e) => setEdit({ ...edit, start: e.target.value })}/>
              </F>
              <F label={hasTime ? "Fine" : "Data fine"}>
                <input type={hasTime ? "datetime-local" : "date"} className="crafteria-input w-full"
                       value={hasTime ? (edit.end || "").slice(0, 16) : (edit.end || "").slice(0, 10)}
                       onChange={(e) => setEdit({ ...edit, end: e.target.value })}/>
              </F>
              <div className="sm:col-span-2">
                <F label="Descrizione"><textarea rows={3} className="crafteria-input w-full" value={edit.description || ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })}/></F>
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between">
            {edit?.id && can("calendar", "delete") && (
              <button className="text-destructive font-semibold mr-auto" onClick={() => window.confirm("Eliminare?") && del.mutate(edit.id)}>
                Elimina
              </button>
            )}
            <button className="crafteria-btn-primary" data-testid={CALENDAR.saveBtn} onClick={() => save.mutate(edit)}>Salva</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!open && (
        <DayViewDialog
          date={dayView}
          events={dayView ? (eventsByDay[dateKey(dayView)] || []) : []}
          highlightId={highlightId}
          onClose={() => { setDayView(null); setHighlightId(null); }}
          onAddEvent={(startValue) => openNew(startValue)}
          onEditEvent={(ev) => openEdit(ev)}
          can={can}
        />
      )}
    </div>
  );
}

function DayViewDialog({ date, events, highlightId, onClose, onAddEvent, onEditEvent, can }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (date && scrollRef.current) {
      let hourEl;
      if (highlightId) {
        const ev = events.find((e) => e.id === highlightId);
        if (ev && (ev.start || "").length > 10) {
          const h = parseInt(ev.start.slice(11, 13), 10) || 0;
          hourEl = scrollRef.current.querySelector(`[data-hour="${h}"]`);
        }
      }
      if (!hourEl) hourEl = scrollRef.current.querySelector('[data-hour="7"]');
      if (hourEl) hourEl.scrollIntoView({ block: "start" });
    }
  }, [date, highlightId, events]);

  if (!date) return null;
  const dStr = dateKey(date);
  const allDay = events.filter((ev) => (ev.start || "").length <= 10);
  const timed = events.filter((ev) => (ev.start || "").length > 10);
  const byHour = {};
  timed.forEach((ev) => {
    const h = parseInt((ev.start || "").slice(11, 13), 10) || 0;
    (byHour[h] = byHour[h] || []).push(ev);
  });

  const dateLabel = date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const canEdit = can("calendar", "edit");

  return (
    <Dialog open={!!date} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl rounded-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="capitalize">{dateLabel}</DialogTitle>
          <DialogDescription className="sr-only">Eventi del giorno</DialogDescription>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-soft rounded-2xl border border-border divide-y divide-border">
          {(allDay.length > 0 || canEdit) && (
            <div className="sticky top-0 z-10 bg-card/95 backdrop-blur space-y-1 p-1.5 border-b border-border">
              {allDay.map((ev) => {
                const k = KINDS.find((x) => x.value === ev.kind) || KINDS[0];
                return (
                  <button key={ev.id} onClick={() => onEditEvent(ev)}
                          className={`block w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-xl ${k.color} ${ev.id === highlightId ? "ring-2 ring-primary" : ""}`}>
                    {ev.title} <span className="opacity-60 font-normal">· tutto il giorno</span>
                  </button>
                );
              })}
              {canEdit && (
                <button onClick={() => onAddEvent(dStr)} className="text-xs text-muted-foreground hover:text-foreground font-semibold px-2.5 py-1">
                  + Aggiungi evento per tutto il giorno
                </button>
              )}
            </div>
          )}
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} data-hour={h} className="flex min-h-[48px]">
              <div className="w-14 shrink-0 text-xs text-muted-foreground py-1.5 px-2 border-r border-border">{pad2(h)}:00</div>
              <div className={`flex-1 p-1 space-y-1 ${canEdit ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}`}
                   onClick={() => canEdit && onAddEvent(`${dStr}T${pad2(h)}:00`)}>
                {(byHour[h] || []).map((ev) => {
                  const k = KINDS.find((x) => x.value === ev.kind) || KINDS[0];
                  return (
                    <button key={ev.id}
                            onClick={(e) => { e.stopPropagation(); onEditEvent(ev); }}
                            className={`block w-full text-left text-xs font-semibold px-2 py-1 rounded-lg ${k.color} ${ev.id === highlightId ? "ring-2 ring-primary" : ""}`}>
                      {(ev.start || "").slice(11, 16)} — {ev.title}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const F = ({ label, children }) => (
  <label className="block text-sm"><span className="block font-semibold mb-1">{label}</span>{children}</label>
);
