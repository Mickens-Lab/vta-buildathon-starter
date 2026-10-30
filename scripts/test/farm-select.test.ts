import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { agentUrl, checkAgentName, didFromLog, didLogUrl, farmId, mediatorFromLog, restUrl, type FarmTable } from "../farm-select.ts";

const t: FarmTable = JSON.parse(readFileSync(new URL("../farm-hosts.json", import.meta.url), "utf8"));

test("default farm is ic3 (preferred), firstperson selectable, unknown rejected", () => {
  assert.equal(farmId(t), "ic3");
  assert.equal(farmId(t, ""), "ic3");
  assert.equal(farmId(t, " FirstPerson "), "firstperson");
  assert.equal(t.farms.ic3.preferred, true);
  assert.throws(() => farmId(t, "nope"), /FARM must be one of/);
});

test("REST URL and DID log URL come from the farm domain", () => {
  assert.equal(restUrl(t.farms.ic3, "my-agent"), "https://vta-my-agent.ic3.dev");
  assert.equal(restUrl(t.farms.firstperson, "my-agent"), "https://vta-my-agent.firstperson.dev");
  assert.equal(didLogUrl(t.farms.ic3, "my-agent"), "https://dids.ic3.dev/my-agent-vta/did.jsonl");
  assert.equal(didLogUrl(t.farms.firstperson, "x"), "https://dids.firstperson.dev/x-vta/did.jsonl");
});

test("agent names must be DNS labels", () => {
  assert.equal(checkAgentName(" My-1 "), "my-1");
  for (const bad of ["", "a/b", "-a", "a.b", "a b"]) assert.throws(() => checkAgentName(bad));
});

test("explicit VTA_URL beats FARM_AGENT", () => {
  assert.equal(agentUrl(t.farms.ic3, "https://vta-x.example/", "demo"), "https://vta-x.example");
  assert.equal(agentUrl(t.farms.ic3, undefined, "demo"), "https://vta-demo.ic3.dev");
  assert.equal(agentUrl(t.farms.ic3, undefined, undefined), undefined);
});

test("DID and mediator are read from the newest DID log line", () => {
  const l1 = JSON.stringify({ state: { id: "did:webvh:OLD:h:a" } });
  const l2 = JSON.stringify({ state: { id: "did:webvh:NEW:h:a", service: [{ type: "VTARest", serviceEndpoint: "https://x" }, { type: "TSPTransport", serviceEndpoint: "did:webvh:M:h:med" }] } });
  const log = `${l1}\n${l2}\n`;
  assert.equal(didFromLog(log), "did:webvh:NEW:h:a");
  assert.equal(mediatorFromLog(log), "did:webvh:M:h:med");
  assert.equal(didFromLog("not json"), undefined);
  assert.equal(mediatorFromLog(l1), undefined);
});
