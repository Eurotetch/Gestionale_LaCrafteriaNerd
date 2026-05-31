import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children, module, action = "view", adminOnly = false }) {
  const { user, loading, can } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground animate-pulse">Caricamento…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  if (module && !can(module, action)) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-2xl mb-2">🔒 Accesso negato</h2>
        <p className="text-muted-foreground">Non hai il permesso di accedere a questa sezione.</p>
      </div>
    );
  }
  return children;
}
