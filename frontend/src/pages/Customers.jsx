import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { CUSTOMERS } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Search, Mail, Phone, MapPin } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const empty = () => ({ name: "", email: "", phone: "", address: "", notes: "", tags: [] });

export default function CustomersPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await api.get("/customers")).data,
    refetchInterval: 3000,
  });

  const save = useMutation({
    mutationFn: async (o) => o.id ? (await api.patch(`/customers/${o.id}`, o)).data
                                  : (await api.post(`/customers`, o)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); setOpen(false); toast.success("Cliente salvato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/customers/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); toast.success("Eliminato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const filtered = items.filter((c) => {
    const s = search.toLowerCase();
    return !s || [c.name, c.email, c.phone].some((v) => (v || "").toLowerCase().includes(s));
  });

  return (
    <div data-testid={CUSTOMERS.root} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-secondary font-bold">crm</div>
          <h1 className="text-3xl sm:text-4xl">Clienti 👥</h1>
          <p className="text-muted-foreground mt-1">La tua rubrica artigianale.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input className="crafteria-input pl-9 w-full sm:w-64" placeholder="Cerca cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {can("customers", "edit") && (
            <button data-testid={CUSTOMERS.addBtn} className="crafteria-btn-primary flex items-center gap-2" onClick={() => { setEdit(empty()); setOpen(true); }}>
              <Plus size={16}/> Nuovo
            </button>
          )}
        </div>
      </div>

      <div className="crafteria-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-5 py-3 font-semibold">Nome</th>
                <th className="px-5 py-3 font-semibold">Contatti</th>
                <th className="px-5 py-3 font-semibold">Indirizzo</th>
                <th className="px-5 py-3 font-semibold">Note</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3 font-semibold">{c.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    <div className="space-y-0.5">
                      {c.email && <div className="flex items-center gap-1.5"><Mail size={12}/>{c.email}</div>}
                      {c.phone && <div className="flex items-center gap-1.5"><Phone size={12}/>{c.phone}</div>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {c.address && <div className="flex items-center gap-1.5"><MapPin size={12}/>{c.address}</div>}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground max-w-xs truncate">{c.notes}</td>
                  <td className="px-5 py-3 text-right">
                    {can("customers", "edit") && (
                      <button onClick={() => { setEdit({ ...c }); setOpen(true); }} className="p-2 rounded-lg hover:bg-muted" data-testid={`edit-customer-${c.id}`}>
                        <Edit2 size={14}/>
                      </button>
                    )}
                    {can("customers", "delete") && (
                      <button onClick={() => window.confirm("Eliminare?") && del.mutate(c.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" data-testid={`delete-customer-${c.id}`}>
                        <Trash2 size={14}/>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">Nessun cliente — aggiungine uno per iniziare ✨</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader><DialogTitle>{edit?.id ? "Modifica cliente" : "Nuovo cliente"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label="Nome *"><input className="crafteria-input w-full" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })}/></F>
              <F label="Email"><input className="crafteria-input w-full" value={edit.email || ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })}/></F>
              <F label="Telefono"><input className="crafteria-input w-full" value={edit.phone || ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })}/></F>
              <F label="Indirizzo"><input className="crafteria-input w-full" value={edit.address || ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })}/></F>
              <div className="sm:col-span-2">
                <F label="Note">
                  <textarea rows={3} className="crafteria-input w-full" value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })}/>
                </F>
              </div>
            </div>
          )}
          <DialogFooter>
            <button className="crafteria-btn-primary" data-testid={CUSTOMERS.saveBtn} onClick={() => save.mutate(edit)}>Salva</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const F = ({ label, children }) => (
  <label className="block text-sm"><span className="block font-semibold mb-1">{label}</span>{children}</label>
);
