import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./state";
import { Logo } from "./components/ui";
import Landing from "./pages/Landing";
import { Login, Register } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Marketplace from "./pages/Marketplace";
import Contractors from "./pages/Contractors";
import StyleQuiz from "./pages/StyleQuiz";
import Shared from "./pages/Shared";
import Account from "./pages/Account";
import Workspace from "./pages/Workspace";

const ProjectPage = lazy(() => import("./pages/Project"));

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="container section muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() => {
    try { return localStorage.getItem("vistora.theme") ?? "auto"; } catch { return "auto"; }
  });
  useEffect(() => {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("vistora.theme", theme); } catch { /* ignore */ }
  }, [theme]);
  const next = theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto";
  return <button className="btn ghost sm" style={{ fontSize: 17 }} onClick={() => setTheme(next)} title={`Theme: ${theme}`} aria-label={`Theme: ${theme}`}>{theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}</button>;
}

function TopBar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <header className="topbar">
      <div className="container">
        <Link to={user ? "/app" : "/"} className="brand"><Logo size={30} /> VISTORA</Link>
        <nav className={`nav ${open ? "open" : ""}`}>
          {user ? (
            <>
              <NavLink to="/app" end>Projects</NavLink>
              <NavLink to="/marketplace">Marketplace</NavLink>
              <NavLink to="/contractors">Contractors</NavLink>
              <NavLink to="/style-quiz">Style DNA</NavLink>
              <NavLink to="/workspace">Pro Workspace</NavLink>
              <NavLink to="/account">Account</NavLink>
            </>
          ) : (
            <>
              <a href="/#features">Features</a>
              <a href="/#how">How it works</a>
              <a href="/#pricing">Pricing</a>
              <NavLink to="/marketplace">Marketplace</NavLink>
            </>
          )}
        </nav>
        <div className="row" style={{ gap: 6 }}>
          <ThemeToggle />
          {user ? (
            <button className="btn sm" onClick={logout}>Sign out</button>
          ) : (
            <>
              <Link className="btn ghost sm" to="/login">Sign in</Link>
              <Link className="btn primary sm" to="/register">Start free</Link>
            </>
          )}
          <button className="btn ghost sm menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const loc = useLocation();
  const bare = loc.pathname.startsWith("/s/");
  return (
    <>
      {!bare && <TopBar />}
      <main>
        <Suspense fallback={<div className="container section muted">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/s/:token" element={<Shared />} />
            <Route path="/app" element={<Protected><Dashboard /></Protected>} />
            <Route path="/projects/:id" element={<Protected><ProjectPage /></Protected>} />
            <Route path="/contractors" element={<Protected><Contractors /></Protected>} />
            <Route path="/style-quiz" element={<Protected><StyleQuiz /></Protected>} />
            <Route path="/workspace" element={<Protected><Workspace /></Protected>} />
            <Route path="/account" element={<Protected><Account /></Protected>} />
            <Route path="*" element={<div className="container section"><div className="empty">Page not found. <Link to="/">Go home</Link></div></div>} />
          </Routes>
        </Suspense>
      </main>
      {!bare && (
        <footer className="site">
          <div className="container row between">
            <span>© {new Date().getFullYear()} VISTORA · See the space. Shape the future.</span>
            <span>Made in South Africa 🇿🇦 · Prices are indicative estimates incl. 15% VAT</span>
          </div>
        </footer>
      )}
    </>
  );
}
