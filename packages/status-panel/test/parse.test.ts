import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyService, compareVersions, compatHints, didDocFromLog, groupTasks, mediatorDid, parseDidDocServices,
  parseTaskType, relativeTime, shortDid, versionFromOpenApi, versionsOf,
} from "../src/parse.ts";

const doc = {
  id: "did:webvh:Qm:example.com",
  service: [
    { id: "#vta-rest", type: "VTARest", serviceEndpoint: "https://vta.example.com" },
    { id: "#didcomm", type: "DIDCommMessaging", serviceEndpoint: [{ uri: "did:web:mediator.example.com", accept: ["didcomm/v2"] }] },
    { id: "#tsp", type: "TSPTransport", serviceEndpoint: "https://vta.example.com/tsp" },
    { id: "#x", type: ["LinkedDomains", "Other"], serviceEndpoint: { origins: ["https://a"] } },
  ],
};

test("parseDidDocServices classifies and flattens endpoints", () => {
  const s = parseDidDocServices(doc);
  assert.deepEqual(s.map((x) => x.kind), ["rest", "didcomm", "tsp", "other"]);
  assert.deepEqual(s[0].endpoints, ["https://vta.example.com"]);
  assert.deepEqual(s[1].endpoints, ["did:web:mediator.example.com"]);
  assert.equal(s[3].type, "LinkedDomains, Other");
});
test("parseDidDocServices tolerates a missing or odd service list", () => {
  assert.deepEqual(parseDidDocServices({}), []);
  assert.deepEqual(parseDidDocServices(null), []);
  assert.equal(parseDidDocServices({ service: { id: "#a", type: "VTARest", serviceEndpoint: "http://x" } }).length, 1);
  assert.equal(parseDidDocServices({ service: [null, 3] }).length, 0);
});
test("mediatorDid", () => {
  assert.equal(mediatorDid(doc), "did:web:mediator.example.com");
  assert.equal(mediatorDid({ service: [{ type: "DIDCommMessaging", serviceEndpoint: { uri: "https://x", routingKeys: ["did:web:m#k1"] } }] }), "did:web:m");
  assert.equal(mediatorDid({ service: [{ type: "VTARest", serviceEndpoint: "http://x" }] }), undefined);
  assert.equal(classifyService("Mediator", ""), "mediator");
});
test("didDocFromLog takes the last entry", () => {
  const log = [JSON.stringify({ state: { id: "did:a" } }), JSON.stringify({ state: { id: "did:a", service: [] } })].join("\n") + "\n";
  assert.equal(didDocFromLog(log).id, "did:a");
  assert.deepEqual((didDocFromLog(log).doc as any).service, []);
  assert.throws(() => didDocFromLog(JSON.stringify({ nope: 1 })));
});

test("compareVersions", () => {
  assert.equal(compareVersions("0.65.0", "0.65.0"), "match");
  assert.equal(compareVersions("v0.65.0", "0.65.0"), "match");
  assert.equal(compareVersions("0.56.0", "0.65.0"), "older");
  assert.equal(compareVersions("0.67.0", "0.65.0"), "newer");
  assert.equal(compareVersions("0.9.0", "0.10.0"), "older"); // numeric, not lexical
  assert.equal(compareVersions("0.65.0-nightly", "0.65.0"), "different");
  assert.equal(compareVersions("weird", "0.65.0"), "different");
  assert.equal(compareVersions(undefined, "0.65.0"), "unknown");
});
test("versionFromOpenApi", () => {
  assert.equal(versionFromOpenApi({ info: { version: "0.65.0" } }), "0.65.0");
  assert.equal(versionFromOpenApi({ info: {} }), undefined);
  assert.equal(versionFromOpenApi("<html>"), undefined);
});

const T = "https://trusttasks.org/spec";
const uris = [`${T}/acl/grant/0.1`, `${T}/acl/grant/0.2`, `${T}/acl/list/0.1`, `${T}/auth/whoami/0.1`, `${T}/vault/read/1.0`, `${T}/trust-task-discovery/0.1`, "{\"weird\":1}"];
test("parseTaskType", () => {
  assert.deepEqual(parseTaskType(`${T}/acl/grant/0.2`), { uri: `${T}/acl/grant/0.2`, family: "acl", name: "acl/grant", version: "0.2" });
  assert.equal(parseTaskType(`${T}/auth/step-up/approve-response/0.3`)?.name, "auth/step-up/approve-response");
  assert.equal(parseTaskType("nonsense"), null);
});
test("groupTasks groups by family, other last", () => {
  const g = groupTasks(uris);
  assert.deepEqual(g.map((x) => [x.family, x.count]), [["acl", 3], ["auth", 1], ["trust-task-discovery", 1], ["vault", 1], ["other", 1]]);
  assert.deepEqual(g[0].names, ["acl/grant", "acl/list"]);
  assert.deepEqual(groupTasks([]), []);
});
test("versionsOf and compatHints", () => {
  assert.deepEqual(versionsOf(uris, "acl/grant"), ["0.1", "0.2"]);
  const h = compatHints(uris);
  assert.equal(h[0].ok, true);
  assert.match(h[0].text, /0\.2 is also listed/);
  const only02 = compatHints([`${T}/acl/grant/0.2`]);
  assert.match(only02[0].text, /NOT listed/);
  assert.equal(compatHints([])[0].ok, false);
  assert.equal(compatHints(undefined)[0].ok, undefined);
});

test("relativeTime and shortDid", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assert.equal(relativeTime("2026-01-01T00:10:00Z", now), "in 10 min");
  assert.equal(relativeTime("2025-12-31T23:59:00Z", now), "expired 60 s ago");
  assert.equal(relativeTime("garbage", now), undefined);
  assert.equal(shortDid("did:key:z6Mk"), "did:key:z6Mk");
  assert.ok(shortDid("did:webvh:" + "Q".repeat(80)).length <= 48);
});
