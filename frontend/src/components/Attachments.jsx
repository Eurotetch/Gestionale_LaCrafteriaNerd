import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, API_BASE } from "@/lib/api";
import { Paperclip, Upload, Trash2, FileText, Image as ImgIcon, Box as BoxIcon, Loader2, Download } from "lucide-react";
import { toast } from "sonner";

const iconFor = (ct = "", name = "") => {
  if (ct.startsWith("image/")) return ImgIcon;
  if (name.toLowerCase().endsWith(".stl") || ct.startsWith("model/")) return BoxIcon;
  return FileText;
};

const isImage = (ct = "") => ct.startsWith("image/");

const fmtSize = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export default function Attachments({ parentType, parentId, canEdit = true }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const { data: files = [] } = useQuery({
    queryKey: ["files", parentType, parentId],
    queryFn: async () => (await api.get("/files", { params: { parent_type: parentType, parent_id: parentId } })).data,
    enabled: !!parentId,
  });

  const onSelect = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast.error("File troppo grande (max 25 MB)"); return; }
    const form = new FormData();
    form.append("file", f);
    setUploading(true);
    try {
      await api.post(`/upload?parent_type=${parentType}&parent_id=${parentId}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      qc.invalidateQueries({ queryKey: ["files", parentType, parentId] });
      toast.success("File caricato ✨");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const del = useMutation({
    mutationFn: async (id) => (await api.delete(`/files/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["files", parentType, parentId] }); toast.success("Eliminato"); },
  });

  const downloadUrl = (id) => {
    const token = localStorage.getItem("crafteria_token");
    return `${API_BASE}/files/${id}/download?auth=${encodeURIComponent(token)}`;
  };

  return (
    <div className="rounded-2xl bg-muted/30 border border-border/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip size={14}/> Allegati <span className="text-muted-foreground text-xs">({files.length})</span>
        </div>
        {canEdit && (
          <button onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="text-xs font-semibold inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-1.5 hover:brightness-105 disabled:opacity-50"
                  data-testid="upload-file-btn">
            {uploading ? <Loader2 className="animate-spin" size={12}/> : <Upload size={12}/>}
            {uploading ? "…" : "Carica"}
          </button>
        )}
        <input ref={fileRef} type="file" className="hidden" onChange={onSelect}
               accept="image/*,application/pdf,.stl,.txt"/>
      </div>

      {files.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">Nessun allegato</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {files.map((f) => {
          const Icon = iconFor(f.content_type, f.original_filename);
          return (
            <div key={f.id} className="bg-card rounded-xl p-2 border border-border/60 group relative">
              <a href={downloadUrl(f.id)} target="_blank" rel="noreferrer" className="block">
                {isImage(f.content_type) ? (
                  <img src={downloadUrl(f.id)} alt={f.original_filename}
                       className="aspect-square w-full object-cover rounded-lg" />
                ) : (
                  <div className="aspect-square w-full grid place-items-center rounded-lg bg-muted/60">
                    <Icon size={28} className="text-muted-foreground"/>
                  </div>
                )}
                <div className="text-[10px] font-semibold mt-1.5 truncate">{f.original_filename}</div>
                <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                  <span>{fmtSize(f.size || 0)}</span>
                  <Download size={10}/>
                </div>
              </a>
              {canEdit && (
                <button onClick={() => window.confirm("Eliminare?") && del.mutate(f.id)}
                        className="absolute top-1 right-1 p-1 rounded-md bg-card/95 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`delete-file-${f.id}`}>
                  <Trash2 size={12}/>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
