// Recipe, hardening level 2 (docs/SECURITY.md): a non-extractable WebCrypto Ed25519 key and the did:key for it.
// The private key cannot be exported by page code; a script in the page can still ask it to SIGN, so also use a strict CSP
// and no third-party scripts. Run the demo:  npm run recipe:webcrypto-key
//
// What this does NOT do: plug into VtaClient. The kit's `Signer` is synchronous and WebCrypto signing is async, so wiring this key
// into `vta-client` needs an async signer path that does not exist yet (not implemented here). Browser support for Ed25519 in
// WebCrypto varies by browser and version: check `generateNonExtractableDid()` rejecting before relying on it (not verified for browsers).
import { didKeyFromPublicKey } from "@openvtc/trust-tasks-proof";
import { pathToFileURL } from "node:url";

export interface NonExtractableKey {
  did: string;
  sign(data: Uint8Array): Promise<Uint8Array>;
  verify(data: Uint8Array, sig: Uint8Array): Promise<boolean>;
  /** The CryptoKey itself, for tests; it cannot be exported. */
  privateKey: CryptoKey;
}

export async function generateNonExtractableDid(subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<NonExtractableKey> {
  // extractable:false applies to the private key; the public key of a pair is always exportable.
  const pair = (await subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  const did = didKeyFromPublicKey({ curve: "ed25519", bytes: raw }).split("#")[0];
  return {
    did,
    privateKey: pair.privateKey,
    sign: async (d) => new Uint8Array(await subtle.sign({ name: "Ed25519" }, pair.privateKey, d as BufferSource)),
    verify: (d, s) => subtle.verify({ name: "Ed25519" }, pair.publicKey, s as BufferSource, d as BufferSource),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const k = await generateNonExtractableDid();
  console.log(`did:key ${k.did}`);
  console.log("next: an admin grants this DID an ACL entry (VtaClient.grantAcl), as for any app identity.");
  try { await globalThis.crypto.subtle.exportKey("pkcs8", k.privateKey); console.log("UNEXPECTED: the private key was exportable"); } catch { console.log("private key export refused, as intended"); }
  const sig = await k.sign(new TextEncoder().encode("hello"));
  console.log(`signed 5 bytes; verifies: ${await k.verify(new TextEncoder().encode("hello"), sig)}`);
}
