# 3. Using tasks

Two directions: **calling** a task on a VTA or VTC, and **consuming** a signed document someone sends you.
Marks: **[run]** executed, **[src]** read from source, **[untested]**, **[draft]**
([legend](README.md#legend-how-each-claim-was-checked)). Every TypeScript block below was typechecked against this
workspace **[run]** (`tsc --strict`, Bundler resolution, packages as pinned in `package.json`); they were not run against
a live VTA or VTC. The clients' own tests (mocked `fetch`) pass in the starter.

## Calling a task

### The short way: the clients

```ts
import { TASK, VtaClient, decodeCredential, identityFromCredential } from "@buildathon/vta-client";
import { VtcClient } from "@buildathon/vtc-client";
import { refusalOf } from "./refusal.js";

const vta = await VtaClient.fromCredential(process.env.VTA_CREDENTIAL!);   // base64url bundle from `npm run vta:provision`
await vta.authenticate();                                                    // bearer for authenticated tasks, ~15 min
const served = await vta.discover();
console.log(served.includes(TASK.whoami), served.length);

try {
  await vta.call("https://trusttasks.org/spec/acl/list/0.3", {});            // an admin-only task
} catch (e) {
  if (refusalOf(e)?.code === "permissionDenied") console.log("this signer is not an admin");
  else throw e;
}

const me = identityFromCredential(decodeCredential(process.env.VTA_CREDENTIAL!));
const vtc = await VtcClient.connect("http://localhost:8200", me);            // no bearer: the signature is the auth
console.log((await vtc.manifest()).communityDid);
```

- `VtaClient.call(type, payload)` signs and POSTs `{baseUrl}/trust-tasks`. `VtcClient.call` posts to
  `{baseUrl}/v1/trust-tasks` (no bearer). Both set `id`, `issuer`, `recipient`, `issuedAt` for you and throw
  `TrustTaskError` on a non-2xx status or a `trust-task-error` reply **[src]**.
- `call` returns the **response payload** only. If you need the response envelope (`threadId`, `issuedAt`, proof),
  build the POST yourself (next section) or catch the error's `body`.
- The type string is the version you speak. `TASK` in `vta-client` and `VTC_TASK` in `vtc-client` list the ones the
  starter uses; any other Type URI works with `call()`, as above.
- An empty payload `{}` is legal for many tasks, including some that **act** (`members/self-remove`,
  `join-requests/withdraw`). Never call a task you have not read with `{}` (`docs/VTC.md`).

### Building and signing by hand

```ts
import { signTrustTask } from "@openvtc/trust-tasks-proof";
import { newIdentity } from "@buildathon/vta-client";

const me = newIdentity();                       // a did:key; see identityFromCredential for a provisioned app
const recipient = "<recipient-did>";            // the consumer's DID

// Set issuer, recipient and issuedAt BEFORE signing: the proof covers what exists at signing time.
const signed = signTrustTask(
  {
    id: crypto.randomUUID(),
    type: "https://example.org/spec/buildathon/note/0.1",
    issuer: me.did,
    recipient,
    issuedAt: new Date().toISOString(),
    payload: { title: "hello", body: "world" },
  } as any,                                      // the signer takes a loosely typed document
  me.signer,
);
console.log(signed.proof);
```

Rules, all enforced by the proof package **[src]**: `issuer` must be the signer's own `did:key` (no `#fragment`);
`signTrustTask` replaces any existing `proof`; the suite is `eddsa-jcs-2022` for Ed25519 keys. To send as your
provisioned app instead of a fresh key: `identityFromCredential(decodeCredential(process.env.VTA_CREDENTIAL!))`.

Typed payloads: `@openvtc/trust-tasks` ships generated types (for example `AclGrant_v0_2.Payload`). Its prebuilt modules
are **deprecated** upstream in favour of generating only the tasks you pin (below); the framework ones
(`TrustTaskError_v0_6`, `TrustTaskDiscovery_v0_3`) stay **[src]**.

### Handling refusals

An error document looks like this (from SPEC 8.2, shape verified against the VTA error quoted in `docs/FARM.md`):

```json
{ "type": "https://trusttasks.org/spec/trust-task-error/0.5", "threadId": "<request id or thread>",
  "issuer": "<responder-did>", "recipient": "<your-did>",
  "payload": { "code": "unsupportedVersion", "message": "...", "retryable": false } }
```

```ts
import { TrustTaskError, type VtaClient } from "@buildathon/vta-client";

/** What a refusal looks like once the client has thrown it. */
export interface Refusal {
  httpStatus: number;
  code: string;            // SPEC 8.3 standard code, or a task-specific "<slug>:<local>" code
  message?: string;
  retryable?: boolean;
  retryAfter?: string;
  details?: unknown;
}

export function refusalOf(e: unknown): Refusal | undefined {
  if (!(e instanceof TrustTaskError)) return undefined;
  const p = (e.body as any)?.payload ?? {};
  return {
    httpStatus: e.status,
    code: String(p.code ?? "unknown"),
    message: p.message,
    retryable: p.retryable,
    retryAfter: p.retryAfter,
    details: p.details,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry only what the refusal says is retryable (SPEC 8.4); the client mints a fresh id each time. */
export async function callWithRetry<R>(fn: () => Promise<R>, attempts = 3): Promise<R> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const r = refusalOf(e);
      if (!r?.retryable || i >= attempts) throw e;
      const wait = r.retryAfter ? Date.parse(r.retryAfter) - Date.now() : 500 * 2 ** i;
      await sleep(Math.min(Math.max(wait, 0), 10_000));
    }
  }
}

/** Newest version first; fall back only on a version refusal (mirrors vtc-client's list helpers). */
export async function callNewestSupported<R>(vta: VtaClient, versions: string[], payload: Record<string, unknown>): Promise<R> {
  let last: unknown;
  for (const type of versions) {
    try {
      return await vta.call<R>(type, payload);
    } catch (e) {
      const code = refusalOf(e)?.code;
      if (code !== "unsupportedVersion" && code !== "unsupportedType") throw e;
      last = e;
    }
  }
  throw last;
}
```

How to react (SPEC 8.3, 8.4):

| `code` | Meaning | You should |
|---|---|---|
| `unsupportedVersion` / `unsupportedType` | Server does not serve that version/slug | Discover what it serves; fall back to another version of the *same MAJOR* only if your payload is valid for it |
| `permissionDenied` | Your signer is not allowed (ACL role, context scope) | Fix the grant. Retrying never helps |
| `proofInvalid` / `proofRequired` | Bad or missing signature | Check you set `issuer`/`recipient`/`issuedAt` before signing |
| `wrongRecipient` | `recipient` is not that server's DID | Re-read the server DID; a farm VTA or VTC has its own |
| `malformedRequest` | Fails the framework or payload schema (also: future `issuedAt`) | Validate against `payload.schema.json` first |
| `expired` | `expiresAt` passed, or the document is older than the server's window | Send a **new** document with a fresh `id` |
| `unavailable`, `internalError` (`retryable: true`) | Transient | Retry with backoff; honour `retryAfter` |
| `idConflict` | Same `id`, different content | You reused an id; mint a new one |
| `<slug>:<local>` | Task-specific, `details` has the shape | Read the spec's `errorCodes` |

"Retry" means re-sending the *same bytes* (same `id`, same proof). For a consequential task that is safe, because the
consumer must absorb the duplicate (7.2 item 11). `callWithRetry` above calls `vta.call` again, which mints a **new**
`id`; that is right for `unavailable` on a read, but for a consequential write prefer re-sending the exact signed
document you built by hand.

HTTP status is secondary: the starter saw 400 and 422 for refusals and 401/403 for sessions and roles; decide on
`payload.code`, not the status **[src]** (`docs/FARM.md`, `README.md`).

### Version tolerance

- Send the version your server serves (discovery, [02](02-finding-tasks.md)). `callNewestSupported` above tries a list
  newest first and falls back only on `unsupportedVersion`/`unsupportedType`; `vtc-client` does the same for list tasks.
- Within one MAJOR, a response from a newer MINOR may carry members you do not know. Ignore them; do not fail.
  Pass documents through `readForSpec` (below) when you consume.
- A new MAJOR is a different task: new payload, new code. Pin it deliberately.

### Rate limits

Servers throttle per caller. Observed on a local VTC 0.15.0 (`docs/VTC-SURFACE.md`, source and live): a signer with
no ACL entry shares one per-address budget (burst 10, then about one document per 5 s); a known signer gets its own
(burst 60, then one per 500 ms). The VTA rate-limits auth per IP (`README.md`: burst 60). A throttled call is HTTP 429
or an `unavailable`-style refusal. Do not loop on `authenticate()`; cache the token (about 15 minutes) and reuse it.

## Consuming a task

If you *receive* documents, you are the consumer and SPEC 7.2 applies to you. `@openvtc/trust-tasks/runtime` implements
the checks; `templates/inbox-verifier` is the worked example (`src/inbox.ts`, 109 lines, offline).

```sh
npm run demo -w @buildathon/inbox-verifier
```

`demo` starts the server and checks five cases: accepted once, replay not re-run, tampered payload `proofInvalid`,
wrong recipient `wrongRecipient`, bad payload `malformedRequest` **[run]** (also run for the "note" walkthrough copy in
[04](04-developing-tasks.md)).

What `consumeInbound` does, in order **[src]** (package README):

| SPEC 7.2 item | Check | In `consumeInbound`? |
|---|---|---|
| 1 | Framework envelope schema | No: your parse |
| 3 | Unknown `type` | No: **you dispatch on `doc.type` first** (below) |
| 2 | Payload against the spec schema | Yes, via your `payloadPolicy` validator |
| 4, 13 | `expiresAt`, future `issuedAt`, max age | Yes (`checks`) |
| 5, 8 | Wrong or missing `recipient`; proof without `recipient` | Yes |
| 6 | In-band `issuer`/`recipient` vs transport identity | Yes (`transport`) |
| 7 | Proof verification, proof-required | Yes (`proofPolicy`) |
| 11 | Duplicate execution (replay guard keyed on `id`) | Yes (`consequentialChecks(guard)`) |
| 10 | Proof is not permission | **No: your handler authorizes** |
| 12 | Re-check authority before each irreversible effect | **No: your handler** |

```ts
import { createServer } from "node:http";
import {
  InMemoryReplayGuard, UnauthenticatedTransport, consequentialChecks, consumeInbound, respondWith,
  type SpecPolicy, type TrustTaskDocument,
} from "@openvtc/trust-tasks/runtime";
import { DataIntegrityProofVerifier } from "@openvtc/trust-tasks-proof";

const MY_DID = "<your-did>";
const TYPE = "https://example.org/spec/buildathon/note/0.1";
const spec: SpecPolicy = { typeUri: TYPE, isBearer: false, isProofRequired: true, isRecipientRequired: true, isIssuedAtRequired: true, payloadSchema: {} };
const guard = new InMemoryReplayGuard();

createServer(async (req, res) => {
  let raw = ""; for await (const c of req) raw += c;
  const doc = JSON.parse(raw) as TrustTaskDocument<{ title: string }>;
  // Item 3: dispatch on the type YOU implement before anything else. Compare as a whole string; keep any #fragment.
  if (doc.type !== TYPE) { res.writeHead(400).end(); return; }
  const out = await consumeInbound({
    transport: new UnauthenticatedTransport(),
    spec,
    proofPolicy: { kind: "verify", verify: new DataIntegrityProofVerifier() },
    payloadPolicy: { kind: "acceptUnvalidated" },
    checks: consequentialChecks(guard),
    doc, myVid: MY_DID, now: Date.now(), newErrorId: () => crypto.randomUUID(),
    handler: (accepted) => respondWith(accepted, crypto.randomUUID(), { ok: true }),
  });
  res.end(JSON.stringify(out.kind));
});
```

Decisions that are yours:

- **Dispatch.** Compare `doc.type` with the whole string you implement, fragment included, before `consumeInbound`.
  Reject the rest `unsupportedType`; a known slug with another MAJOR is `unsupportedVersion`.
- **Transport.** `UnauthenticatedTransport` means identity is the proof's `did:key`. Behind a gateway that authenticated
  the caller use `StaticTransport({ issuer })` so a mismatch is `identityMismatch` (7.2 item 6).
- **Proof policy.** `verify` (honour proofs), `rejectIfPresent`, or `acceptUnverified` (only if the transport gives the same
  guarantee). A spec that requires a proof rejects a proofless document under all three.
- **Checks.** `consequentialChecks(guard)` for anything that changes state, moves value or discloses data;
  `notConsequentialChecks()` only for safe-to-repeat tasks. `InMemoryReplayGuard` forgets on restart and is per process:
  use a shared store for replicas, and keep records for as long as you accept the document (7.2 "Bounding the record").
- **Audience binding.** A signed document must name its `recipient`; the consumer rejects one that names someone else.
  This is what stops a document signed for service A being replayed at service B (SPEC 12.1). Compare against **your own**
  DID, never a value from the document.
- **Outcomes.** `handled` (send the response), `rejected` (send the prepared error), `duplicate` (return the prior
  response, not an error), `suppressed` (say nothing: answering would be an oracle, SPEC 8.1; still log it), `accepted`
  (fire-and-forget, emit nothing).
- **Authorization** is a separate decision in your handler. In the starter's design that means checking the issuer
  against your VTA ACL; a valid signature from any stranger is still a valid signature.
- **Later MINORs.** `readForSpec(parsed, X.SPEC)` lets a consumer of `x/0.2` accept `x/0.3` when `0.3` declares `extends`.
  Pass `read.doc` to `consumeInbound`, not a copy.

## Generating types and pinning tasks (Rust CLI + `@openvtc/trust-tasks-gen`)

Not shipped in this starter. Documented upstream (`GETTING-STARTED.md`, `trust-tasks-cli/README.md`) **[untested]**
here: the `trust-tasks` binary is not installed in the starter and was not built.

```sh
cargo install trust-tasks-cli                  # installs the `trust-tasks` binary
trust-tasks add acl/grant/0.2                  # writes trust-tasks.toml, trust-tasks.lock, trust-tasks/ (commit all three)
npm install @openvtc/trust-tasks && npm install -D @openvtc/trust-tasks-gen
trust-tasks generate --lang ts --out src/trust-tasks   # runs `check`, then npx trust-tasks-gen-ts
trust-tasks check                              # offline lock verification, for CI
trust-tasks list --remote                      # pinned versions and whether a newer one extends or breaks
```

`npm view @openvtc/trust-tasks-gen` reports version 0.1.2 with one bin, `trust-tasks-gen-ts` **[run]**. Generated modules
export `SPEC` (the per-task declarations `consumeInbound` needs: proof required, recipient required, schema) so you
do not hand-write a `SpecPolicy` as the inbox-verifier does. You can pin your own tasks under another authority in
`trust-tasks.toml` (`[sources.<name>]`, then `<name>:<slug>`), which is the upstream route for private specs.

Other upstream reading: `examples/consumer-app-ts` (a minimal pinned project) and `fixtures/proof/` (signed documents
every library's verifier must accept or reject) in the spec repo **[src]**.
