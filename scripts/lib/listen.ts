// What tsp:listen saw, as counts and one closing line. Pure, so it is unit-tested.
export const ISSUE_TYPE = "https://trusttasks.org/spec/credential-exchange/issue/0.1";

export interface Tally { invites: number; accepts: number; issues: number; other: string[]; unreadable: number }
export const emptyTally = (): Tally => ({ invites: 0, accepts: 0, issues: 0, other: [], unreadable: 0 });

export type Frame = { control: string } | { documentType: string | undefined } | { unreadable: string };

export function record(t: Tally, f: Frame): Tally {
  if ("control" in f) return f.control === "invite" ? { ...t, invites: t.invites + 1 } : f.control === "accept" ? { ...t, accepts: t.accepts + 1 } : { ...t, other: [...t.other, `control ${f.control}`] };
  if ("unreadable" in f) return { ...t, unreadable: t.unreadable + 1 };
  return f.documentType === ISSUE_TYPE ? { ...t, issues: t.issues + 1 } : { ...t, other: [...t.other, f.documentType ?? "(no document type)"] };
}

/** The closing line: did the credential arrive, and what that does (and does not) say about the join status. */
export function verdict(t: Tally, opts: { method: "did:key" | "did:peer"; related: boolean }): string {
  if (t.issues > 0) {
    return `RECEIVED ${t.issues} credential-exchange/issue frame(s) as the ${opts.method}${opts.related ? "" : " with no TSP contact first"}. The join status still says credentialsDelivered: false until the member sends its own credential back (vtc/members/vmc/0.1); that flag is not a frame receipt.`;
  }
  const why = opts.method === "did:peer"
    ? "Check the VTC log for \"trust-task push\" (via=tsp, or \"no matching protocol\"), that the request was approved while this ran, and that the DID's mediator is the VTC's mediator (same DID string)."
    : "A did:key names no mediator: the VTC pushes over TSP only after this DID spoke TSP to it (this run did that only if \"relationship accepted\" was printed). Try VTC_APPLICANT=did:peer.";
  return `NO credential frame arrived. ${why}`;
}
