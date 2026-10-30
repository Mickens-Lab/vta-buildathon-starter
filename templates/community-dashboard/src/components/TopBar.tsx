import { shortDid } from "../format.ts";
import type { DashState } from "../state.ts";
import { isInferred } from "../state.ts";
import { useCooling } from "../hooks.ts";
import { Tag } from "./ui.tsx";

export function badgeFor(s: DashState | undefined): { text: string; tone: "ok" | "warn" | "bad" | "info" } {
  if (!s) return { text: "Checking", tone: "info" };
  switch (s.kind) {
    case "visitor": return { text: "Visitor", tone: "info" };
    case "pending": return { text: s.deferred ? "In review (deferred)" : "In review", tone: "warn" };
    case "needs-info": return { text: "More information needed", tone: "warn" };
    case "member": return { text: "Member", tone: "ok" };
    case "withdrawn": return { text: "Withdrawn", tone: "info" };
    case "rejected": return { text: "Not accepted", tone: "bad" };
    case "left": return { text: "Left", tone: "info" };
    case "other": return { text: `Status: ${s.status}`, tone: "warn" };
    case "error": return { text: "Problem", tone: "bad" };
  }
}

export function TopBar(p: { community: string; did: string | undefined; dash: DashState | undefined; onOpenStatus: () => void; statusOpen: boolean; onRefreshAll: () => void }) {
  const b = badgeFor(p.dash);
  const dot = !p.dash ? "unknown" : p.dash.kind === "error" ? "bad" : "ok";
  const cooling = useCooling();
  const dotText = dot === "ok" ? "connected" : dot === "bad" ? "not connected" : "checking";
  return (
    <header className="topbar">
      <h1 className="community">{p.community}</h1>
      <span className="chip" title="The app identity this page signs with (a did:key made for you). It is not shown in full here.">
        <span className="muted">You are</span> <code>{p.did ? shortDid(p.did) : "no credential"}</code>
      </span>
      <span className={`badge ${b.tone}`} role="status">{b.text}</span>
      {p.dash && isInferred(p.dash) && <Tag kind="inferred" />}
      <button type="button" className="small" disabled={cooling} onClick={p.onRefreshAll} title="Read everything on this page again from the community">Refresh all</button>
      <button type="button" className="dotbtn" aria-haspopup="dialog" aria-expanded={p.statusOpen} aria-label={`Connection ${dotText}. Open connection details`} onClick={p.onOpenStatus}>
        <span className={`dot ${dot}`} aria-hidden="true" /> <span className="dottext">{dotText}</span>
      </button>
    </header>
  );
}
