# 6. Troubleshooting and glossary

Marks: **[run]**, **[src]**, **[untested]**, **[draft]** ([legend](README.md#legend-how-each-claim-was-checked)). Most rows
below come from the starter's own live notes (`README.md`, `docs/FARM.md`, `docs/VTC.md`, `docs/VTC-SURFACE.md`) and are
**[src]** here: they were observed by earlier runs, not re-run for these pages. Always branch on `payload.code`; the HTTP
status varies.

## Errors seen against a VTA or VTC

| Symptom | Usual cause | Fix |
|---|---|---|
| `unsupportedVersion` for a task you know exists | The server serves other versions of that slug than your client sends. A farm or older image can lag or lead the starter's pin. Seen: `acl/grant/0.2` refused by one hosted environment, and `list/0.1` dropped by VTC 0.14.0 | List what the server serves (`vta.discover()`, VTC `trust-task-discovery/0.3`) and send a served version; run `npm run farm:probe` in farm mode; fall back only within the same MAJOR (see `callNewestSupported` in [03](03-using-tasks.md)) |
| `unsupportedType` | The slug is not served at all (feature off, or newer/older server). Example: `vtc/elections/*` are not served by the local VTC 0.15.0 | Check discovery. Do not wait for it; build the behaviour in the app (`docs/VTC-SURFACE.md`, "What does not exist") |
| `permissionDenied` (HTTP 403, sometimes 401 or 422) | Your signer's ACL role or context scope does not cover the task: for example `acl/list` is admin only | Grant the right role/scope (`vta.grantAcl`) or use an admin identity. Retrying never helps |
| `notFound` where you expected a refusal | `notFound` can mean "nothing to act on" **or** "you may not see it". `join-requests/status` with no open request, `withdraw` with none open, a group you cannot see, an unpublished card all answer `notFound`. Specs may deliberately use one code for both so a caller learns nothing about others' state | Read the spec's missing-target rule. Do not treat `notFound` as proof the thing does not exist |
| Refusal text "the signer holds no entry in this community" (VTC) | An **applicant** or stranger called a member-only read (profile, directory, groups) | Get admitted first. Applicants can only discover, read the manifest, submit, `status`, `withdraw`, `supplement` |
| "authentication failed" from `auth/authenticate` at a VTC | By design only **administrator** ACL entries get a console session; members and applicants cannot | Do not authenticate as a member. Call member tasks signed, with no session; the signed document is the authority |
| `auth/whoami` refused for a member | `whoami` identifies an admin session by the key that signs it | Use `GET /v1/member/me` after the member-portal sign-in, or skip it |
| Member-portal token does not work for tasks | It is a separate weak session (`VTC-member`); it serves only `/v1/member/me` and passkey routes | Sign each task with the member key |
| `proofInvalid` | A member changed after signing (`issuer`, `recipient`, `issuedAt` set late), or `issuer` is not the signing `did:key`, or the proof was verified over a re-serialized copy. The server never says which | Set all members first, then `signTrustTask`. Send exactly what you signed |
| `wrongRecipient` | `recipient` is not that server's DID. A VTA, its VTC and a farm agent each have their own; a fresh local volume changes the VTA DID | Read the DID from `/.well-known/did.jsonl` or the portal; re-run `vta:provision` after a reset |
| `identityMismatch` | The authenticated transport identity (bearer session) and the in-band `issuer` disagree | Sign with the same identity you authenticated as |
| `malformedRequest` | Payload fails its schema; or `issuedAt` is in the **future** beyond the skew (about 60 s), or `expiresAt <= issuedAt`; or a proof but no `recipient` | Validate against `payload.schema.json`; check the machine clock |
| `expired` | `expiresAt` passed, or the document is older than the server's acceptance window | Mint a **new** document with a fresh `id`; do not resend the old bytes |
| `idConflict` / "duplicate" | A document id was reused | New `id` per document. A byte-identical resend is absorbed silently by design |
| HTTP 429 | Rate limit. Auth is limited per IP; a signer with no ACL entry shares one per-address budget (burst 10, then one document per about 5 s); a known signer has its own (burst 60, then one per 500 ms) | Back off; cache the bearer token (about 15 min); do not poll in a tight loop |
| `provision` fails 401 or `permissionDenied` | `.vta/admin.json` is not the key this VTA volume was seeded with | `npm run reset`, then `npm run up` |
| Success but nothing happened / something unexpected happened | **Empty payload** `{}` is valid for several member tasks and they act: an empty `members/self-remove` removed the member, an empty `join-requests/withdraw` withdrew a request | Read the spec before sending `{}`; wrap destructive calls behind a confirmation |
| Joined, approved, but no credential arrives | The VMC is pushed over DIDComm/TSP, which the local stack leaves off; `status` returns `credentialsDelivered: false` | Admin `decide` response contains it, or enable messaging |
| Bearer works once then 401 | The session expired (about 15 min) | `authenticate()` again; `whoami` shows `session.expiresAt` |
| Browser call blocked | CORS: the VTA/VTC allow only configured origins | Local: ports 3000, 5173, 8000, or set `CORS_ORIGINS_TOML` on first boot; farm: use the Vite proxy in the templates |

For your **own consumer**: `suppressed` from `consumeInbound` is silence on purpose (answering would leak an oracle); log
it. A `rejected` outcome already carries a prepared, addressed error document to send back.

## Glossary

| Term | Meaning |
|---|---|
| **Trust Task** | One unit of verifiable work between two parties, defined by a versioned specification and exchanged as signed JSON documents |
| **Trust Task specification / spec** | The definition: slug, version, parties, payload schema, proof requirement, errors. Lives at its Type URI |
| **Type URI** | The name of a spec at a version, `https://trusttasks.org/spec/<slug>/<MAJOR.MINOR>`. Compared as a whole string. `#response` marks a success reply |
| **Slug** | The lowercase, hyphenated, optionally hierarchical name of a spec (`acl/grant`) |
| **Envelope / document** | The outer JSON object: `id`, `type`, `issuer`, `recipient`, `issuedAt`, `payload`, `proof`, ... |
| **Payload** | The task-specific body, validated by the spec's `payload.schema.json` |
| **Producer / issuer** | The party that sends a document. **Consumer / recipient**: the party that receives and acts |
| **Request / response / error** | The three reply shapes; told apart by `type` alone. Error type is `trust-task-error` |
| **Standard error code** | One of the framework's sixteen (`malformedRequest`, ... `internalError`). Task codes are `<slug>:<local>` |
| **Thread** (`threadId`) | Correlates documents of one exchange, for example a response with its request |
| **Consequential task** | Mutating, secret-releasing or subject-authority task: replay-safe, fresh, re-authorized before irreversible steps |
| **Bearer spec** | A spec that opts out of audience binding (`bearer: true`) |
| **Audience binding** | The signed `recipient` that stops a document for one service being replayed at another |
| **Proof** | A W3C Data Integrity proof over the document minus `proof`. Baseline suite `eddsa-jcs-2022` (Ed25519 over RFC 8785 canonical JSON) |
| **Cryptosuite** | The named signing/canonicalization recipe in a proof |
| **JCS** | JSON Canonicalization Scheme (RFC 8785): the deterministic serialization that gets signed |
| **Transport binding** | How documents travel and how transport identity maps to the envelope: HTTPS (this starter), DIDComm, TSP, push |
| **Discovery** | The `trust-task-discovery` task that lists the Type URIs a party supports |
| **Draft / candidate / standard / retired / withdrawn** | Spec maturity (`candidate`: two interoperable implementations; `standard`: 90-day stability). All live registry tasks are `draft` or `retired` at the time of writing |
| **`extends`** | A spec version's promise that it only adds to an earlier version of the same MAJOR, so older consumers can ignore the extras |
| **Ceremony** | A published flow of several tasks; a document's `ceremony` member is a claim, never a permission |
| **VID / DID** | Verifiable / Decentralized Identifier. A DID resolves to keys. Methods used here: `did:key` (key embedded in the identifier; offline), `did:web`, `did:webvh` (a verifiable-history `did:web`, what the VTA and VTC publish at `/.well-known/did.jsonl`) |
| **VTA** | Verifiable Trust Agent: a service that holds identities and keys, scopes access by context and exposes Trust Tasks at `/trust-tasks` |
| **VTC** | Verifiable Trust Community: a service on top of a VTA that runs a community (members, join policy, credentials, directory); Trust Tasks at `/v1/trust-tasks` |
| **VTI** | Verifiable Trust Infrastructure: the upstream project the VTA and VTC are built from; `pins.json` records the refs |
| **VMC / VAC** | Membership credential and role credential a VTC issues to a member. A VMC alone is not proof of current membership: check the status list |
| **VRC** | A relationship credential; the edges of a community's trust graph |
| **ACL** | Access-control list on a VTA or VTC. An entry grants a DID a role, optionally scoped to contexts and capabilities |
| **Context** | A named scope on a VTA that isolates keys, ACL entries and application data (`VTA_CONTEXT`) |
| **Applicant / member / admin** | VTC caller classes: not yet admitted; admitted; holds an administrator ACL entry (the only kind that gets a console session) |
| **Farm** | A hosted VTA service (VTA Farm) the starter can use instead of local Docker (`MODE=farm`) |
| **Registry** | The published index of specs at <https://trusttasks.org>, built from the spec repository |
| **Replay guard** | The consumer's record of accepted document ids; makes a repeated document a no-op |
| **DCO** | Developer Certificate of Origin: the `Signed-off-by` trailer (`git commit -s`) the spec repo requires |
