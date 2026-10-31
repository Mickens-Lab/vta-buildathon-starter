// "Was my membership credential delivered?" shown on the membership card, and which mode and applicant it depends on. Pure, so it is unit-tested.
//
// What is true (docs/MESSAGING.md): `credentialsDelivered` in the join status is NOT "the frame arrived". The VTC (0.15.0) sets it
// only once it holds the member's OWN membership credential sent back to it (vtc/members/vmc/0.1, the reciprocal half). This page
// never sends that, so it stays false even when the credential reached a listener. Whether frames arrived is shown by
// `npm run tsp:listen`, not by this flag.
//
// Applicant: by default the app's did:key (no service in its DID, so the VTC pushes over TSP only after recent TSP contact from it).
// With VTC_APPLICANT=did:peer in MODE=tunnel, a did:peer:2 from the same seed whose TSPTransport service names the stack's mediator:
// the VTC pushes to it over TSP without earlier contact (read in the VTC code; NOT verified live, see docs/MESSAGING.md).
export type RunMode = "local" | "tunnel" | "farm";
export type ApplicantKind = "did:key" | "did:peer";

export interface DeliveryNote { pill: "ok" | "warn" | "info"; label: string; detail: string }

declare const __FARM__: boolean;
declare const __TUNNEL__: boolean;
declare const __APPLICANT__: ApplicantKind;
declare const __MEDIATOR_DID__: string | null;
/** The mode this page was built for (the dev server reads MODE from the repo-root .env). */
export function runMode(): RunMode {
  return typeof __FARM__ !== "undefined" && __FARM__ ? "farm" : typeof __TUNNEL__ !== "undefined" && __TUNNEL__ ? "tunnel" : "local";
}

/** The applicant this page signs as: did:peer only when asked for (VTC_APPLICANT) AND in tunnel mode with a known mediator DID. */
export function applicantChoice(mode: RunMode, asked: ApplicantKind | undefined, mediatorDid: string | null | undefined, fits: (mediatorDid: string) => boolean = () => true): { kind: ApplicantKind; why?: string } {
  if (asked !== "did:peer") return { kind: "did:key" };
  if (mode !== "tunnel") return { kind: "did:key", why: `VTC_APPLICANT=did:peer needs MODE=tunnel (the mediator); this page is MODE=${mode}, so it applies as the did:key.` };
  if (!mediatorDid) return { kind: "did:key", why: "VTC_APPLICANT=did:peer, but .vta/tunnel.json has no mediator DID (is the tunnel stack up?), so this page applies as the did:key." };
  if (!fits(mediatorDid)) return { kind: "did:key", why: "VTC_APPLICANT=did:peer, but a did:peer:2 naming this mediator would exceed the 1000-byte DID limit of the mediator's and the VTC's resolver (the mediator's own DID is a long did:peer:2), so this page applies as the did:key (docs/MESSAGING.md)." };
  return { kind: "did:peer" };
}

export function builtApplicant(fits?: (mediatorDid: string) => boolean): { kind: ApplicantKind; mediatorDid: string | null; why?: string } {
  const asked = typeof __APPLICANT__ !== "undefined" ? __APPLICANT__ : undefined;
  const mediatorDid = typeof __MEDIATOR_DID__ !== "undefined" ? __MEDIATOR_DID__ : null;
  return { ...applicantChoice(runMode(), asked, mediatorDid, fits), mediatorDid };
}

const FLAG = "credentialsDelivered turns true only when the community holds your own membership credential sent back to it (vtc/members/vmc/0.1), which this page does not send. It does not report whether the pushed frames arrived.";

export function deliveryNote(mode: RunMode, delivered: boolean | undefined, applicant: ApplicantKind = "did:key"): DeliveryNote {
  if (delivered === true) return { pill: "ok", label: "reciprocal credential held", detail: "The community reports it holds your own membership credential sent back to it (that is what credentialsDelivered means; it is not a frame receipt)." };
  const unknown = delivered === undefined;
  if (mode === "local") {
    return { pill: "info", label: "not applicable here", detail: `Delivery is a message pushed to a wallet. The local stack has messaging off, so nothing is sent. MODE=tunnel turns messaging on (docs/MESSAGING.md). ${FLAG}` };
  }
  if (mode === "tunnel" && applicant === "did:peer") {
    return { pill: "info", label: unknown ? "not reported" : "pushed over TSP; flag stays false", detail: `This page applies as a did:peer:2 whose TSPTransport service names the stack's mediator, so the VTC can push the credential over TSP with no earlier contact. Run \`npm run tsp:listen -- --did-peer\` to see the frames arrive. ${FLAG}` };
  }
  if (mode === "tunnel") {
    return { pill: "warn", label: unknown ? "not reported" : "not delivered (expected)", detail: `This page's identity is a plain did:key: its DID names no mediator, so the VTC pushes over TSP only after this DID spoke TSP to it (\`npm run tsp:listen\` first). VTC_APPLICANT=did:peer applies as a DID that names the mediator instead (docs/MESSAGING.md). ${FLAG}` };
  }
  return { pill: "info", label: unknown ? "not reported" : "not delivered", detail: `Whether a hosted community delivers to this identity is unverified (docs/MODES.md). ${FLAG}` };
}
