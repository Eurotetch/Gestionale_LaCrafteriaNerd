import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("crafteria_token");
    if (!token) { setUser(null); setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("crafteria_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("crafteria_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const setupPassword = async (email, new_password) => {
    const { data } = await api.post("/auth/setup-password", { email, new_password });
    localStorage.setItem("crafteria_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("crafteria_token");
    setUser(null);
    window.location.href = "/login";
  };

  const can = (module, action = "view") => {
    if (!user) return false;
    if (user.role === "admin") return true;
    const p = (user.permissions || {})[module] || {};
    return !!p[action];
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh, setupPassword, can }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
