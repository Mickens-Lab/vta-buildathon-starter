// Frames a listener received from its peer (the VTC), sorted by kind and counted. Pure, so it is unit-tested; shared by
// `npm run tsp:listen` (scripts/lib/listen.ts) and the community dashboard's "Credential frames" panel. It reads only the
// frame's control type or the Trust Task document's `type`: nothing here parses or verifies a credential.
export const ISSUE_TYPE = "https://trusttasks.org/spec/credential-exchange/issue/0.1";

export interface Tally { invites: number; accepts: number; issues: number; other: string[]; unreadable: number }
export const emptyTally = (): Tally => ({ invites: 0, accepts: 0, issues: 0, other: [], unreadable: 0 });

/** A relationship control frame, a document frame (its Trust Task type), or one that did not open as a frame from the peer. */
export type Frame = { control: string } | { documentType: string | undefined } | { unreadable: string };

export function record(t: Tally, f: Frame): Tally {
  if ("control" in f) return f.control === "invite" ? { ...t, invites: t.invites + 1 } : f.control === "accept" ? { ...t, accepts: t.accepts + 1 } : { ...t, other: [...t.other, `control ${f.control}`] };
  if ("unreadable" in f) return { ...t, unreadable: t.unreadable + 1 };
  return f.documentType === ISSUE_TYPE ? { ...t, issues: t.issues + 1 } : { ...t, other: [...t.other, f.documentType ?? "(no document type)"] };
}

/** The Frame for a message `session.open()` returned: its control type, else the `document.type` of its JSON payload. */
export function frameOf(m: { control?: { controlType: string } | null; payload?: Uint8Array }): Frame {
  if (m.control) return { control: m.control.controlType };
  try {
    const doc = (JSON.parse(new TextDecoder().decode(m.payload ?? new Uint8Array())) as { document?: { type?: unknown } }).document;
    return { documentType: typeof doc?.type === "string" ? doc.type : undefined };
  } catch (e) {
    return { unreadable: `payload is not JSON: ${(e as Error).message}` };
  }
}
