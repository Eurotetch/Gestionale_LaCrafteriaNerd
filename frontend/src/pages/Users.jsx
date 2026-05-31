import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { USERS } from "@/constants/testIds";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "pos",       label: "Cassa / POS" },
  { key: "orders",    label: "Ordini" },
  { key: "customers", label: "Clienti" },
  { key: "products",  label: "Catalogo" },
  { key: "inventory", label: "Magazzino" },
  { key: "invoices",  label: "Fatture" },
  { key: "calendar",  label: "Calendario" },
  { key: "reports",   label: "Report" },
];

const defaultPerms = () =>
  MODULES.reduce((acc, m) => { acc[m.key] = { view: false, edit: false, delete: false }; return acc; }, {});

const emptyUser = () => ({
  email: "", name: "", password: "", role: "collaborator", grant_all: false, permissions: defaultPerms(),
});

export default function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
    refetchInterval: 5000,
  });

  const create = useMutation({
    mutationFn: async (u) => (await api.post("/users", u)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setOpen(false); toast.success("Utente creato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });
  const update = useMutation({
    mutationFn: async (u) => (await api.patch(`/users/${u.id}`, {
      name: u.name, permissions: u.permissions, grant_all: u.grant_all,
      disabled: u.disabled, new_password: u.new_password || undefined,
    })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setOpen(false); toast.success("Utente aggiornato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });
  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/users/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); toast.success("Eliminato"); },
    onError: (e) => toast.error(formatApiError(e)),
  });

  const openNew = () => { setEdit({ ...emptyUser() }); setIsNew(true); setOpen(true); };
  const openEdit = (u) => {
    const perms = { ...defaultPerms(), ...(u.permissions || {}) };
    setEdit({ ...u, permissions: perms, new_password: "" });
    setIsNew(false); setOpen(true);
  };

  const togglePerm = (mod, act) => {
    setEdit((u) => ({
      ...u,
      permissions: {
        ...u.permissions,
        [mod]: { ...u.permissions[mod], [act]: !u.permissions[mod][act] },
      },
      grant_all: false,
    }));
  };

  return (
    <div data-testid={USERS.root} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-destructive font-bold">amministrazione</div>
          <h1 className="text-3xl sm:text-4xl">Utenti & Permessi 🔐</h1>
          <p className="text-muted-foreground mt-1">Gestisci collaboratori e i loro accessi modulo per modulo.</p>
        </div>
        <button data-testid={USERS.addBtn} className="crafteria-btn-primary flex items-center gap-2" onClick={openNew}>
          <Plus size={16}/> Nuovo collaboratore
        </button>
      </div>

      <div className="crafteria-card overflow-hidden">
        <div className="overflow-x-auto scrollbar-soft">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-5 py-3 font-semibold">Nome</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Ruolo</th>
                <th className="px-5 py-3 font-semibold">Accessi</th>
                <th className="px-5 py-3 font-semibold">Stato</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isAdmin = u.role === "admin";
                const grantAll = u.grant_all || isAdmin;
                return (
                  <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-5 py-3 font-semibold">{u.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${isAdmin ? "bg-primary/30 text-primary-foreground" : "bg-muted"}`}>
                        {isAdmin && <ShieldCheck size={12}/>} {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {grantAll ? "Tutto" :
                        Object.entries(u.permissions || {}).filter(([_, v]) => v?.view).map(([k]) => k).join(", ") || "Nessuno"}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${u.disabled ? "bg-destructive/15 text-destructive" : "bg-accent/15 text-accent"}`}>
                        {u.disabled ? "Disattivato" : "Attivo"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => openEdit(u)} className="p-2 rounded-lg hover:bg-muted" data-testid={`edit-user-${u.id}`}><Edit2 size={14}/></button>
                      {u.email !== me.email && !isAdmin && (
                        <button onClick={() => window.confirm("Eliminare?") && del.mutate(u.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-destructive" data-testid={`delete-user-${u.id}`}>
                          <Trash2 size={14}/>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Nuovo collaboratore" : `Modifica: ${edit?.email}`}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <F label="Nome *"><input className="crafteria-input w-full" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })}/></F>
                <F label="Email *"><input disabled={!isNew} type="email" className="crafteria-input w-full disabled:opacity-60" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })}/></F>
                {isNew && (
                  <F label="Password iniziale *"><input type="text" className="crafteria-input w-full" value={edit.password || ""} onChange={(e) => setEdit({ ...edit, password: e.target.value })} placeholder="min 6 caratteri"/></F>
                )}
                {!isNew && (
                  <F label="Nuova password (opz.)"><input type="text" className="crafteria-input w-full" value={edit.new_password || ""} onChange={(e) => setEdit({ ...edit, new_password: e.target.value })} placeholder="lascia vuoto per non cambiare"/></F>
                )}
                <F label="Stato">
                  <select className="crafteria-input w-full" value={edit.disabled ? "disabled" : "active"} onChange={(e) => setEdit({ ...edit, disabled: e.target.value === "disabled" })}>
                    <option value="active">Attivo</option><option value="disabled">Disattivato</option>
                  </select>
                </F>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!edit.grant_all} onChange={(e) => setEdit({ ...edit, grant_all: e.target.checked })} data-testid="user-grant-all"/>
                <span className="font-semibold">🌟 Concedi tutti i permessi (stessi poteri dell'admin)</span>
              </label>

              {!edit.grant_all && (
                <div className="rounded-2xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2 font-bold">Modulo</th>
                        <th className="px-3 py-2 font-bold text-center">Vedi</th>
                        <th className="px-3 py-2 font-bold text-center">Modifica</th>
                        <th className="px-3 py-2 font-bold text-center">Elimina</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map((m) => (
                        <tr key={m.key} className="border-t border-border">
                          <td className="px-4 py-2 font-semibold">{m.label}</td>
                          {["view", "edit", "delete"].map((a) => (
                            <td key={a} className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={!!edit.permissions?.[m.key]?.[a]}
                                onChange={() => togglePerm(m.key, a)}
                                data-testid={`perm-${m.key}-${a}`}
                                className="h-4 w-4 accent-primary"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <button className="crafteria-btn-primary" data-testid={USERS.saveBtn} onClick={() => isNew ? create.mutate(edit) : update.mutate(edit)}>
              Salva
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const F = ({ label, children }) => (
  <label className="block text-sm"><span className="block font-semibold mb-1">{label}</span>{children}</label>
);
