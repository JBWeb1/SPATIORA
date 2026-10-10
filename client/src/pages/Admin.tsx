import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, errorMessage } from "../api";
import { fmtDate } from "../components/ui";
import { useAuth, useMoney } from "../state";

interface Stats {
  totals: { users: number; projects: number; designs: number; comments: number; quotes: number; requests: number };
  mrr: number; arr: number; generationsThisMonth: number;
  plans: { plan: string; n: number }[];
  signups: { day: string; n: number }[];
  styles: { style: string; n: number }[];
  rooms: { room: string; n: number }[];
  accountTypes: { type: string; n: number }[];
  recentUsers: { name: string; email: string; plan: string; accountType: string; createdAt: string }[];
  marketplace: { basketValue: number; purchasedValue: number; commissionRate: number; estimatedCommission: number };
}

/** Horizontal bar list — one series, one hue; each row carries its own text label. */
function BarList({ title, rows }: { title: string; rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="card">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="muted small">No data yet.</p> : rows.slice(0, 8).map((r) => (
        <div key={r.label} className="hbar" title={`${r.label}: ${r.n}`}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
          <div className="track"><div className="fill" style={{ width: `${(r.n / max) * 100}%` }} /></div>
          <span className="mono right">{r.n}</span>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const money = useMoney("ZAR");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [showTable, setShowTable] = useState(false);

  useEffect(() => { if (user?.isAdmin) api.get<Stats>("/admin/stats").then(setStats).catch((e) => setError(errorMessage(e))); }, [user]);
  if (!user?.isAdmin) return <Navigate to="/app" replace />;
  if (error) return <div className="container section"><div className="empty">{error}</div></div>;
  if (!stats) return <div className="container section muted">Loading business dashboard…</div>;

  // Fill the last 30 days so gaps show as zero rather than disappearing.
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400_000).toISOString().slice(0, 10);
    return { day: d, n: stats.signups.find((s) => s.day === d)?.n ?? 0 };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.n));
  const paying = stats.plans.filter((p) => p.plan !== "free").reduce((s, p) => s + p.n, 0);

  return (
    <div className="container" style={{ paddingBottom: 48 }}>
      <div className="page-head"><div><h1>Business dashboard</h1><p className="muted">How VISTORA is growing and earning.</p></div></div>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card stat"><span className="tiny">Monthly recurring revenue</span><b>{money.format(stats.mrr)}</b><span className="tiny">{money.format(stats.arr)} annualised</span></div>
        <div className="card stat"><span className="tiny">Users</span><b>{stats.totals.users}</b><span className="tiny">{paying} paying · {stats.totals.users ? Math.round((paying / stats.totals.users) * 100) : 0}% conversion</span></div>
        <div className="card stat"><span className="tiny">AI redesigns this month</span><b>{stats.generationsThisMonth}</b><span className="tiny">{stats.totals.designs} all-time</span></div>
        <div className="card stat"><span className="tiny">Marketplace commission (est.)</span><b>{money.format(stats.marketplace.estimatedCommission)}</b><span className="tiny">{Math.round(stats.marketplace.commissionRate * 100)}% of {money.format(stats.marketplace.purchasedValue)} purchased · {money.format(stats.marketplace.basketValue)} in baskets</span></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between"><h3 style={{ margin: 0 }}>New sign-ups, last 30 days</h3><button className="btn ghost sm" onClick={() => setShowTable((s) => !s)}>{showTable ? "Show chart" : "Show table"}</button></div>
        {showTable ? (
          <div className="table-wrap" style={{ maxHeight: 260, overflowY: "auto" }}><table className="table"><thead><tr><th>Day</th><th className="num">Sign-ups</th></tr></thead><tbody>{days.map((d) => <tr key={d.day}><td>{d.day}</td><td className="num">{d.n}</td></tr>)}</tbody></table></div>
        ) : (
          <>
            <div className="vbars" style={{ marginTop: 14 }} role="img" aria-label={`Sign-ups per day over the last 30 days, peak ${maxDay}`}>
              {days.map((d) => (
                <div key={d.day} className="col" tabIndex={0}>
                  <span style={{ height: `${(d.n / maxDay) * 100}%` }} />
                  <div className="tip">{d.day}: {d.n}</div>
                </div>
              ))}
            </div>
            <div className="row between tiny" style={{ marginTop: 4 }}><span>{days[0].day}</span><span>peak {maxDay}/day</span><span>{days[29].day}</span></div>
          </>
        )}
      </div>

      <div className="grid cols-2">
        <BarList title="Users by plan" rows={stats.plans.map((p) => ({ label: p.plan, n: p.n }))} />
        <BarList title="Users by type" rows={stats.accountTypes.map((p) => ({ label: p.type, n: p.n }))} />
        <BarList title="Most-generated styles" rows={stats.styles.map((s) => ({ label: s.style, n: s.n }))} />
        <BarList title="Projects by room" rows={stats.rooms.map((r) => ({ label: r.room, n: r.n }))} />
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Engagement</h3>
          <table className="table"><tbody>
            <tr><td>Projects</td><td className="num">{stats.totals.projects}</td></tr>
            <tr><td>Collaborator comments</td><td className="num">{stats.totals.comments}</td></tr>
            <tr><td>Quotations created</td><td className="num">{stats.totals.quotes}</td></tr>
            <tr><td>Contractor quote requests (lead-gen)</td><td className="num">{stats.totals.requests}</td></tr>
          </tbody></table>
        </div>
        <div className="card">
          <h3>Newest users</h3>
          <table className="table"><tbody>{stats.recentUsers.map((u) => <tr key={u.email}><td>{u.name}<div className="tiny">{u.email}</div></td><td className="small">{u.plan} · {u.accountType}</td><td className="tiny">{fmtDate(u.createdAt)}</td></tr>)}</tbody></table>
        </div>
      </div>
    </div>
  );
}
