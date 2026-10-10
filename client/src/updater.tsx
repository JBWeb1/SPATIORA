import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { CHANGELOG, compareVersions, type Release } from "./changelog";
import { Modal } from "./components/ui";

export interface DataFeedStatus { enabled: boolean; source: string | null; updatedAt: string | null; lastAttemptAt: string | null; ok: boolean; message: string }
export interface VersionInfo {
  version: string;
  build: string;
  builtAt: string | null;
  serverStartedAt: string;
  data: { fx: DataFeedStatus; catalog: DataFeedStatus & { products: number } };
}

interface UpdaterState {
  currentVersion: string;
  currentBuild: string;
  latest: VersionInfo | null;
  updateReady: boolean;
  checking: boolean;
  lastChecked: Date | null;
  autoUpdate: boolean;
  setAutoUpdate: (v: boolean) => void;
  checkNow: () => Promise<void>;
  applyUpdate: () => void;
  showWhatsNew: () => void;
}

const UpdaterCtx = createContext<UpdaterState | null>(null);
const POLL_MS = 5 * 60_000;
const ENABLED = import.meta.env.PROD;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [latest, setLatest] = useState<VersionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [autoUpdate, setAutoUpdateState] = useState(() => store.get("vistora.autoUpdate") !== "off");
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [whatsNew, setWhatsNew] = useState<Release[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const applying = useRef(false);

  const updateReady = ENABLED && ((latest !== null && latest.build !== "dev" && latest.build !== __APP_BUILD__) || waitingWorker !== null);

  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (res.ok) setLatest(await res.json());
      await registration.current?.update().catch(() => {});
    } catch { /* offline — try again later */ }
    finally { setChecking(false); setLastChecked(new Date()); }
  }, []);

  const applyUpdate = useCallback(() => {
    if (applying.current) return;
    applying.current = true;
    const reload = () => window.location.reload();
    if (waitingWorker && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
      waitingWorker.postMessage("SKIP_WAITING");
      setTimeout(reload, 3000); // fallback if the worker is slow to take over
    } else reload();
  }, [waitingWorker]);

  // Register the service worker and watch for new versions of it.
  useEffect(() => {
    if (!ENABLED || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      registration.current = reg;
      if (reg.waiting && navigator.serviceWorker.controller) setWaitingWorker(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(sw);
        });
      });
    }).catch(() => {});
  }, []);

  // Poll for new releases, and check whenever the tab regains focus.
  useEffect(() => {
    if (!ENABLED) return;
    checkNow();
    const t = setInterval(() => document.visibilityState === "visible" && checkNow(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && checkNow();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", checkNow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", checkNow); };
  }, [checkNow]);

  // After an update, show what changed since the version the user last saw.
  useEffect(() => {
    const seen = store.get("vistora.lastSeenVersion");
    if (seen && compareVersions(__APP_VERSION__, seen) > 0) {
      const fresh = CHANGELOG.filter((r) => compareVersions(r.version, seen) > 0 && compareVersions(r.version, __APP_VERSION__) <= 0);
      if (fresh.length) setWhatsNew(fresh);
    }
    store.set("vistora.lastSeenVersion", __APP_VERSION__);
  }, []);

  const setAutoUpdate = (v: boolean) => { setAutoUpdateState(v); store.set("vistora.autoUpdate", v ? "on" : "off"); };

  const value = useMemo<UpdaterState>(() => ({
    currentVersion: __APP_VERSION__, currentBuild: __APP_BUILD__, latest, updateReady, checking, lastChecked, autoUpdate,
    setAutoUpdate, checkNow, applyUpdate, showWhatsNew: () => setWhatsNew(CHANGELOG),
  }), [latest, updateReady, checking, lastChecked, autoUpdate, checkNow, applyUpdate]);

  return (
    <UpdaterCtx.Provider value={value}>
      {children}
      <AutoApply active={autoUpdate && updateReady} onApply={applyUpdate} />
      {updateReady && !dismissed && (
        <div className="update-banner no-print" role="status">
          <span>✦ A new version of VISTORA{latest && latest.version !== __APP_VERSION__ ? ` (${latest.version})` : ""} is ready.</span>
          <button className="btn sm accent" onClick={applyUpdate}>Update now</button>
          <button className="btn sm ghost" onClick={() => setDismissed(true)}>Later</button>
        </div>
      )}
      {whatsNew && (
        <Modal title="What's new in VISTORA" onClose={() => setWhatsNew(null)}>
          {whatsNew.map((r) => (
            <div key={r.version} style={{ marginBottom: 14 }}>
              <h3 style={{ marginBottom: 4 }}>Version {r.version} <span className="tiny">· {r.date}</span></h3>
              <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>{r.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
            </div>
          ))}
          <button className="btn primary" onClick={() => setWhatsNew(null)}>Got it</button>
        </Modal>
      )}
    </UpdaterCtx.Provider>
  );

}

// With auto-update on, a pending update is applied on the next page navigation,
// so nobody loses what they are typing mid-page.
function AutoApply({ active, onApply }: { active: boolean; onApply: () => void }) {
  const loc = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (active) onApply();
  }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export const useUpdater = () => {
  const ctx = useContext(UpdaterCtx);
  if (!ctx) throw new Error("useUpdater outside UpdateProvider");
  return ctx;
};
