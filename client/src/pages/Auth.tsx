import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth, useCatalog, useToast } from "../state";
import { Logo } from "../components/ui";

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      nav((loc.state as { from?: string } | null)?.from ?? "/app");
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  return (
    <div className="container section" style={{ maxWidth: 440 }}>
      <form className="card stack" onSubmit={submit}>
        <div className="row"><Logo size={36} /><h2 style={{ margin: 0 }}>Welcome back</h2></div>
        <label className="field">Email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Password<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn primary block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="small muted">New to VISTORA? <Link to="/register">Create a free account</Link></p>
      </form>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const catalog = useCatalog();
  const nav = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", accountType: "homeowner", company: "", province: "Gauteng" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register({ ...form, company: form.company || undefined });
      nav("/style-quiz?welcome=1");
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="container section" style={{ maxWidth: 520 }}>
      <form className="card stack" onSubmit={submit}>
        <div className="row"><Logo size={36} /><h2 style={{ margin: 0 }}>Create your VISTORA account</h2></div>
        <label className="field">Full name<input required minLength={2} value={form.name} onChange={set("name")} autoComplete="name" /></label>
        <label className="field">Email<input type="email" required value={form.email} onChange={set("email")} autoComplete="email" /></label>
        <label className="field">Password (min. 8 characters)<input type="password" required minLength={8} value={form.password} onChange={set("password")} autoComplete="new-password" /></label>
        <div className="form-grid">
          <label className="field">I am a…
            <select value={form.accountType} onChange={set("accountType")}>
              <option value="homeowner">Homeowner</option>
              <option value="designer">Interior designer</option>
              <option value="contractor">Contractor / builder</option>
              <option value="developer">Property developer / architect</option>
            </select>
          </label>
          <label className="field">Province
            <select value={form.province} onChange={set("province")}>{catalog.provinces.map((p) => <option key={p.name}>{p.name}</option>)}</select>
          </label>
        </div>
        {form.accountType !== "homeowner" && <label className="field">Company (optional)<input value={form.company} onChange={set("company")} /></label>}
        <button className="btn primary block" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
        <p className="small muted">Already have an account? <Link to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
