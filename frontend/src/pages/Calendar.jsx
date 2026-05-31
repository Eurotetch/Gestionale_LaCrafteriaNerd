import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { CALENDAR } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

const KINDS = [
  { value: "lavorazione", label: "🛠️ Lavorazione", color: "bg-primary/30 text-primary-foreground" },
  { value: "scadenza",    label: "⏰ Scadenza",     color: "bg-destructive/15 text-destructive" },
  { value: "evento",      label: "✨ Evento",       color: "bg-accent/20 text-accent" },
];

const empty = () => ({ title: "", description: "", start: new Date().toISOString().slice(0, 10), end: "", kind: "lavorazione" });

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

export default function CalendarPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);

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
    const d = (ev.start || "").slice(0, 10);
    (acc[d] = acc[d] || []).push(ev);
    return acc;
  }, {});

  return (
    <div data-testid={CALENDAR.root} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent font-bold">agenda</div>
          <h1 className="text-3xl sm:text-4xl">Calendario Lavorazioni 📆</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-xl hover:bg-muted" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={16}/></button>
          <div className="font-bold capitalize min-w-[160px] text-center">{monthName}</div>
          <button className="p-2 rounded-xl hover:bg-muted" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={16}/></button>
          {can("calendar", "edit") && (
            <button data-testid={CALENDAR.addBtn} className="crafteria-btn-primary flex items-center gap-2 ml-2" onClick={() => { setEdit(empty()); setOpen(true); }}>
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
            const key = d ? d.toISOString().slice(0, 10) : `e-${i}`;
            const isToday = d && d.toDateString() === today.toDateString();
            const dayEvents = (d && eventsByDay[key]) || [];
            return (
              <div key={key}
                   className={`min-h-[90px] rounded-2xl p-2 border ${d ? "bg-card border-border/70" : "bg-transparent border-transparent"} ${isToday ? "ring-2 ring-primary" : ""}`}>
                {d && (
                  <>
                    <div className="text-xs font-bold mb-1 flex items-center justify-between">
                      <span>{d.getDate()}</span>
                      {can("calendar", "edit") && (
                        <button onClick={() => { setEdit({ ...empty(), start: key }); setOpen(true); }}
                                className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-muted-foreground text-xs">+</button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const k = KINDS.find((x) => x.value === ev.kind) || KINDS[0];
                        return (
                          <button key={ev.id}
                                  onClick={() => { setEdit({ ...ev }); setOpen(true); }}
                                  className={`block w-full text-left text-[10px] font-semibold px-1.5 py-1 rounded-lg ${k.color} truncate`}
                                  data-testid={`event-${ev.id}`}>
                            {ev.title}
                          </button>
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
          <DialogHeader><DialogTitle>{edit?.id ? "Modifica evento" : "Nuovo evento"}</DialogTitle></DialogHeader>
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
              <F label="Data inizio *"><input type="date" className="crafteria-input w-full" value={edit.start || ""} onChange={(e) => setEdit({ ...edit, start: e.target.value })}/></F>
              <F label="Data fine"><input type="date" className="crafteria-input w-full" value={edit.end || ""} onChange={(e) => setEdit({ ...edit, end: e.target.value })}/></F>
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
    </div>
  );
}

const F = ({ label, children }) => (
  <label className="block text-sm"><span className="block font-semibold mb-1">{label}</span>{children}</label>
);
