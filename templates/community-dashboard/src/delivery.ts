// "Was my membership credential delivered?" shown on the membership card, and which mode that depends on. Pure, so it is unit-tested.
//
// What is true (docs/MODES.md, docs/MESSAGING.md): the VTC pushes the membership credential over DIDComm/TSP to the applicant's own
// messaging endpoint. This dashboard's applicant is a plain did:key with no mediator or listener, so the VTC reports
// `credentialsDelivered: false` in EVERY mode, tunnel included [verified, MODE=tunnel]. The only copy a CLI-driven flow gets is in the
// admin's `decide` response. The row says that instead of showing a bare false.
export type RunMode = "local" | "tunnel" | "farm";

export interface DeliveryNote { pill: "ok" | "warn" | "info"; label: string; detail: string }

declare const __FARM__: boolean;
declare const __TUNNEL__: boolean;
/** The mode this page was built for (the dev server reads MODE from the repo-root .env). */
export function runMode(): RunMode {
  return typeof __FARM__ !== "undefined" && __FARM__ ? "farm" : typeof __TUNNEL__ !== "undefined" && __TUNNEL__ ? "tunnel" : "local";
}

export function deliveryNote(mode: RunMode, delivered: boolean | undefined): DeliveryNote {
  if (delivered === true) return { pill: "ok", label: "delivered", detail: "The community reports it delivered the credential to your messaging endpoint." };
  const unknown = delivered === undefined;
  if (mode === "local") {
    return { pill: "info", label: "not applicable here", detail: "Delivery is a message pushed to a wallet. The local stack has messaging off, so nothing is sent. MODE=tunnel turns messaging on; this page's identity still has no inbox (docs/MESSAGING.md)." };
  }
  if (mode === "tunnel") {
    return { pill: "warn", label: unknown ? "not reported" : "not delivered (expected)", detail: "Messaging is on, but this page's identity is a plain did:key with no mediator or inbox, so there is nowhere to deliver to. A wallet with a mediator-backed DID could receive it; this kit has no client for that (docs/MESSAGING.md)." };
  }
  return { pill: "info", label: unknown ? "not reported" : "not delivered", detail: "Whether a hosted community delivers to this identity is unverified (docs/MODES.md)." };
}
