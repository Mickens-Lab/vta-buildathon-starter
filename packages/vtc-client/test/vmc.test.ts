// The member's own MembershipCredential (vtc/members/vmc/0.1): its shape, its proof, and the payload sent. No VTC needed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DataIntegrityProofVerifier } from "@openvtc/trust-tasks-proof";
import { newIdentity } from "@buildathon/vta-client";
import { DTG_CONTEXTS, VTC_TASK, VtcClient, memberVmc, signCredential } from "../src/index.js";

const VTC_DID = "did:webvh:Qmfake:localhost%3A8200";

test("memberVmc: DTG MembershipCredential from the member, naming the community, with no digest", () => {
  const vc = memberVmc({ memberDid: "did:key:z6MkMember", communityDid: VTC_DID, validFrom: new Date("2026-01-02T03:04:05Z") });
  assert.deepEqual(vc["@context"], ["https://www.w3.org/ns/credentials/v2", "https://registry.trustoverip.org/dtg/context/v1"]);
  assert.deepEqual(vc["@context"], [...DTG_CONTEXTS]);
  assert.deepEqual(vc.type, ["VerifiableCredential", "DTGCredential", "MembershipCredential"]);
  assert.equal(vc.issuer, "did:key:z6MkMember");
  assert.equal(vc.issuerScope, "directed");
  assert.equal(vc.validFrom, "2026-01-02T03:04:05Z");
  assert.deepEqual(vc.credentialSubject, { id: VTC_DID }); // no digestMultibase: stored unbound
  assert.match(String(vc.id), /^urn:uuid:[0-9a-f-]{36}$/);
  assert.equal(vc.proof, undefined);
  assert.notEqual(memberVmc({ memberDid: "a", communityDid: "b" }).id, vc.id, "a fresh id each time");
  assert.equal(memberVmc({ memberDid: "a", communityDid: "b", id: "urn:uuid:fixed" }).id, "urn:uuid:fixed");
});

test("signCredential: eddsa-jcs-2022, assertionMethod, a key under the member's did:key, and it verifies", async () => {
  const me = newIdentity();
  const vc = signCredential(memberVmc({ memberDid: me.did, communityDid: VTC_DID }), me.signer);
  const proof = vc.proof as Record<string, string>;
  assert.equal(proof.type, "DataIntegrityProof");
  assert.equal(proof.cryptosuite, "eddsa-jcs-2022");
  assert.equal(proof.proofPurpose, "assertionMethod");
  assert.ok(proof.verificationMethod.startsWith(`${me.did}#`));
  const v = await new DataIntegrityProofVerifier().verifyDetailed(vc as any);
  assert.deepEqual(v, { valid: true });
  // Tampering with the subject breaks it.
  const bad = await new DataIntegrityProofVerifier().verifyDetailed({ ...vc, credentialSubject: { id: "did:example:other" } } as any);
  assert.equal(bad.valid, false);
});

test("signCredential refuses a credential issued by someone else (the VTC would refuse it too)", () => {
  const me = newIdentity();
  assert.throws(() => signCredential(memberVmc({ memberDid: "did:key:z6MkSomeoneElse", communityDid: VTC_DID }), me.signer), /not the signer/);
});

test("sendMembershipCredential posts vtc/members/vmc/0.1 with { vc } signed by the client and returns the receipt", async () => {
  const me = newIdentity();
  const seen: any[] = [];
  const f = (async (input: any, init?: any) => {
    const doc = JSON.parse(init.body);
    seen.push({ url: String(input), doc });
    return new Response(JSON.stringify({ type: doc.type + "#response", payload: { memberDid: me.did, vmcId: doc.payload.vc.id, status: "stored" } }));
  }) as typeof fetch;
  const c = new VtcClient("http://x", VTC_DID, me, f);
  const r = await c.sendMembershipCredential({ id: "urn:uuid:00000000-0000-4000-8000-000000000001" });
  assert.deepEqual(r, { memberDid: me.did, vmcId: "urn:uuid:00000000-0000-4000-8000-000000000001", status: "stored" });
  const { doc } = seen[0];
  assert.equal(seen[0].url, "http://x/v1/trust-tasks");
  assert.equal(doc.type, VTC_TASK.membersVmc);
  assert.equal(doc.type, "https://trusttasks.org/spec/vtc/members/vmc/0.1");
  assert.deepEqual(Object.keys(doc.payload), ["vc"], "no requestId unless asked");
  assert.equal(doc.payload.vc.issuer, me.did);
  assert.equal(doc.payload.vc.credentialSubject.id, VTC_DID);
  assert.equal(doc.payload.vc.proof.proofPurpose, "assertionMethod");
  assert.deepEqual(await new DataIntegrityProofVerifier().verifyDetailed(doc.payload.vc), { valid: true });
  await c.sendMembershipCredential({ requestId: "req-1" });
  assert.equal(seen[1].doc.payload.requestId, "req-1");
});
