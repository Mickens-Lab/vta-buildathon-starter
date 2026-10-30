import { useState } from "react";
import { formatDuration, shortDid, splitTaskType, toTypeScript } from "../format.ts";
import { useCallLog } from "../hooks.ts";
import { CodeBlock, CopyButton } from "./ui.tsx";
import type { LoggedCall } from "../client.ts";

function outcome(c: LoggedCall): { text: string; ok: boolean } {
  if (c.ok) return { text: `OK${c.status ? ` (${c.status})` : ""}`, ok: true };
  const tail = (c.code ?? "").split(/[:/#]/).filter(Boolean).pop();
  return { text: `${tail || "failed"}${c.status ? ` (${c.status})` : ""}`, ok: false };
}

function Row({ c }: { c: LoggedCall }) {
  const [view, setView] = useState<"" | "req" | "ts">("");
  const t = splitTaskType(c.type);
  const o = outcome(c);
  return (
    <li className="call">
      <div className="call-line">
        <code className="task" title={c.type}>{t.name}</code>{t.version && <span className="ver">v{t.version}</span>}
        <span className={`out ${o.ok ? "ok" : "bad"}`}>{o.text}</span>
        <span className="muted">{formatDuration(c.durationMs)}</span>
      </div>
      <div className="muted small-text">signed by <code>{shortDid(c.issuer)}</code>{!c.request && " (REST call: no signed document)"}</div>
      <div className="row-actions">
        {c.request !== undefined && <button type="button" className="small" aria-expanded={view === "req"} onClick={() => setView(view === "req" ? "" : "req")}>View signed request</button>}
        <button type="button" className="small" aria-expanded={view === "ts"} onClick={() => setView(view === "ts" ? "" : "ts")}>Copy as TypeScript</button>
      </div>
      {view === "req" && <CodeBlock label="Signed request" text={JSON.stringify(c.request, null, 2)} />}
      {view === "ts" && (<><CodeBlock label="TypeScript" text={toTypeScript(c.type, c.payload)} /><CopyButton text={toTypeScript(c.type, c.payload)}>Copy</CopyButton></>)}
    </li>
  );
}

export function UnderTheHood({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const calls = useCallLog();
  return (
    <aside className={`hood ${open ? "open" : ""}`} aria-label="Under the hood">
      <button type="button" className="hood-toggle" aria-expanded={open} aria-controls="hood-body" onClick={onToggle}>
        Under the hood <span className="count">{calls.length}</span>
      </button>
      {open && (
        <div id="hood-body">
          <p className="muted small-text">The last {calls.length} Trust Task calls this page made, newest first. Each one is a signed document; nothing here is a password or key.</p>
          {calls.length === 0 ? <p className="muted">No calls yet.</p> : <ul className="calls">{calls.map((c) => <Row key={c.id} c={c} />)}</ul>}
        </div>
      )}
    </aside>
  );
}
