import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applicantCardRows, applicantRule, cardMediator, didBytes, didSizeRow, logNames, MAX_DID_BYTES, resolveRow, RESOLVES_LABEL, webvhLocation,
  type ApplicantCardInput,
} from "../src/applicant.ts";

const MED = "did:webvh:QmFakeScid123:mediator-example.trycloudflare.com";
const PEER = "did:peer:2.Ez6LSfake.Vz6Mkfake.SeyJ0IjoiVFNQVHJhbnNwb3J0In0";
const ORIGIN = "http://localhost:5173";
const log = (id: string) => `${JSON.stringify({ versionId: "1-x", state: { id: "did:webvh:QmOld:old.example.test" } })}\n${JSON.stringify({ versionId: "2-y", state: { id } })}\n`;
const row = (rows: ReturnType<typeof applicantCardRows>, label: string) => rows.find((r) => r.label === label);
const tunnel = (extra: Partial<ApplicantCardInput> = {}): ApplicantCardInput => ({ mode: "tunnel", origin: ORIGIN, applicant: { kind: "did:peer", did: PEER, mediatorDid: MED }, ...extra });

test("applicantRule mirrors the dashboard's applicantChoice", () => {
  assert.deepEqual(applicantRule("local", "", MED), { kind: "did:key" });
  assert.deepEqual(applicantRule("farm", "did:peer", MED), { kind: "did:key" });
  assert.deepEqual(applicantRule("tunnel", "", MED), { kind: "did:peer" });
  assert.deepEqual(applicantRule("tunnel", "did:peer", MED), { kind: "did:peer" });
  assert.deepEqual(applicantRule("tunnel", "did:key", MED), { kind: "did:key" });
  const none = applicantRule("tunnel", "", null);
  assert.equal(none.kind, "did:key");
  assert.match(none.why!, /no mediator DID/);
  const big = applicantRule("tunnel", undefined, MED, () => false);
  assert.equal(big.kind, "did:key");
  assert.match(big.why!, /1000-byte/);
});

test("local: messaging off, applicant did:key, nothing to resolve", () => {
  const rows = applicantCardRows({ mode: "local", origin: ORIGIN, applicant: { kind: "did:key", mediatorDid: null } });
  assert.deepEqual(rows.map((r) => r.label), ["Messaging", "Applicant"]);
  assert.match(row(rows, "Messaging")!.value, /off: local mode has no mediator/);
  assert.equal(row(rows, "Applicant")!.value, "did:key");
  assert.match(row(rows, "Applicant")!.note!, /No mediator to name/);
  assert.ok(rows.every((r) => r.pill === "info"));
  assert.equal(cardMediator({ mode: "local", advertisedMediator: MED }), undefined);
});

test("farm: did:key, mediator not checked, even when the VTA advertises one", () => {
  const rows = applicantCardRows({ mode: "farm", origin: ORIGIN, applicant: { kind: "did:key" }, advertisedMediator: MED });
  assert.equal(row(rows, "Applicant")!.value, "did:key");
  assert.equal(row(rows, "Mediator")!.value, "not checked");
  assert.equal(row(rows, RESOLVES_LABEL), undefined);
  assert.equal(cardMediator({ mode: "farm", advertisedMediator: MED }), undefined);
});

test("tunnel: did:peer applicant is ok, with both sizes and the resolve row", () => {
  const rows = applicantCardRows(tunnel({ probe: { ok: true, status: 200, body: log(MED) } }));
  assert.equal(row(rows, "Applicant")!.pill, "ok");
  assert.equal(row(rows, "Applicant")!.value, "did:peer:2 naming the stack's mediator");
  assert.match(row(rows, "Applicant DID size")!.value, new RegExp(`^${didBytes(PEER)} of 1000 bytes$`));
  assert.match(row(rows, "Mediator DID")!.value, /did:webvh:QmFakeScid123/);
  assert.match(row(rows, "Mediator DID")!.note!, /tunnel\.json/);
  assert.equal(row(rows, "Mediator DID size")!.pill, "ok");
  assert.match(row(rows, "Mediator DID size")!.note!, /max_did_size_in_bytes/);
  assert.equal(row(rows, RESOLVES_LABEL)!.pill, "ok");
});

test("tunnel: did:peer without a DID says its size is not checked here, and who applies", () => {
  const rows = applicantCardRows(tunnel({ applicant: { kind: "did:peer", mediatorDid: MED, appliesAs: "`npm run vtc:join`" } }));
  const a = row(rows, "Applicant")!;
  assert.match(a.note!, /not checked by this page/);
  assert.match(a.note!, /Who applies with it: `npm run vtc:join`/);
  assert.equal(row(rows, "Applicant DID size"), undefined);
  assert.equal(row(rows, RESOLVES_LABEL)!.value, "not checked");
});

test("tunnel: fallback to did:key shows why; override is info", () => {
  const fb = applicantCardRows(tunnel({ applicant: { kind: "did:key", why: "a did:peer:2 naming this mediator would exceed the 1000-byte DID limit.", mediatorDid: MED } }));
  assert.equal(row(fb, "Applicant")!.pill, "warn");
  assert.match(row(fb, "Applicant")!.value, /fallback/);
  assert.match(row(fb, "Applicant")!.note!, /Why not: a did:peer:2 naming this mediator would exceed the 1000-byte DID limit\. /);
  const ov = applicantCardRows(tunnel({ applicant: { kind: "did:key", mediatorDid: MED } }));
  assert.equal(row(ov, "Applicant")!.pill, "info");
  assert.match(row(ov, "Applicant")!.value, /VTC_APPLICANT=did:key/);
  const none = applicantCardRows(tunnel({ applicant: { kind: "did:key", why: "no mediator", mediatorDid: null } }));
  assert.equal(row(none, "Mediator DID")!.pill, "warn");
  assert.match(row(none, "Applicant")!.fix!, /up -- --tunnel/);
});

test("tunnel: no applicant option falls back to the mediator the VTA advertises", () => {
  const rows = applicantCardRows({ mode: "tunnel", origin: ORIGIN, advertisedMediator: MED });
  assert.equal(row(rows, "Applicant")!.value, "not reported by this page");
  assert.match(row(rows, "Mediator DID")!.note!, /Advertised in the VTA's DID document/);
  const differs = applicantCardRows(tunnel({ advertisedMediator: "did:webvh:QmOther:other.example.test" }));
  assert.equal(row(differs, "Mediator DID")!.pill, "warn");
});

test("DID sizes: bytes, not characters; near and over the limit", () => {
  assert.equal(didBytes("did:key:é"), 10);
  assert.equal(MAX_DID_BYTES, 1000);
  const pad = (n: number) => "did:webvh:x:" + "a".repeat(n - 12);
  assert.equal(didSizeRow("Mediator DID size", pad(899)).pill, "ok");
  assert.equal(didSizeRow("Mediator DID size", pad(900)).pill, "warn");
  assert.match(didSizeRow("Mediator DID size", pad(1000)).value, /near the limit/);
  const over = didSizeRow("Mediator DID size", pad(1001));
  assert.equal(over.pill, "bad");
  assert.match(over.value, /1001 bytes: over the 1000-byte limit/);
  assert.ok(over.fix);
  // multibyte characters push a 999-character DID over the limit
  assert.equal(didSizeRow("x", "did:webvh:x:" + "é".repeat(495)).pill, "bad");
});

test("webvhLocation: host, percent-encoded port, paths, and refusals", () => {
  assert.deepEqual(webvhLocation(MED), { host: "mediator-example.trycloudflare.com", url: "https://mediator-example.trycloudflare.com/.well-known/did.jsonl" });
  assert.deepEqual(webvhLocation("did:webvh:QmScid:example.test%3A8443"), { host: "example.test:8443", url: "https://example.test:8443/.well-known/did.jsonl" });
  assert.deepEqual(webvhLocation("did:webvh:QmScid:example.test%3a8443:dids:alice"), { host: "example.test:8443", url: "https://example.test:8443/dids/alice/did.jsonl" });
  assert.equal(webvhLocation(`${MED}#key-1`)?.host, "mediator-example.trycloudflare.com");
  assert.equal(webvhLocation(PEER), undefined);
  assert.equal(webvhLocation("did:webvh:QmScid"), undefined);
  assert.equal(webvhLocation("did:webvh:QmScid:bad host"), undefined);
  assert.equal(webvhLocation("did:webvh:QmScid:example.test%2Fevil"), undefined);
  assert.equal(webvhLocation("did:webvh:QmScid:example.test:%2E%2E"), undefined);
  assert.equal(webvhLocation("did:webvh:QmScid:example.test%ZZ"), undefined);
});

test("logNames: last entry id match, mismatch, garbage", () => {
  assert.deepEqual(logNames(log(MED), MED), { ok: true, id: MED });
  assert.equal(logNames(log("did:webvh:QmOther:x.example.test"), MED).ok, false);
  assert.ok(logNames("not json", MED).error);
});

test("resolveRow: every outcome of the browser fetch", () => {
  const ok = resolveRow(MED, { ok: true, status: 200, body: log(MED) }, ORIGIN);
  assert.equal(ok.pill, "ok");
  assert.match(ok.value, /^yes/);
  const mismatch = resolveRow(MED, { ok: true, status: 200, body: log("did:webvh:QmOther:x.example.test") }, ORIGIN);
  assert.equal(mismatch.pill, "bad");
  assert.match(mismatch.value, /different DID/);
  assert.match(mismatch.note!, /QmOther/);
  assert.equal(resolveRow(MED, { ok: true, status: 200, body: "<html>" }, ORIGIN).pill, "bad");
  const http = resolveRow(MED, { ok: false, status: 404 }, ORIGIN);
  assert.equal(http.pill, "bad");
  assert.match(http.value, /HTTP 404/);
  const cors = resolveRow(MED, { ok: false, corsBlocked: true, error: "Failed to fetch" }, ORIGIN);
  assert.equal(cors.pill, "info");
  assert.equal(cors.value, "the host answers but this page cannot read it (CORS)");
  assert.match(cors.note!, /`npm run tunnel:probe` checks it from Node/);
  assert.match(cors.note!, /not a fault of the stack/);
  assert.match(cors.fix!, /^Optional/);
  assert.match(cors.fix!, /`MEDIATOR_CORS_ALLOW_ORIGIN=http:\/\/localhost:5173`/);
  const down = resolveRow(MED, { ok: false, error: "Failed to fetch" }, ORIGIN);
  assert.equal(down.pill, "bad");
  assert.equal(down.value, "no answer from its host");
  const peer = resolveRow("did:peer:2.Ez6LSfake", undefined, ORIGIN);
  assert.equal(peer.pill, "info");
  assert.match(peer.value, /not checked: the mediator DID is not a did:webvh/);
});

test("the limit is the one tsp-client enforces (no runtime dependency, checked here)", async () => {
  const peer = await import("../../tsp-client/src/peer.ts");
  assert.equal(MAX_DID_BYTES, peer.MAX_DID_BYTES);
  // applicantRule with didPeerFits agrees with the size check for a short did:webvh and a too-long DID.
  assert.equal(applicantRule("tunnel", "", MED, peer.didPeerFits).kind, "did:peer");
  assert.equal(applicantRule("tunnel", "", "did:webvh:x:" + "a".repeat(900), peer.didPeerFits).kind, "did:key");
  const d = peer.didPeerFromSeed(new Uint8Array(32).fill(7), MED).did;
  assert.equal(didSizeRow("Applicant DID size", d).pill, "ok");
});
