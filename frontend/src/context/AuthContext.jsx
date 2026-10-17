import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { tokens } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokens.access || tokens.refresh));

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener("scm:logout", onLogout);
    return () => window.removeEventListener("scm:logout", onLogout);
  }, []);

  useEffect(() => {
    if (!tokens.access && !tokens.refresh) return;
    api
      .get("/auth/me/")
      .then((res) => setUser(res.data))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post("/auth/login/", { username, password });
    tokens.set(data);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
