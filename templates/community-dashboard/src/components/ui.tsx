import { useEffect, useRef, useState, type ReactNode } from "react";
import { createStore } from "../store.ts";
import { useCooling, useStore } from "../hooks.ts";
import { describeFreshness, tryRefresh, KNOWN_COOLDOWN_MS, type Freshness } from "../refresh.ts";

// --- toasts ------------------------------------------------------------------------
export interface Toast { id: number; kind: "ok" | "bad"; text: string }
export const toasts = createStore<Toast[]>([]);
let tid = 0;
export function toast(kind: Toast["kind"], text: string) {
  const id = ++tid;
  toasts.set((p) => [...p, { id, kind, text }].slice(-4));
  setTimeout(() => toasts.set((p) => p.filter((t) => t.id !== id)), kind === "bad" ? 12000 : 5000);
}

export function Toasts() {
  const list = useStore(toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.kind === "ok" ? "Done. " : "Did not work. "}{t.text}</span>
          <button type="button" className="ghost" aria-label="Dismiss" onClick={() => toasts.set((p) => p.filter((x) => x.id !== t.id))}>x</button>
        </div>
      ))}
    </div>
  );
}

// --- small pieces ------------------------------------------------------------------
export function Tag({ kind, children }: { kind: "verified" | "unverified" | "inferred"; children?: ReactNode }) {
  const title = kind === "verified" ? "Seen working against a local community" : kind === "inferred" ? "Worked out from the spec, not seen live" : "Not tried against a live community";
  return <span className={`tag ${kind}`} title={title}>{children ?? kind}</span>;
}

const label = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

function Val({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="muted">none</span>;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return <>{String(v)}</>;
  return <pre className="code inline">{JSON.stringify(v, null, 2)}</pre>;
}

/** Any object as a definition list: the VTC's own field names, lightly humanised. */
export function KV({ data, skip = [] }: { data: unknown; skip?: string[] }) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return <Val v={data} />;
  const rows = Object.entries(data as Record<string, unknown>).filter(([k, v]) => !skip.includes(k) && v !== undefined);
  if (!rows.length) return <p className="muted">Nothing to show.</p>;
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (<div key={k}><dt>{label(k)}</dt><dd><Val v={v} /></dd></div>))}
    </dl>
  );
}

export function CodeBlock({ text, label: aria }: { text: string; label: string }) {
  return <pre className="code" tabIndex={0} aria-label={aria}>{text}</pre>;
}

export function CopyButton({ text, children }: { text: string; children: ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="small" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { toast("bad", "Your browser blocked copying. Select the text and copy it by hand."); }
    }}>{done ? "Copied" : children}</button>
  );
}

/** Confirm-before-act: first click arms it, second confirms. */
export function Confirm({ label: text, confirmText, onConfirm, danger, busy }: { label: string; confirmText: string; onConfirm: () => void; danger?: boolean; busy?: boolean }) {
  const [armed, setArmed] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (armed) first.current?.focus(); }, [armed]);
  if (!armed) return <button type="button" className={danger ? "danger" : ""} onClick={() => setArmed(true)} disabled={busy}>{text}</button>;
  return (
    <div className="confirm" role="group" aria-label={`Confirm: ${text}`}>
      <p>{confirmText}</p>
      <button ref={first} type="button" className={danger ? "danger" : "primary"} disabled={busy} onClick={() => { setArmed(false); onConfirm(); }}>Yes, {text.toLowerCase()}</button>
      <button type="button" onClick={() => setArmed(false)}>Cancel</button>
    </div>
  );
}

export function Loading({ what }: { what: string }) { return <p className="muted" role="status">Loading {what}...</p>; }

export function ErrorNote({ text, retry }: { text: string; retry?: () => void }) {
  return <div className="note bad" role="alert"><p>{text}</p>{retry && <button type="button" className="small" onClick={retry}>Try again</button>}</div>;
}

/**
 * "As of 14:03:22, from community/profile/show, 85 ms" plus a Refresh button. The line comes from the Under-the-hood call
 * log, so what the panel claims is what the community actually answered. The button shares one cooldown with every other
 * Refresh (the community rate-limits signers).
 */
export function Fresh({ info, onRefresh, busy, cooldownMs = KNOWN_COOLDOWN_MS, label = "Refresh" }: { info: Freshness | undefined; onRefresh: () => void; busy?: boolean; cooldownMs?: number; label?: string }) {
  const cooling = useCooling();
  return (
    <div className="fresh row-actions">
      <span className="muted small-text" role="status">{busy ? "Reading from the community..." : describeFreshness(info)}</span>
      <button type="button" className="small" disabled={busy || cooling} title={cooling ? "Just refreshed. Wait a moment: the community rate-limits each signer." : "Read this again from the community"}
        onClick={() => { if (tryRefresh(cooldownMs)) onRefresh(); }}>{label}</button>
    </div>
  );
}
