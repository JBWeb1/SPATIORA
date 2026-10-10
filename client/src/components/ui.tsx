import { useEffect, useRef, useState, type ReactNode } from "react";

/** The VISTORA brand mark (the uploaded logo artwork). */
export function Logo({ size = 28, full = false }: { size?: number; full?: boolean }) {
  return (
    <img
      src={full ? "/brand/vistora-mark.webp" : "/brand/vistora-logo-256.webp"}
      width={size}
      height={size}
      alt="VISTORA"
      style={{ width: size, height: size, borderRadius: Math.max(6, size * 0.22), display: "block", flex: "none" }}
    />
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function BeforeAfter({ before, after, beforeLabel = "Before", afterLabel = "After" }: { before: string; after: string; beforeLabel?: string; afterLabel?: string }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const move = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div
      ref={ref}
      className="ba"
      style={{ ["--pos" as string]: `${pos}%` }}
      onPointerDown={(e) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); move(e.clientX); }}
      onPointerMove={(e) => dragging.current && move(e.clientX)}
      onPointerUp={() => { dragging.current = false; }}
      role="slider"
      aria-label="Before and after comparison"
      aria-valuenow={Math.round(pos)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 5));
        if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 5));
      }}
    >
      <img src={before} alt={beforeLabel} draggable={false} />
      <img className="after" src={after} alt={afterLabel} draggable={false} />
      <div className="handle" />
      <span className="label" style={{ left: 10 }}>{beforeLabel}</span>
      <span className="label" style={{ right: 10 }}>{afterLabel}</span>
    </div>
  );
}

/** Minimal, safe Markdown renderer (headings, bold, italics, lists, paragraphs). */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let list: string[] = [];
  let para: string[] = [];
  const inline = (s: string, k: string | number) => {
    const parts = s.split(/(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
    return <span key={k}>{parts.map((p, i) =>
      p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong>
        : (p.startsWith("_") && p.endsWith("_")) || (p.startsWith("*") && p.endsWith("*")) ? <em key={i}>{p.slice(1, -1)}</em>
          : p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : p)}</span>;
  };
  const flush = () => {
    if (list.length) { blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l, i)}</li>)}</ul>); list = []; }
    if (para.length) { blocks.push(<p key={blocks.length}>{inline(para.join(" "), 0)}</p>); para = []; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const li = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (h) { flush(); const L = h[1].length; blocks.push(L === 1 ? <h2 key={blocks.length}>{h[2]}</h2> : <h3 key={blocks.length}>{h[2]}</h3>); }
    else if (li) { if (para.length) flush(); list.push(li[1]); }
    else if (!line.trim()) flush();
    else { if (list.length) flush(); para.push(line); }
  }
  flush();
  return <div className="md">{blocks}</div>;
}

export function Spinner({ label = "Working…" }: { label?: string }) {
  return <span className="muted small">⏳ {label}</span>;
}

export function Stars({ value }: { value: number }) {
  return <span aria-label={`${value} out of 5`} style={{ color: "var(--accent)" }}>{"★".repeat(Math.round(value))}<span style={{ opacity: .3 }}>{"★".repeat(5 - Math.round(value))}</span> <span className="tiny">{value.toFixed(1)}</span></span>;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

/** SQLite timestamps are UTC without a zone ("2026-10-10 08:15:00"). */
export const parseDate = (s: string) => new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
export const fmtDate = (s: string, withTime = false) =>
  withTime ? parseDate(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : parseDate(s).toLocaleDateString(undefined, { dateStyle: "medium" });
