// onCall and the shared trace: every call is reported once, with the outcome, and a broken observer never breaks a call.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { VtaClient, newIdentity, setTraceSink, type CallEvent, type TraceEvent } from "../src/index.js";

const VTA_DID = "did:webvh:Qmfake:localhost%3A8100";

function client(handler: (doc: any) => Response | Promise<Response>) {
  const f = (async (_u: any, init: any) => handler(JSON.parse(init.body))) as typeof fetch;
  return new VtaClient("http://localhost:8100", VTA_DID, newIdentity(), f);
}
afterEach(() => setTraceSink(undefined));

test("a successful call reaches onCall and the trace sink", async () => {
  const traced: TraceEvent[] = [];
  setTraceSink((e) => traced.push(e));
  const seen: CallEvent[] = [];
  const c = client((doc) => new Response(JSON.stringify({ type: doc.type + "#response", payload: { ok: 1 } })));
  c.onCall = (e) => seen.push(e);
  await c.call("https://trusttasks.org/spec/auth/whoami/0.1", { a: 1 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].ok, true);
  assert.equal(seen[0].status, 200);
  assert.deepEqual(seen[0].payload, { a: 1 });
  assert.equal(traced.length, 1);
  assert.equal(traced[0].source, "vta");
  assert.equal(traced[0].transport, "rest");
  assert.equal(traced[0].to, VTA_DID);
  assert.equal(traced[0].from, c.me.did);
  assert.match(traced[0].id!, /^[0-9a-f-]{36}$/);
  assert.equal(traced[0].ok, true);
  assert.equal(typeof traced[0].ms, "number");
});

test("a refusal is reported with its code", async () => {
  const traced: TraceEvent[] = [];
  setTraceSink((e) => traced.push(e));
  const c = client((doc) => new Response(JSON.stringify({ type: "https://trusttasks.org/spec/trust-task-error/0.5", payload: { code: "permissionDenied" } }), { status: 403 }));
  await assert.rejects(c.call("https://trusttasks.org/spec/acl/list/0.1"));
  assert.equal(traced[0].ok, false);
  assert.equal(traced[0].status, 403);
  assert.equal(traced[0].code, "permissionDenied");
});

test("a network failure is reported as such and rethrown", async () => {
  const traced: TraceEvent[] = [];
  setTraceSink((e) => traced.push(e));
  const c = new VtaClient("http://x", VTA_DID, newIdentity(), (async () => { throw new Error("down"); }) as typeof fetch);
  await assert.rejects(c.call("https://trusttasks.org/spec/auth/whoami/0.1"), /down/);
  assert.equal(traced[0].code, "network");
  assert.equal(traced[0].status, undefined);
});

test("a throwing observer or sink does not break the call", async () => {
  setTraceSink(() => { throw new Error("sink"); });
  const c = client((doc) => new Response(JSON.stringify({ type: doc.type + "#response", payload: { fine: true } })));
  c.onCall = () => { throw new Error("observer"); };
  assert.deepEqual(await c.call("https://trusttasks.org/spec/auth/whoami/0.1"), { fine: true });
});
