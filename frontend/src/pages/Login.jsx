import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { AUTH } from "@/constants/testIds";
import { Sparkles, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { user, login, setupPassword } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mode, setMode] = useState("login");      // login | setup
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (user) { navigate("/"); return null; }

  const handleCheck = async (e) => {
    e?.preventDefault();
    if (!email) return;
    setChecking(true); setError(null);
    try {
      const { data } = await api.post("/auth/check-email", { email });
      if (!data.exists) {
        setError("Email non riconosciuta. Contatta l'admin per ricevere un accesso.");
        setMode("login");
      } else if (data.disabled) {
        setError("Questo account è disabilitato.");
      } else if (data.requires_password_setup) {
        setMode("setup");
      } else {
        setMode("login");
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      if (mode === "setup") {
        if (password.length < 6) throw new Error("Password troppo corta (min 6 caratteri)");
        if (password !== confirm) throw new Error("Le password non coincidono");
        await setupPassword(email, password);
      } else {
        await login(email, password);
      }
      navigate("/");
    } catch (err) {
      setError(err.message?.startsWith("Le password") || err.message?.startsWith("Password troppo")
        ? err.message
        : formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen gradient-warm flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 sparkle-dots opacity-60 pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <img
            src="https://www.lacrafterianerd.com/img/site/Logo.png"
            alt="La Crafteria Nerd"
            className="h-24 mx-auto drop-shadow-md"
          />
          <h1 className="mt-4 text-3xl sm:text-4xl tracking-tight">
            Benvenuta in bottega <span className="inline-block">✨</span>
          </h1>
          <p className="text-muted-foreground mt-2 flex items-center justify-center gap-1.5">
            <Sparkles size={14} className="text-primary"/> Gestionale La Crafteria Nerd
          </p>
        </div>

        <form
          onSubmit={mode === "check" ? handleCheck : handleSubmit}
          className="crafteria-card p-7 sm:p-8 space-y-4"
        >
          <div>
            <label className="text-sm font-semibold block mb-1.5">Email</label>
            <input
              data-testid={AUTH.emailInput}
              type="email"
              className="crafteria-input w-full"
              placeholder="tua@email.it"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setMode("login"); }}
              required
              autoComplete="username"
            />
          </div>

          {mode === "setup" && (
            <div className="bg-primary/10 border border-primary/30 rounded-2xl p-3 text-sm">
              🐉 <strong>Primo accesso!</strong> Imposta ora la tua password.
            </div>
          )}

          <div>
            <label className="text-sm font-semibold block mb-1.5">
              {mode === "setup" ? "Nuova password" : "Password"}
            </label>
            <input
              data-testid={AUTH.passwordInput}
              type="password"
              className="crafteria-input w-full"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "setup" ? "new-password" : "current-password"}
            />
          </div>

          {mode === "setup" && (
            <div>
              <label className="text-sm font-semibold block mb-1.5">Conferma password</label>
              <input
                data-testid={AUTH.confirmPasswordInput}
                type="password"
                className="crafteria-input w-full"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
              />
            </div>
          )}

          {error && (
            <div data-testid={AUTH.errorAlert}
                 className="rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive p-3 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleCheck}
              disabled={!email || checking}
              className="flex-1 rounded-2xl bg-muted text-foreground font-semibold px-4 py-3 hover:bg-muted/70 transition-all disabled:opacity-50"
            >
              {checking ? <Loader2 className="animate-spin mx-auto" size={16}/> : "Verifica email"}
            </button>
            <button
              type="submit"
              data-testid={mode === "setup" ? AUTH.setupBtn : AUTH.loginBtn}
              disabled={busy}
              className="flex-1 crafteria-btn-primary py-3 disabled:opacity-60"
            >
              {busy ? <Loader2 className="animate-spin mx-auto" size={16}/> : (mode === "setup" ? "Imposta & Entra" : "Entra")}
            </button>
          </div>

          <p className="text-xs text-muted-foreground text-center pt-2">
            Premi <strong>Verifica email</strong> al primo accesso per impostare la password.
          </p>
        </form>

        <div className="text-center mt-6 text-xs text-muted-foreground">
          Fatto con 💛 nella bottega di La Crafteria Nerd
        </div>
      </div>
    </div>
  );
}
