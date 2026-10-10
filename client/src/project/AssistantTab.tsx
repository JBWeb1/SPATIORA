import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api";
import { Markdown } from "../components/ui";
import { useCatalog, useToast } from "../state";
import type { TabProps } from "./context";

interface Msg { id?: string; role: "user" | "assistant"; content: string }

const PROMPTS = [
  "Suggest a colour palette for this room",
  "How should I lay out the furniture?",
  "Plan layered lighting that works during load-shedding",
  "Where can I save money without it looking cheap?",
  "Which flooring suits a busy family with pets?",
  "What should I ask contractors before hiring?",
];

export default function AssistantTab({ bundle }: TabProps) {
  const catalog = useCatalog();
  const toast = useToast();
  const pid = bundle.project.id;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api.get<{ messages: Msg[] }>(`/projects/${pid}/assistant`).then((r) => setMessages(r.messages)).catch(toast.error); }, [pid, toast]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, busy]);

  const send = async (message: string) => {
    if (!message.trim() || busy) return;
    setMessages((m) => [...m, { role: "user", content: message }]);
    setText("");
    setBusy(true);
    try {
      const r = await api.post<{ reply: string }>(`/projects/${pid}/assistant`, { message });
      setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
    } catch (err) {
      toast.error(err);
      setMessages((m) => m.slice(0, -1));
      setText(message);
    } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); send(text); };
  const clear = async () => { if (confirm("Clear this conversation?")) { await api.del(`/projects/${pid}/assistant`); setMessages([]); } };

  return (
    <div className="split">
      <div className="stack">
        <div className="card">
          <h3>AI Design Assistant</h3>
          <p className="small muted">Knows this project's room size, budget, style and finishes{bundle.project.sourceImage ? ", and can see your room photo" : ""}.</p>
          <span className="chip accent">{catalog.capabilities.assistant === "claude" ? "Powered by Claude" : "Built-in design advisor"}</span>
        </div>
        <div className="card stack" style={{ gap: 6 }}>
          <h3 style={{ margin: 0 }}>Try asking</h3>
          {PROMPTS.map((p) => <button key={p} className="btn sm" style={{ justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left" }} onClick={() => send(p)} disabled={busy}>{p}</button>)}
        </div>
      </div>
      <div className="card stack">
        <div className="chat" aria-live="polite">
          {messages.length === 0 && <div className="empty">Ask anything about your {bundle.project.roomType.toLowerCase()} — style, layout, colours, materials, budget or backup power.</div>}
          {messages.map((m, i) => <div key={m.id ?? i} className={`bubble ${m.role}`}>{m.role === "assistant" ? <Markdown text={m.content} /> : m.content}</div>)}
          {busy && <div className="bubble assistant muted">Thinking…</div>}
          <div ref={endRef} />
        </div>
        <form className="row" onSubmit={submit}>
          <input className="grow" placeholder="Ask the design assistant…" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
          <button className="btn primary" disabled={busy || !text.trim()}>Send</button>
          {messages.length > 0 && <button type="button" className="btn ghost sm" onClick={clear}>Clear</button>}
        </form>
      </div>
    </div>
  );
}
