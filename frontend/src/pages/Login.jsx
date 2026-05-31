import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { AUTH } from "@/constants/testIds";
import { Sparkles, Loader2, ArrowRight, ArrowLeft, KeyRound } from "lucide-react";

export default function LoginPage() {
  const { user, login, setupPassword } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState("email");  // email | login | setup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (user) navigate("/"); }, [user, navigate]);

  const handleCheck = async (e) => {
    e?.preventDefault();
    if (!email) return;
    setBusy(true); setError(null);
    try {
      const { data } = await api.post("/auth/check-email", { email });
      if (!data.exists) {
        setError("Email non riconosciuta. Contatta l'admin per ricevere un accesso.");
        return;
      }
      if (data.disabled) {
        setError("Questo account è disabilitato. Contatta l'admin.");
        return;
      }
      if (data.requires_password_setup) {
        setStep("setup"); setPassword(""); setConfirm("");
      } else {
        setStep("login"); setPassword("");
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      if (step === "setup") {
        if (password.length < 6) throw new Error("Password troppo corta (min 6 caratteri)");
        if (password !== confirm) throw new Error("Le password non coincidono");
        await setupPassword(email, password);
      } else {
        await login(email, password);
      }
      navigate("/");
    } catch (err) {
      const msg = err.message?.startsWith("Le password") || err.message?.startsWith("Password troppo")
        ? err.message : formatApiError(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => { setStep("email"); setPassword(""); setConfirm(""); setError(null); };

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
          onSubmit={step === "email" ? handleCheck : handleSubmit}
          className="crafteria-card p-7 sm:p-8 space-y-4"
        >
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest">
            <span className={step === "email" ? "text-primary" : "text-muted-foreground"}>① Email</span>
            <span className="text-muted-foreground">→</span>
            <span className={step !== "email" ? "text-primary" : "text-muted-foreground"}>
              ② {step === "setup" ? "Imposta password" : "Password"}
            </span>
          </div>

          {step === "email" && (
            <>
              <label className="block text-sm">
                <span className="block font-semibold mb-1.5">Email</span>
                <input
                  data-testid={AUTH.emailInput}
                  type="email"
                  className="crafteria-input w-full"
                  placeholder="tua@email.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  autoFocus
                />
              </label>
              <button
                type="submit"
                data-testid="login-continue-btn"
                disabled={!email || busy}
                className="w-full crafteria-btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy ? <Loader2 className="animate-spin" size={16}/> : <>Continua <ArrowRight size={16}/></>}
              </button>
              <p className="text-xs text-muted-foreground text-center pt-1">
                Inserisci la tua email per iniziare. Se è il primo accesso ti chiederemo di impostare la password.
              </p>
            </>
          )}

          {step !== "email" && (
            <>
              <button type="button" onClick={goBack}
                      className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors">
                <ArrowLeft size={12}/> Cambia email
              </button>

              <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm font-semibold flex items-center gap-2">
                <KeyRound size={14} className="text-primary"/> {email}
              </div>

              {step === "setup" && (
                <div className="bg-primary/10 border border-primary/30 rounded-2xl p-3 text-sm">
                  🐉 <strong>Primo accesso!</strong> Scegli ora la tua password personale.
                </div>
              )}

              <label className="block text-sm">
                <span className="block font-semibold mb-1.5">
                  {step === "setup" ? "Nuova password" : "Password"}
                </span>
                <input
                  data-testid={AUTH.passwordInput}
                  type="password"
                  className="crafteria-input w-full"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                  autoComplete={step === "setup" ? "new-password" : "current-password"}
                />
              </label>

              {step === "setup" && (
                <label className="block text-sm">
                  <span className="block font-semibold mb-1.5">Conferma password</span>
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
                </label>
              )}

              <button
                type="submit"
                data-testid={step === "setup" ? AUTH.setupBtn : AUTH.loginBtn}
                disabled={busy}
                className="w-full crafteria-btn-primary py-3 disabled:opacity-60"
              >
                {busy ? <Loader2 className="animate-spin mx-auto" size={16}/>
                      : (step === "setup" ? "✨ Imposta password & Entra" : "Entra")}
              </button>
            </>
          )}

          {error && (
            <div data-testid={AUTH.errorAlert}
                 className="rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive p-3 text-sm">
              {error}
            </div>
          )}
        </form>

        <div className="text-center mt-6 text-xs text-muted-foreground">
          Fatto con 💛 nella bottega di La Crafteria Nerd
        </div>
      </div>
    </div>
  );
}
