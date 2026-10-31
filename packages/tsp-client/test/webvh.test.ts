import assert from "node:assert/strict";
import { test } from "node:test";
import { mediatorHostOf } from "../src/index.js";

test("mediatorHostOf reads the host of a did:webvh, decoding a port", () => {
  assert.equal(mediatorHostOf("did:webvh:QmScid:med.example.test"), "med.example.test");
  assert.equal(mediatorHostOf("did:webvh:QmScid:localhost%3A7037:path"), "localhost:7037");
});

test("mediatorHostOf is undefined for anything that is not a did:webvh with a host", () => {
  assert.equal(mediatorHostOf("did:peer:2.Vz"), undefined);
  assert.equal(mediatorHostOf("did:webvh:QmScid"), undefined);
  assert.equal(mediatorHostOf("did:key:z6Mk"), undefined);
  assert.equal(mediatorHostOf(""), undefined);
  assert.equal(mediatorHostOf("did:webvh:QmScid:bad%E0%A4%A"), undefined);
});
