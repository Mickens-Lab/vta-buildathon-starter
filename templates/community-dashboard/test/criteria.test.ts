import assert from "node:assert/strict";
import { test } from "node:test";
import { describeCriterion, firstUsable } from "../src/criteria.ts";

const base = { requirementsDigest: "udigest" };
test("an open automatic criterion is usable", () => {
  const v = describeCriterion({ ...base, id: "open", admission: "automatic" });
  assert.equal(v.usable, true);
  assert.equal(v.reason, undefined);
  assert.match(v.outcome, /as soon as you apply/);
});
test("a review criterion is usable and says an administrator decides", () => {
  const v = describeCriterion({ ...base, id: "review", admission: "review" });
  assert.equal(v.usable, true);
  assert.match(v.outcome, /administrator/);
});
test("invitation, credentials and vetting are each greyed with a reason", () => {
  const inv = describeCriterion({ ...base, id: "a", admission: "review", invitationRequired: true });
  assert.equal(inv.usable, false);
  assert.match(inv.reason!, /invitation/);
  const cred = describeCriterion({ ...base, id: "b", admission: "automatic", presentationDefinition: { id: "x" } });
  assert.match(cred.reason!, /credentials/);
  const vet = describeCriterion({ ...base, id: "c", admission: "review", vetting: { required: 1 } });
  assert.match(vet.reason!, /vetting/);
  const all = describeCriterion({ ...base, id: "d", admission: "review", invitationRequired: true, vetting: { n: 1 } });
  assert.match(all.reason!, /invitation.* and .*vetting/);
});
test("empty or false requirement fields do not block", () => {
  assert.equal(describeCriterion({ ...base, id: "e", admission: "review", presentationDefinition: {}, credentialIssuers: [], vetting: null, invitationRequired: false }).usable, true);
});
test("unknown admission is described generically; firstUsable skips blocked ones", () => {
  assert.match(describeCriterion({ ...base, id: "f", admission: "odd" }).outcome, /odd/);
  const cs = [{ ...base, id: "x", admission: "review", invitationRequired: true }, { ...base, id: "y", admission: "review" }];
  assert.equal(firstUsable(cs)?.id, "y");
  assert.equal(firstUsable([cs[0]]), undefined);
});
