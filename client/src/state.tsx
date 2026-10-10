import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, errorMessage, tokenStore } from "./api";
import type { Catalog, User } from "./types";

// ---------------------------------- Toasts ------------------------------------------

interface Toast { id: number; text: string; kind: "info" | "error" }
const ToastCtx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => {
  const push = useContext(ToastCtx);
  return useMemo(() => ({
    info: (text: string) => push(text, "info"),
    error: (err: unknown) => push(errorMessage(err), "error"),
  }), [push]);
};

// ---------------------------------- Auth --------------------------------------------

interface Usage { month: string; generations: number; projects: number }
interface AuthState {
  user: User | null;
  usage: Usage | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: Record<string, unknown>) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setLoading(false); return; }
    try {
      const me = await api.get<{ user: User; usage: Usage }>("/auth/me");
      setUser(me.user);
      setUsage(me.usage);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onLogout = () => setUser(null);
    window.addEventListener("vistora:logout", onLogout);
    return () => window.removeEventListener("vistora:logout", onLogout);
  }, [refresh]);

  const value = useMemo<AuthState>(() => ({
    user, usage, loading, refresh, setUser,
    login: async (email, password) => {
      const r = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
      tokenStore.set(r.token);
      setUser(r.user);
      refresh();
    },
    register: async (data) => {
      const r = await api.post<{ token: string; user: User }>("/auth/register", data);
      tokenStore.set(r.token);
      setUser(r.user);
      refresh();
    },
    logout: () => { tokenStore.set(null); setUser(null); setUsage(null); },
  }), [user, usage, loading, refresh]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
};

// --------------------------------- Catalog ------------------------------------------

const CatalogCtx = createContext<Catalog | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<Catalog>("/catalog").then(setCatalog).catch((e) => setError(errorMessage(e)));
    // Keep exchange rates, prices and capabilities fresh in long-lived tabs.
    const t = setInterval(() => {
      if (document.visibilityState === "visible") api.get<Catalog>("/catalog").then(setCatalog).catch(() => {});
    }, 30 * 60_000);
    return () => clearInterval(t);
  }, []);
  if (error) return <div className="container section"><div className="empty">Could not reach the VISTORA API: {error}</div></div>;
  if (!catalog) return <div className="container section muted">Loading VISTORA…</div>;
  return <CatalogCtx.Provider value={catalog}>{children}</CatalogCtx.Provider>;
}

export const useCatalog = () => {
  const ctx = useContext(CatalogCtx);
  if (!ctx) throw new Error("useCatalog outside CatalogProvider");
  return ctx;
};

// --------------------------------- Money --------------------------------------------

/** Amounts are stored in ZAR; display them in the user's preferred currency. */
export function useMoney(currencyOverride?: string) {
  const catalog = useCatalog();
  const { user } = useAuth();
  const code = currencyOverride ?? user?.currency ?? "ZAR";
  const cur = catalog.currencies[code] ?? catalog.currencies.ZAR;
  return useMemo(() => {
    const fmt = new Intl.NumberFormat(cur.locale, { style: "currency", currency: code, maximumFractionDigits: 0 });
    return {
      code,
      symbol: cur.symbol,
      format: (zar: number) => fmt.format(zar * cur.perZar),
      fromZar: (zar: number) => Math.round(zar * cur.perZar * 100) / 100,
      toZar: (value: number) => Math.round((value / cur.perZar) * 100) / 100,
    };
  }, [code, cur]);
}
