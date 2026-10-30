# 5. Evaluating tasks

Four questions: is this task **fit** for my use, does **my implementation** behave, is a **new task** safe, and does it
**interoperate**. Plus a reviewer checklist for spec PRs. Marks: **[run]**, **[src]**, **[untested]**, **[draft]**
([legend](README.md#legend-how-each-claim-was-checked)).

## A. Is this task fit for my use?

Read the spec's front matter and score it with [`templates/scorecard.md`](templates/scorecard.md). What each line means:

| Criterion | Where to look | Good sign | Warning |
|---|---|---|---|
| Status | `status` | `candidate`/`standard` | `draft` (all live tasks today **[run]**): pin the exact version, expect change; `retired`/`withdrawn`: do not start on it |
| Maturity evidence | `knownImplementations`, `git log` on the folder, a newer version, `supersededBy` | Two independent implementations, stable history | Single author, edited last week, a successor exists |
| Parties | `parties` | Your roles match issuer/recipient; `identifierScope` fits your privacy needs | Needs a `public` identifier when you want pairwise ones |
| Effect | `sideEffects.level`, `consequences` | Matches your expectation | `destructive` you did not expect |
| Exposure | `exposure.discloses`, `ingests`, `actsAsSubject` | `none`/`metadata` | `secret`, or `ingests: personal` without a purpose limit |
| Proof | `proofRequirement` (per request/response) | Strength matches your transport and need to retain/relay | Optional on a task you will rely on later |
| Freshness | `issuedAtRequirement`, `maxDocumentBytes` | REQUIRED for consequential tasks | Absent on a mutating task |
| Authorization | `## Authorization` section | Names a concrete authority (ACL role, capability, ownership) | "The consumer verifies the proof, then executes" |
| Extension points | `extends`, payload `ext`, `related` | Optional members, `extends` chain to later minors | Closed schema with no room for what you need |
| Error model | `errorCodes`, response schema | Typed details, clear retry semantics | Only `taskFailed`; success and failure not distinguishable |
| Interop evidence | `knownImplementations`, `fixtures`, `payload.invalid-examples.json`, conformance tests in the libraries | Examples plus a negative set; more than one library | None |
| Served here? | discovery on your VTA/VTC ([02](02-finding-tasks.md)) | Listed for your target | Not listed: it does not exist for that deployment |

Decision: **adopt** (all rows acceptable), **adopt with mitigations** (write them in the scorecard), or **do not adopt**.
Keep the scorecard next to the code that uses the task, with the version you scored.

## B. Is my implementation right?

Test layers, cheapest first. The inbox-verifier shows layers 1 to 3 working offline **[run]**.

1. **Schema, valid and invalid.** Compile the task's `payload.schema.json` with ajv (2020-12, plus `ajv-formats`) and
   assert: every valid example passes, every entry of `payload.invalid-examples.json` fails (use `variant: "response"`
   against `$defs.Response`). Full code in [04](04-developing-tasks.md#walkthrough-a-private-note-task-handler-and-test)
   **[run]**. The registry serves the files: `https://trusttasks.org/specs/<slug>/<version>/payload.schema.json` and
   `payload.invalid-examples.json` **[run]**.
2. **Signatures.** Sign with `signTrustTask`, then verify with `DataIntegrityProofVerifier`; the proof package has
   byte-level agreement with the Rust, Dart and Go libraries on shared vectors (`fixtures/proof/` upstream: baseline,
   timestamp spellings, P-256/P-384) **[src]**. Assert the two failure modes you can cause: change one payload byte
   (`proofInvalid`) and sign with a key that is not the `issuer` DID (the signer throws).
3. **Consumer behaviour** (what `templates/inbox-verifier/test/inbox.test.ts` and `npm run demo` assert **[run]**):

   | Case | Expected |
   |---|---|
   | Good, signed note | accepted, handler runs once |
   | Same document again | `duplicate`, handler does not run (`notes.length === 1`) |
   | Payload edited after signing | `proofInvalid` |
   | `proof` removed (spec requires it) | rejected |
   | `recipient` is another DID | `wrongRecipient` |
   | Invalid payload | `malformedRequest` |
   | `expiresAt` in the past / `issuedAt` in the future | `expired` / `malformedRequest` |
   | Same `id`, different content | `idConflict` |
   | Unknown `type`, or a different MAJOR | your dispatch rejects it (`unsupportedType`/`unsupportedVersion`) |

   Add the last three for your own task; the template covers the first six.
4. **Live against a local VTA or VTC.** `npm run up` (add `WITH_VTC=1` for a community), then call through the starter's
   clients ([03](03-using-tasks.md)). Check: the task appears in discovery; the success path returns the documented
   response members; each documented error code is reachable (wrong role gives `permissionDenied`, a wrong version gives
   `unsupportedVersion`); a replay of the exact same signed document does not apply twice **[untested]** for custom tasks
   (the starter's own live runs are recorded in `docs/VTC.md` and `docs/VTC-SURFACE.md`).
5. **Read refusals precisely.** Branch on `payload.code`, log `message`, `retryable`, `retryAfter`; never on the HTTP status
   alone. A refusal that names another code than you expected is a finding (see [06](06-troubleshooting-and-glossary.md)).
   Do not echo a server's `message` to end users unfiltered: it is for operators (SPEC 8.2.1).
6. **Clock and size.** Test documents just inside and outside the acceptance window and at the spec's size bound.

## C. Security review checklist for a new task

Walk the list for every task; write "n/a" with a reason, not a blank. Source: SPEC 7.2, 7.3, 12, 13 **[src]**.

- [ ] **Effect class.** `sideEffects.level` is honest. Anything that changes state, releases secrets or exercises the
      subject's authority is consequential: `issuedAt` required, replay-safe, re-check before each irreversible step.
- [ ] **Authorization.** The spec names the entitlement (ownership, a capability, ACL role, membership). The handler
      checks it against live records at execution time. A valid signature is not permission.
- [ ] **Audience binding.** `recipient` required (unless the spec is deliberately a `bearer` spec, which needs a reason).
      Consumer compares with its own DID. Proof covers `recipient`.
- [ ] **Replay and idempotency.** Duplicate `id` never repeats the effect; the guard record outlives the acceptance window;
      shared store for replicas. Stating "target already in the requested state": setting a state succeeds, creating an
      existing thing is refused with a task code, a missing target is refused (SPEC 7.2).
- [ ] **Freshness.** `issuedAt` required, `expiresAt` short for approvals, completion deadlines go in the payload.
- [ ] **Proof.** Baseline `eddsa-jcs-2022` accepted; an unknown suite is `proofInvalid`, not "no proof"; verification runs on
      the document **as received**, not a re-serialized typed copy (SPEC 4.7).
- [ ] **Privacy and egress.** `exposure.discloses`/`ingests` set; data minimal; identifier scope declared; correlation
      across documents (subject DIDs, `threadId`, timing) considered; retention class stated and matches reality.
- [ ] **Free text.** Every free-text member has `maxLength`, a stated reader, "untrusted" and rendered attributed to its
      author. No secrets in it.
- [ ] **Error leakage.** Messages do not reveal whether a target exists to someone who may not see it (use one code for
      both), do not echo secrets, do not say why a proof failed (SPEC 12.4, 8.2.1); `details` is bounded.
- [ ] **Rate limits and DoS.** Size bound declared; schema validation cost bounded; per-caller limits on unauthenticated paths;
      parsers hardened (SPEC 12.4, 12.5).
- [ ] **Partial execution.** A multi-step effect reports what landed on `cancelled` (`details.effects`); an empty list means
      nothing landed, an absent one means unknown.
- [ ] **Empty payloads.** If `{}` is a valid request, confirm it cannot **act**. (Real examples in the VTC: an empty
      self-remove and an empty withdraw both took effect, `docs/VTC.md`.)

## D. Interoperability and conformance

**What exists today.** Per-spec schema plus `payload.invalid-examples.json`; generated round-trip tests in the Rust,
TypeScript, Go and Dart libraries; shared proof vectors in `fixtures/proof/`; a bindings-versus-registry check
(`npm run check-bindings`) **[src]**. These test documents in, verdict out, not a live peer.

**What is only a design.** A wallet/agent interop conformance profile is **proposed** in the spec repo's
`conformance-profile-design` branch (`docs/design/wallet-agent-interop-conformance-profile.md`, dated 2026-10-28) **[draft]**.
It states "Design only; nothing here is implemented". There is no test suite, harness, badge or certification yet, and it
is explicitly not a certification of security or fitness. Its proposed tiers, cumulative:

| Tier | Behaviour | Example checks |
|---|---|---|
| T0 Discover and parse | Answer discovery; reject malformed envelopes | Reject unknown `type`, expired, future-dated, wrong recipient; return a standard error |
| T1 Signatures | Verify and produce Data Integrity proofs | Accept `eddsa-jcs-2022` and P-256 vectors; unsupported suite is `proofInvalid`; resolve `did:key` then `did:webvh` |
| T2 Consequential-task safety | The checks owed before acting | No double execution of one `id`; stale-document refusal; consent summary digest matches payload; some items are "self-attested" |
| T3 Transports | Carry a task over one binding | Separate sub-profiles for HTTPS, DIDComm, TSP, push |

Use it as a reading list for your own tests, not as a claim you can make. A result in that design would mean only "on date D,
an endpoint controlled by DID X passed these checks", never "conformant".

**Practical interop evidence you can produce now:** run your consumer against the shared proof vectors; exchange one
document between two libraries (for example the TypeScript signer and a Rust verifier); record the versions in the
scorecard.

## E. Reviewer checklist for spec PRs

**Process**
- [ ] Only the author's `specs/<slug>/<version>/` folder changed; DCO sign-off on every commit; conventional-commit title.
- [ ] `npm run build` passes (CI runs it); all four generated bindings regenerated in the same PR and `check-bindings` is green.
- [ ] No library version bumps or changelog edits.
- [ ] Requested testing was done or the PR says it was not. (State this explicitly in the review.)

**Identity and versioning**
- [ ] Slug follows the grammar, is not a reserved `trust-task*`/`trust-ceremony*` slug, and matches the folder; version matches.
- [ ] A change to an existing spec is a new version folder when breaking; additive change declares `extends` and the schemas bear it out.
- [ ] `targetFrameworkVersion` is current; `status` is `draft` for a new spec.

**Front matter**
- [ ] Parties and `issuer`/`recipient` requirements are right; `proofRequirement` has a threat-model rationale.
- [ ] `sideEffects`, `exposure`, `retention` honest and with rationale; consequential implies `issuedAtRequirement: REQUIRED`.
- [ ] `errorCodes` use `<full-slug>:<lowerCamelCase>`, do not shadow standard codes, carry `retryable` and a `detailsSchema` where needed.

**Schema**
- [ ] Closed objects (`additionalProperties: false`), `$id` equals the Type URI, response under `$defs.Response` with `$anchor: "response"`.
- [ ] Free-text members bounded, attributed, untrusted. Wire conventions followed (RFC 3339 instants, `cursor`/`limit`/`nextCursor`).
- [ ] Shared definitions come from `_shared`, not copied.
- [ ] `payload.invalid-examples.json` covers missing required, unknown member, bounds, and the response variant.

**Prose**
- [ ] Authorization names an authority, not a validation step (no build check covers this).
- [ ] Security and Privacy sections are written (no `TODO` left; the lints do not catch it **[run]**).
- [ ] Examples are complete valid documents; the repeated-request, missing-target and already-in-state behaviours are stated.
- [ ] The task does not require consent or approval (that is consumer policy); it describes the effect instead.

**Test coverage (code changes only).** For spec-only PRs the evidence is the schema, examples and generated tests; for tool or
binding changes, expect tests that fail without the change.
