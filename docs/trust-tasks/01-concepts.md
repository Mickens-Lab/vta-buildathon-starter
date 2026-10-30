# 1. Concepts

A **Trust Task** is one unit of verifiable work between two parties, written down once as a *specification* and
exchanged as small signed JSON *documents*. It does not care what carries the document (HTTP, DIDComm, a queue).
The VTA and VTC in this starter expose their whole API this way: `POST /trust-tasks` (VTA) and `POST /v1/trust-tasks`
(VTC), body is one document **[src]** `packages/vta-client/src/client.ts`, `packages/vtc-client/src/index.ts`.

Marks: **[run]** executed, **[src]** read from source, **[untested]**, **[draft]**. See the [legend](README.md#legend-how-each-claim-was-checked).

## The envelope

```json
{
  "id": "4f3c9e2a-1b81-4d3e-9b51-7a3c89e3d1f2",
  "type": "https://trusttasks.org/spec/acl/grant/0.2",
  "threadId": "2d7f0b6e-5c3a-4e8b-8f1d-6a9e4c2b7d15",
  "issuer": "<sender-did>",
  "recipient": "<your-vta-did>",
  "issuedAt": "2026-10-28T12:00:00.000Z",
  "expiresAt": "2026-10-28T12:05:00.000Z",
  "payload": { "...": "task-specific, defined by the spec" },
  "proof": { "type": "DataIntegrityProof", "cryptosuite": "eddsa-jcs-2022", "...": "..." }
}
```

| Member | Rule (SPEC section) |
|---|---|
| `id` | Required. Globally unique per document; UUID v4 recommended. Never reuse (4.3). It is the replay key. |
| `type` | Required. The **Type URI**: spec slug plus `MAJOR.MINOR`. Compared as a whole string (6.1). |
| `payload` | Required. A JSON object whose shape is the spec's `payload.schema.json`. |
| `issuer` / `recipient` | The sender and the party meant to act. Both are DIDs (any verifiable identifier is allowed). A document with a proof and no `recipient` is refused unless the spec is a "bearer" spec (7.2 item 8). |
| `issuedAt` | Should be set. **Must** be set for consequential tasks, so the consumer can bound its replay record (7.3 item 17). |
| `expiresAt` | Optional. At or after this instant the consumer must not act (4.2). |
| `threadId` | Optional. Correlates a response, or an error, with its request. Responders must set it on errors. |
| `proof` | A W3C Data Integrity proof over the document minus `proof`. Required or optional per spec (4.7). |
| `ext` (in the payload) | Extension slot. Child keys must be reverse-DNS namespaced (4.5.1). |

All members above are **[src]**; the first example in SPEC section 4.2 is the model.

Two rules cost people the most time **[src]** (`GETTING-STARTED.md` in the spec repo, "four traps"; the CHEATSHEET
repeats the first):

1. Set `issuer`, `recipient` and `issuedAt` **before** signing. A member added afterwards is not covered by the proof
   and the document fails as `proofInvalid`.
2. A proof proves *who signed and that nothing changed*. It does **not** prove the sender is *allowed* to ask
   (7.2 item 10). Authorization is the consumer's own decision (an ACL entry on a VTA).

## Request, response, error

A reply is one of three things, told apart **only by its `type`** (4.4.1):

| Reply | `type` | Closes the exchange |
|---|---|---|
| Success | request type + `#response` | yes |
| Failure | `https://trusttasks.org/spec/trust-task-error/<MAJOR.MINOR>` | yes |
| Continuation | `https://trusttasks.org/spec/trust-task-next-step/<MAJOR.MINOR>` | no |

A request has no fragment (or `#request`). Never infer success from "there is a payload".
Keep the fragment when you compare or route on `type`, or requests and responses collide.

An **error document** carries `payload.code`, `retryable`, and optionally `message`, `retryAfter`, `details`,
`inResponseTo` (8.2). The standard codes (8.3) every consumer must understand:

`malformedRequest`, `unsupportedType`, `unsupportedVersion`, `unsupportedExtension`, `expired`, `proofRequired`,
`proofInvalid`, `permissionDenied`, `wrongRecipient`, `identityMismatch`, `idConflict`, `cancelled`, `taskFailed`,
`unavailable`, `indeterminate`, `internalError`.

A spec may add its own codes named `<slug>:<local>`, for example `vta/app-state/put:versionConflict`, which carries the
current version and value in `details` **[src]** `specs/vta/app-state/put/1.0/spec.md`. A client that does not know an
extended code should treat it as `taskFailed` (8.5).

## Versions and status

- A spec version is `MAJOR.MINOR` (no patch). Backwards-compatible change: bump MINOR. Breaking change: bump MAJOR,
  reset MINOR (5.2). While a spec is `draft`, even a breaking change may be a MINOR bump.
- A consumer must reject a MAJOR it does not implement with `unsupportedVersion`. It should accept a later MINOR of
  the same MAJOR by ignoring members it does not know, but only reliably when the newer version declares
  `extends: "<earlier MINOR>"`, a promise that it only adds (5.2).
- Status lifecycle (5.3): `draft` (may change without notice) -> `candidate` (frozen, needs two interoperable
  implementations) -> `standard` (90-day stability window) -> `retired` (still verifiable, not for new use) ->
  `withdrawn` (terminal). Consumers treat all statuses the same when validating.
  In the live registry today everything is `draft` or `retired` **[run]**: **pin exact versions**.

Why you will see `unsupportedVersion` in this starter: the VTA you talk to serves specific versions, and your client
sends specific versions. Example: `vtc-client` sends `list/0.2` and retries `0.1` only on a version refusal **[src]**.

## Parties, side effects, exposure

Each spec declares, in front matter, who plays which role and what the task does. These drive evaluation
([05](05-evaluating-tasks.md)):

| Declaration | Values | Meaning |
|---|---|---|
| `parties` | role, `issuer`/`recipient`, requirement | Who sends and who acts, and whether each member is required |
| `proofRequirement` | OPTIONAL / RECOMMENDED / REQUIRED (per request/response) | Whether a signature is mandatory, and why |
| `sideEffects.level` | `none`, `mutating`, `destructive` | The effect on the recipient's state |
| `exposure.discloses` / `ingests` | `none`/`metadata`/`secret`; `none`/`metadata`/`personal`/`secret` | What leaves the recipient, what the request puts into it |
| `retention.class` | `transient`, `exchange`, `durable` | What the recipient is expected to keep |

A task is **consequential** when it mutates state, releases confidential material, or exercises the subject's own
authority (3). For those the consumer must not run the same `id` twice (7.2 item 11), must re-check authority before
each irreversible step (item 12), and the spec must require `issuedAt` (7.3 item 17). Example: `vta/app-state/put/1.0`
declares `mutating`, proof REQUIRED, `issuedAt` REQUIRED, because an old copy applied late would overwrite a newer
value **[src]**.

## Proof suites

| `cryptosuite` | Key | Rule |
|---|---|---|
| `eddsa-jcs-2022` | Ed25519 | Baseline. Every consumer must verify it (4.7.1). Use this. |
| `ecdsa-jcs-2019` | P-256 (and P-384 in the TS library) | Consumers should verify it (hardware signers use P-256). |
| `mldsa44-jcs-2024`, `slhdsa128-jcs-2024` | post-quantum | Draft; only where both sides agreed. |

A consumer that does not know the named suite must answer `proofInvalid`, never treat the document as unsigned.
`@openvtc/trust-tasks-proof` signs and verifies the first two **[src]** (package README). Its signer refuses a document
whose `issuer` is not the signer's own `did:key`; keys travel inside the `did:key`, so no resolver or network is needed.

## Transports

A transport binding says how documents travel and how identity, integrity and freshness map onto the envelope (9).
This starter uses **REST over HTTP** only: signed documents POSTed as JSON. DIDComm, TSP and push bindings exist upstream
(`bindings/` in the spec repo) but this starter leaves DIDComm and messaging off **[src]** `docs/VTC-SURFACE.md`.
When the transport already authenticates the sender (mutually authenticated TLS, a bearer session), the in-band
`issuer` must agree with it, otherwise `identityMismatch` (7.2 item 6).

## How the starter sends one

`VtaClient.call(type, payload)` builds `{id: uuid, type, issuer: me.did, recipient: vtaDid, issuedAt: now, payload}`,
signs it with `eddsa-jcs-2022`, POSTs to `{baseUrl}/trust-tasks` with the bearer token if you authenticated, and returns
`body.payload`; a non-2xx status or a `trust-task-error` type throws `TrustTaskError` **[src]**. `VtcClient.call` is the
same against `{baseUrl}/v1/trust-tasks`, with no bearer: the signed document is the authentication.
Details and snippets: [03 Using tasks](03-using-tasks.md).

## Private tasks

A Type URI at `https://trusttasks.org/` is reserved for the public registry. For your own tasks use another authority
you control, e.g. `https://example.org/spec/<slug>/<MAJOR.MINOR>`, a DID URL or a URN (6.5). Everything else in the
framework (envelope, versions, errors, consumer checks) applies unchanged. The inbox-verifier template does this with
`https://example.org/spec/buildathon/note/0.1` **[src]**. Slugs must match
`^[a-z][a-z0-9]*(-[a-z0-9]+)*(/[a-z][a-z0-9]*(-[a-z0-9]+)*)*$` and must not start with `trust-task` or `trust-ceremony`.

## Ceremonies (one paragraph)

A *Trust Ceremony* is a flow of several tasks; a document may carry a `ceremony` member naming the run it belongs to.
Membership is a **claim**, never a permission (7.2 item 9). Definitions live under `ceremonies/` upstream
(for example a VTC member-onboarding ceremony). You can ignore ceremonies until you build a multi-step flow.
