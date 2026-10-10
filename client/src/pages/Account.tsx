import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth, useCatalog, useToast } from "../state";
import type { PlanId, User } from "../types";

export default function Account() {
  const { user, setUser, usage, refresh, logout } = useAuth();
  const catalog = useCatalog();
  const toast = useToast();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: user!.name, currency: user!.currency, province: user!.province, accountType: user!.accountType, company: user!.company ?? "" });
  const [pw, setPw] = useState({ current: "", next: "" });

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    try { setUser((await api.patch<{ user: User }>("/auth/me", { ...form, company: form.company || null })).user); toast.info("Profile saved"); } catch (err) { toast.error(err); }
  };
  const changePlan = async (plan: PlanId) => {
    try { setUser((await api.post<{ user: User }>("/auth/me/plan", { plan })).user); refresh(); toast.info(`You're now on ${catalog.plans[plan].name}`); } catch (err) { toast.error(err); }
  };
  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    try { await api.post("/auth/me/password", pw); setPw({ current: "", next: "" }); toast.info("Password updated"); } catch (err) { toast.error(err); }
  };
  const deleteAccount = async () => {
    if (!confirm("Permanently delete your account and all projects? This cannot be undone.")) return;
    await api.del("/auth/me");
    logout();
    nav("/");
  };

  return (
    <div className="container" style={{ paddingBottom: 48 }}>
      <div className="page-head"><div><h1>Account</h1><p className="muted">{user!.email}</p></div></div>
      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <form className="card stack" onSubmit={saveProfile}>
          <h3 style={{ margin: 0 }}>Profile & preferences</h3>
          <label className="field">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <div className="form-grid">
            <label className="field">Display currency<select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{Object.keys(catalog.currencies).map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="field">Province (pricing & solar)<select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })}>{catalog.provinces.map((p) => <option key={p.name}>{p.name}</option>)}</select></label>
          </div>
          <div className="form-grid">
            <label className="field">Account type
              <select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value as User["accountType"] })}>
                <option value="homeowner">Homeowner</option><option value="designer">Interior designer</option><option value="contractor">Contractor</option><option value="developer">Developer / architect</option>
              </select>
            </label>
            <label className="field">Company<input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
          </div>
          <button className="btn primary">Save</button>
          <p className="tiny" style={{ margin: 0 }}>Amounts are stored in rand and converted at indicative exchange rates.</p>
        </form>

        <div className="stack">
          <div className="card stack">
            <h3 style={{ margin: 0 }}>Subscription</h3>
            {usage && <p className="small muted" style={{ margin: 0 }}>This month: {usage.generations} / {user!.planDetails.monthlyGenerations} AI redesigns · {usage.projects} / {user!.planDetails.maxProjects >= 1000 ? "∞" : user!.planDetails.maxProjects} projects</p>}
            {(["free", "premium", "pro"] as PlanId[]).map((id) => {
              const p = catalog.plans[id];
              const current = user!.plan === id;
              return (
                <div key={id} className="row between card flat tight" style={{ borderColor: current ? "var(--accent)" : undefined }}>
                  <div><b>{p.name}</b> · R{p.priceZar}/month<div className="tiny">{p.monthlyGenerations} redesigns · {p.maxProjects >= 1000 ? "unlimited" : p.maxProjects} projects{p.hdRenders ? " · HD renders" : ""}{p.workspace ? " · Pro Workspace" : ""}</div></div>
                  {current ? <span className="chip accent">Current</span> : <button className="btn sm" onClick={() => changePlan(id)}>Switch</button>}
                </div>
              );
            })}
            <p className="tiny" style={{ margin: 0 }}>Demo billing: plan switches apply instantly. Connect PayFast, Paystack or Stripe for live payments.</p>
          </div>
          <form className="card stack" onSubmit={changePw}>
            <h3 style={{ margin: 0 }}>Change password</h3>
            <input type="password" placeholder="Current password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
            <input type="password" placeholder="New password (min. 8)" required minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
            <button className="btn">Update password</button>
          </form>
          <div className="card"><h3>Danger zone</h3><button className="btn danger" onClick={deleteAccount}>Delete my account</button></div>
        </div>
      </div>
    </div>
  );
}
