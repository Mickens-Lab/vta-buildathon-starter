// Which identity applies to the community: the app's did:key (default, every mode), or a did:peer:2 derived from the same
// seed whose TSPTransport service names the stack's mediator (opt-in, MODE=tunnel only). The VTC pushes the credential
// to the did:peer over TSP with no earlier contact; a did:key is reached only after it has spoken TSP to the VTC.
// Choose with VTC_APPLICANT=did:peer in .env or --did-peer on vtc:join / tsp:listen (both must agree). docs/MESSAGING.md.
import { identityFromSeed, type Identity } from "@buildathon/vta-client";
import { didPeerFromSeed, type PeerIdentity } from "@buildathon/tsp-client";

export type ApplicantKind = "did:key" | "did:peer";

/** `--did-peer` wins, then VTC_APPLICANT; anything else is did:key. */
export function applicantKind(argv: string[], envValue: string | undefined): ApplicantKind {
  if (argv.includes("--did-peer")) return "did:peer";
  const v = (envValue ?? "").trim().toLowerCase();
  if (v === "did:peer" || v === "peer") return "did:peer";
  if (v && v !== "did:key" && v !== "key") throw new Error(`VTC_APPLICANT must be did:key or did:peer, got ${JSON.stringify(envValue)}`);
  return "did:key";
}

export interface Applicant {
  kind: ApplicantKind;
  identity: Identity | PeerIdentity;
  /** The .env key that remembers this applicant's request id (different DIDs own different requests). */
  requestIdKey: "VTC_REQUEST_ID" | "VTC_PEER_REQUEST_ID";
  /** One line on how the credential can reach this applicant. */
  note: string;
}

/** The applicant for `seed`. A did:peer needs the stack's mediator DID (MODE=tunnel); without it this throws a mode-aware message. */
export function applicant(kind: ApplicantKind, seed: Uint8Array, opts: { mode: string; mediatorDid?: string }): Applicant {
  if (kind === "did:key") {
    const note = opts.mode === "tunnel"
      ? "applicant is a did:key (no service): the VTC pushes the credential over TSP only if this DID spoke TSP to it recently (run tsp:listen first), otherwise over DIDComm. VTC_APPLICANT=did:peer removes that need."
      : `applicant is a did:key; MODE=${opts.mode} has no messaging stack here, so the credential is not pushed (the admin's decide response carries it).`;
    return { kind, identity: identityFromSeed(seed), requestIdKey: "VTC_REQUEST_ID", note };
  }
  if (opts.mode !== "tunnel" || !opts.mediatorDid) {
    throw new Error(`a did:peer applicant names the stack's mediator in its DID, so it needs MODE=tunnel with the mediator up (npm run up -- --tunnel). MODE=${opts.mode}${opts.mediatorDid ? "" : ", no mediator DID in .vta/tunnel.json"}. Unset VTC_APPLICANT (or drop --did-peer) to apply as the did:key.`);
  }
  return {
    kind,
    identity: didPeerFromSeed(seed, opts.mediatorDid),
    requestIdKey: "VTC_PEER_REQUEST_ID",
    note: "applicant is a did:peer:2 whose TSPTransport service names the stack's mediator: the VTC can push the credential over TSP with no earlier contact. Run `npm run tsp:listen -- --did-peer` to receive it.",
  };
}
