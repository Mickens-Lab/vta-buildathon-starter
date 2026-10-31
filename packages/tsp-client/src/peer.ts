// A did:peer:2 identity that says where it can be reached: one Ed25519 seed gives the signing key (V), its X25519
// Montgomery form gives the encryption key (E), and a `TSPTransport` service names the mediator that holds its
// messages. A VTC (0.15.0) that resolves such a DID pushes to it over TSP with no earlier contact; a did:key cannot
// say this, so it is reached only after it has spoken TSP to the VTC first. See docs/MESSAGING.md.
//
// The DID string is built by pnm-core's createDidPeer2 (segment order E, V, S: resolvers number keys by position, so
// `#key-1` is the X25519 key and `#key-2` the Ed25519 key). Browser-safe: no Node imports.
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { base58, base64urlnopad } from "@scure/base";
import { createDidPeer2 } from "@openvtc/pnm-core";

/** The service type a VTC and the TSP SDK match on. Spelled out: the `tsp` abbreviation expands differently per resolver. */
export const TSP_SERVICE_TYPE = "TSPTransport";

/**
 * The largest DID the affinidi resolver (`DIDCacheClient`, `max_did_size_in_bytes`, default 1000) parses. The mediator and the VTC
 * both use it, and neither says why when it is exceeded: the mediator login answers 403 "authcrypt requires the public key of
 * sender", the VTC treats the DID as unresolvable. A did:peer:2 carries its service inside the identifier, so naming a mediator
 * whose own DID is a long did:peer:2 (this kit's mediator: about 700 bytes) overflows it. A did:webvh mediator DID fits.
 */
export const MAX_DID_BYTES = 1000;

/** A signer with the shape @openvtc/trust-tasks-proof's `Signer` has, for a key that is not a did:key. */
export interface PeerSigner {
  curve: "ed25519";
  /** `<did>#key-2`: the proof names this VM, which is under `authentication` and `assertionMethod`. */
  verificationMethod: string;
  did: string;
  sign(hashData: Uint8Array): Uint8Array;
}

export interface PeerIdentity {
  /** `did:peer:2.E...V...S...` */
  did: string;
  /** The 32-byte Ed25519 seed everything else is derived from. */
  seed: Uint8Array;
  signer: PeerSigner;
  /** The mediator DID the TSPTransport service names. */
  mediatorDid: string;
  /** `<did>#key-2`, Ed25519, authentication. */
  authKid: string;
  /** `<did>#key-1`, X25519, keyAgreement (mediator login and DIDComm authcrypt). */
  keyAgreementKid: string;
  ed25519PublicKey: Uint8Array;
  x25519PublicKey: Uint8Array;
  /** X25519 private key: opens TSP frames sealed to this DID. */
  decryptionKey: Uint8Array;
  /** The X25519 secret as a JWK, for pnm-core's `Identity.fromSecretJwk` (mediator login). */
  secretJwk: { kty: "OKP"; crv: "X25519"; x: string; d: string };
}

/**
 * The did:peer:2 for `seed`, reachable over TSP through `mediatorDid`. Deterministic: the same seed and mediator
 * always give the same DID. A different mediator gives a different DID (the service is part of the identifier).
 */
export function didPeerFromSeed(seed: Uint8Array, mediatorDid: string): PeerIdentity {
  if (seed.length !== 32) throw new Error(`a did:peer seed is 32 bytes, got ${seed.length}`);
  if (!mediatorDid.startsWith("did:")) throw new Error(`the TSPTransport endpoint must be the mediator's DID, got ${JSON.stringify(mediatorDid)}`);
  const ed25519PublicKey = ed25519.getPublicKey(seed);
  const decryptionKey = ed25519.utils.toMontgomerySecret(seed);
  const x25519PublicKey = x25519.getPublicKey(decryptionKey);
  const peer = createDidPeer2({ ed25519PublicKey, x25519PublicKey, services: [{ type: TSP_SERVICE_TYPE, serviceEndpoint: mediatorDid }] });
  const size = new TextEncoder().encode(peer.did).length;
  if (size > MAX_DID_BYTES) throw new Error(didTooLongMessage(size, mediatorDid));
  return {
    did: peer.did,
    seed,
    mediatorDid,
    authKid: peer.authKid,
    keyAgreementKid: peer.keyAgreementKid,
    ed25519PublicKey,
    x25519PublicKey,
    decryptionKey,
    secretJwk: { kty: "OKP", crv: "X25519", x: base64urlnopad.encode(x25519PublicKey), d: base64urlnopad.encode(decryptionKey) },
    signer: { curve: "ed25519", did: peer.did, verificationMethod: peer.authKid, sign: (h) => ed25519.sign(h, seed) },
  };
}

/** Why a did:peer naming `mediatorDid` cannot be used, and what would fix it. */
export function didTooLongMessage(size: number, mediatorDid: string): string {
  return `a did:peer:2 naming this mediator would be ${size} bytes, over the ${MAX_DID_BYTES}-byte limit of the affinidi DID resolver the mediator and the VTC use (the mediator's own DID is ${mediatorDid.length} bytes${mediatorDid.startsWith("did:peer:") ? ", a did:peer:2" : ""}). The mediator would refuse the login (403) and the VTC could not resolve the applicant. It needs a mediator with a short DID (did:webvh). See docs/MESSAGING.md.`;
}

/** Whether a did:peer naming `mediatorDid` fits the resolver limit (same arithmetic as didPeerFromSeed, with a fixed key). */
export function didPeerFits(mediatorDid: string): boolean {
  try { didPeerFromSeed(new Uint8Array(32), mediatorDid); return true; } catch { return false; }
}

export interface ParsedDidPeer2 {
  /** In DID order: purpose letter (E, V, A, ...) and the raw public key with its multicodec. */
  keys: { purpose: string; codec: "ed25519-pub" | "x25519-pub" | "other"; publicKey: Uint8Array }[];
  /** Decoded `S` segments with `t` expanded the way the VTC's resolver expands it (`dm`, `tsp`). */
  services: { type: string; serviceEndpoint: unknown }[];
}

/** Decode a did:peer:2 without a resolver (for checks and messages, not for trust decisions). */
export function parseDidPeer2(did: string): ParsedDidPeer2 {
  if (!did.startsWith("did:peer:2.")) throw new Error(`not a did:peer:2: ${did.slice(0, 16)}...`);
  const out: ParsedDidPeer2 = { keys: [], services: [] };
  for (const part of did.slice("did:peer:2.".length).split(".")) {
    if (!part) continue;
    const purpose = part[0];
    if (purpose === "S") {
      const s = JSON.parse(new TextDecoder().decode(base64urlnopad.decode(part.slice(1)))) as { t: string; s: unknown };
      out.services.push({ type: s.t === "dm" ? "DIDCommMessaging" : s.t === "tsp" ? TSP_SERVICE_TYPE : s.t, serviceEndpoint: s.s });
      continue;
    }
    if (part[1] !== "z") throw new Error(`key segment ${purpose} is not base58btc multibase`);
    const raw = base58.decode(part.slice(2));
    const codec = raw[0] === 0xed && raw[1] === 0x01 ? "ed25519-pub" : raw[0] === 0xec && raw[1] === 0x01 ? "x25519-pub" : "other";
    out.keys.push({ purpose, codec, publicKey: raw.slice(2) });
  }
  return out;
}

/** The mediator DID a did:peer:2's TSPTransport service names, or undefined (a did:key, or no such service). */
export function tspMediatorOf(did: string): string | undefined {
  if (!did.startsWith("did:peer:2.")) return undefined;
  const svc = parseDidPeer2(did).services.find((s) => s.type === TSP_SERVICE_TYPE);
  const ep = svc?.serviceEndpoint;
  if (typeof ep === "string") return ep;
  if (ep && typeof ep === "object" && typeof (ep as { uri?: unknown }).uri === "string") return (ep as { uri: string }).uri;
  return undefined;
}
