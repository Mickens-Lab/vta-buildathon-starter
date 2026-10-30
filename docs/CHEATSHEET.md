# Cheatsheet

Part of the [docs index](README.md). Walkthroughs: [TRY-THIS.md](TRY-THIS.md); code tour: [ARCHITECTURE.md](ARCHITECTURE.md); keys and risks: [SECURITY.md](SECURITY.md).

Trust Task background, finding, using, developing and evaluating tasks: [trust-tasks/README.md](trust-tasks/README.md).

## Endpoints (local VTA, default port 8100)

| Method and path | Use |
|---|---|
| `GET /health` | Liveness |
| `GET /.well-known/did.jsonl` | The VTA's did:webvh log; last entry's `state.id` is the VTA DID |
| `POST /trust-tasks` | Every Trust Task. Body: a signed envelope. Header `Authorization: Bearer <token>` after auth |

`vta-client` does the DID lookup, signing and bearer handling for you.

## The envelope

```json
{
  "id": "uuid",
  "type": "https://trusttasks.org/spec/<slug>/<version>",
  "issuer": "did:key:z6Mk...",
  "recipient": "<VTA DID>",
  "issuedAt": "2026-10-28T12:00:00.000Z",
  "payload": {},
  "proof": { "type": "DataIntegrityProof", "cryptosuite": "eddsa-jcs-2022", "...": "..." }
}
```

- Set `issuer`, `recipient` and `issuedAt` **before** signing; a field added later
  is not covered by the proof and fails as `proofInvalid`.
- `issuer` must equal the signing `did:key` (no `#fragment`).
- The response has `type` + `#response` and its own `payload`. Errors come back as
  `trust-task-error` documents.
- Schemas: `https://trusttasks.org/spec/<slug>/<version>`.

## Trust Tasks used here (`TASK` in `vta-client`)

| Name | Type URI suffix | Who |
|---|---|---|
| discovery | `trust-task-discovery/0.1` | authenticated app |
| challenge | `auth/challenge/0.1` | any, no bearer |
| authenticate | `auth/authenticate/0.3` | any, no bearer; returns `tokens.accessToken` |
| whoami | `auth/whoami/0.1` | authenticated app |
| contextsCreate | `vta/contexts/create/1.0` | admin |
| contextsList | `vta/contexts/list/1.0` | admin |
| aclGrant | `acl/grant/0.1` | admin |

All are prefixed `https://trusttasks.org/spec/`. The VTA serves about 300 more;
`npm run hello` shows the count and `vta.discover()` lists them.

## VTC (community) endpoints

Same envelope, different door and recipient. See [VTC.md](VTC.md) for the full table.

| | VTA | VTC |
|---|---|---|
| Default port | 8100 | 8200 |
| Trust Task door | `POST /trust-tasks` | `POST /v1/trust-tasks` |
| `recipient` | VTA DID | VTC DID (`/.well-known/did.jsonl` or `VTC_DID`) |
| Bearer | after `authenticate` | none; the signed document is the auth |
| CORS | `server.cors_origins` | `[cors] allowed_origins` (empty = off) |
| Applicant tasks | | `vtc/join-requests/manifest/0.4`, `submit/0.3`, `status/0.1`, `withdraw/0.1` |
| Member tasks (signed, no session) | | `vtc/directory/card/show,update`, `directory/entries/list`, `community/profile/show`, `members/renew`, `groups/list` ... (see VTC-SURFACE.md) |
| Admin tasks | `acl/grant`, `vta/contexts/*` | `vtc/members/list/0.2`, `vtc/join-requests/list/0.2`, `decide/0.1` |

An applicant is not a member, so it cannot `authenticate`; it submits and polls `status`.

## Modes

| | `MODE=local` | `MODE=farm` |
|---|---|---|
| `VTA_URL` default | `http://localhost:8100` | required: `https://vta-<name>.<domain>` from the portal |
| `VTC_URL` default | `http://localhost:8200` | required for a community: `https://vtc-<name>.<domain>` |
| `VTA_DID` / `VTC_DID` | read from `/.well-known/did.jsonl` | copy from the portal (trusted as given) |
| Admin key | seeded into the VTA by compose | pasted into the portal as "Admin DID" (`npm run farm:setup`) |
| Browser CORS | allowed: 3000, 5173, 8000 | blocked; templates proxy `/__vta`, `/__vtc` via Vite |

## Env vars

| Var | Where | Meaning |
|---|---|---|
| `MODE` | `.env`, shell | `local` (default) or `farm` |
| `FARM` | `.env`, shell | farm mode only: `ic3` (default, preferred, https://vtafarm.ic3.dev) or `firstperson` (agent creation currently broken Farm-side) |
| `FARM_AGENT` | `.env`, shell | farm mode only: agent name; derives `VTA_URL` (`https://vta-<name>.<farm domain>`) and `VTA_DID` (from its DID log) |
| `VTC_URL` | `.env`, scripts | VTC base URL, default `http://localhost:8200` in local mode |
| `VTC_DID` | `.env` | VTC DID, when not served at `/.well-known/did.jsonl` |
| `VTC_REQUEST_ID` | `.env` | Written by `vtc:join`; delete to apply again |
| `VTC_IMAGE`, `VTC_PORT`, `VTC_CONTEXT`, `VTC_CORS_ORIGINS_TOML` | compose | The optional local VTC |
| `WITH_VTC=1` | shell | `npm run up` also starts and provisions the VTC |

| Var | Where | Meaning |
|---|---|---|
| `VTA_URL` | `.env`, scripts | VTA base URL, default `http://localhost:8100` (required in farm mode) |
| `VTA_DID` | `.env` | VTA DID (changes on every fresh volume) |
| `VTA_CONTEXT` | `.env` | Context your app is scoped to |
| `APP_DID` | `.env` | Your app's did:key |
| `VTA_CREDENTIAL` | `.env` | base64url JSON `{did, privateKeyMultibase, vtaDid, vtaUrl}`; contains a private key |
| `VTA_IMAGE` | compose | Image to run, default `vta-buildathon:local` |
| `VTA_PORT` | compose | Port, default 8100; baked into the VTA DID on first boot |
| `CORS_ORIGINS_TOML` | compose | TOML array body of allowed origins, e.g. `'"http://localhost:4200"'`; first boot only |
| `ENV_FILE` | provision/hello | Alternate env file, e.g. `.env.agent` |
| `APP_ROLE` | provision | ACL role for the app, default `application` |
| `INBOX_PORT`, `INBOX_DID`, `INBOX_URL` | inbox-verifier | Server port, its DID, and where `send` posts |
| `VTA_MCP_BIN` | mcp-agent | Path to a built `vta-mcp` |

## Auth flow

1. `auth/challenge` with `{subject: <your did>}` returns `{challenge, sessionId}`.
2. `auth/authenticate` with both returns `{tokens: {accessToken}}`.
3. Authenticated tasks need the bearer **and** a proof. Tokens last about 15 minutes
   (`whoami` shows `session.expiresAt`); call `authenticate()` again when one expires.

## Verifying as a consumer (SPEC 7.2)

`consumeInbound` from `@openvtc/trust-tasks/runtime` runs recipient, freshness,
proof, payload and replay checks. Outcomes: `handled`, `rejected`, `suppressed`
(stay silent), `duplicate`, `accepted`. Use `consequentialChecks(guard)` for
anything that changes state. See `templates/inbox-verifier`.

## Packages

| Package | Use |
|---|---|
| `@openvtc/trust-tasks` (0.28.1) | Types and the consumer runtime (`/runtime`) |
| `@openvtc/trust-tasks-proof` (0.1.6) | Sign and verify Data Integrity proofs; works in browsers |
| `@openvtc/trust-tasks-gen` | Generate typed modules for the tasks you pin |
| `@openvtc/pnm-core` | Avoid for REST auth against this VTA: 0.9.1 appears to use the removed `/auth/challenge` routes (unverified). Use `vta-client`. |

## Status panel (`@buildathon/status-panel`)

`mountStatusPanel(container, opts)` renders seven cards (connection, VTA identity, version vs `pins.json`, session,
capabilities, wallet, optional VTC) with a Refresh button and optional 15/30 s auto-refresh. Pure helpers
(`parseDidDocServices`, `compareVersions`, `groupTasks`, `compatHints`) are exported and unit-tested:
`npm test -w @buildathon/status-panel`. Web template: `npm run dev -w @buildathon/web-vta-app -- --port 3000` for
another allowed origin.

## Packages (VTC)

`@buildathon/vtc-client`: `VtcClient.connect(url, identity, fetch?, knownDid?)`, `manifest()`, `submitJoin()`, `joinStatus()`, `pickCriterion(manifest)`, admin `listMembers()`, `listJoinRequests()`, `decideJoin()`, and `call()` for any other task. `authenticate()`/`whoami()` are **admin-only** (a plain did:key member is refused by design). A member is **sessionless**: use typed signed requests (`myCard()`, `updateMyCard()`, `directoryEntries()`, `communityProfile()`, `withdrawJoin()`, `renewMembership()`, `leaveCommunity({confirm:true})`, `groups()` ...) and `memberProof()` (member portal `/v1/member/me`) for "am I a member right now". Matrix and limits: [VTC-SURFACE.md](VTC-SURFACE.md), [VTC.md](VTC.md#the-sessionless-member). Local VTC: submit/status/list/decide are verified live (see [VTC.md](VTC.md)).

**Observing calls.** `client.onCall = (e) => ...` (optional) is told after every call settles: `type`, `issuer`, `startedAt`,
`durationMs`, `status`, `ok`, `code` (refusal code, or `network`), the signed `payload` and the full signed `request`
(REST member-portal calls have no `request`). `client.joinPayload(opts)` returns what `submitJoin` would sign, without sending.

## Community dashboard (`templates/community-dashboard`)

React + Vite, no session. State from signed calls: status `notFound` = visitor; `pending`; `approved` + a member-only read
(`community/profile/show`) that succeeds = member; `withdrawn`; `approved` but the member read refused = left (inferred wording);
`rejected`, `deferred`, "needs more information" and unknown statuses are inferred, unknown ones show a generic "status: X" screen.
Ask `join-requests/status` with the request id you remember: with no id it was seen returning an older approved request after
a newer one was withdrawn. Poll at most every 10 s (anonymous limit: burst 10, then one per 5 s). Details and markers:
`templates/community-dashboard/README.md`.

## Common errors

| Error | Cause |
|---|---|
| `proofInvalid` | Field changed after signing, or `issuer` is not the signing did:key |
| `wrongRecipient` | `recipient` is not the verifier's DID |
| `malformedRequest` | Payload fails the schema |
| `permissionDenied` / 401 | Not authenticated, or the ACL scope does not cover the call |
| 429 | Auth rate limit; retry shortly |

More causes and fixes: [trust-tasks/06-troubleshooting-and-glossary.md](trust-tasks/06-troubleshooting-and-glossary.md).
