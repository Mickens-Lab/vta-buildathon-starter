# VTC surface at 0.15.0: what each kind of caller can do

Part of the [docs index](README.md). Run it yourself: `npm run vtc:refusals` ([TRY-THIS.md](TRY-THIS.md), exercise 5). Check the read-only part of the matrix below against a live local stack with `npm run test:roles` (see [Contract test](#contract-test-npm-run-testroles)).

Source: `vtc-service-v0.15.0` (`93d36996`), read from a detached worktree, plus a live run on 2026-10-29 against the
local stack (VTC 0.15.0, VTA 0.65.0, DIDComm and messaging off). Every claim is marked **source** (read in code or the
task's own authority table) or **live** (observed on the local stack). Nothing here was run against the Farm.

## The short answer

- Every Trust Task is a signed document POSTed to `/v1/trust-tasks`. The spine verifies the proof, then each handler
  decides authority by reading **the signer's live records now**: an ACL entry (`require_capability`), the member record
  (`active_member`), or just ownership of the thing asked about (`resolve_holder`). No gate is a claims check.
- A plain member (an approved app `did:key`) **cannot open an `auth/authenticate` console session**. `auth_role_for` admits only
  entries with `admin.is_administrator()`. Live: refused `authentication failed`, for the member and the pending
  applicant; the admin authenticates.
- It does not need one. A member can call, with no session, every member task in the matrix below (own status/withdraw,
  community reads, directory, groups, renew/leave, trust-graph and room-offer reads).
- There **is** one member session, and it is narrow: the member portal (`/v1/member/*`, audience `VTC-member`). An
  active member signs in with a self-issued SIOPv2 `id_token` signed by its own did:key at `/v1/member/wallet/auth/*`
  (**deprecated upstream** in favour of the wallet `auth/oob/*` flow). Live: works for the approved member, refused for a pending
  applicant (`session not found`: the challenge is unusable) and for the administrator. The token serves only
  `GET /v1/member/me` and `/v1/member/passkeys*`; **it unlocks no Trust Task.** `/v1/member/me` is the member's whoami
  (`did`, `role`, `joinedAt`, `personhood`, community). Source: `routes/member_portal.rs`, `member_portal/*`.
- `auth/whoami/0.1` is for administrator sessions only (the signer must be the key of a live admin session): refused for
  member, applicant and stranger.

## Who-can-call-what (live, 4 identities, one run)

`OK` = answered. `refused` = permissionDenied / notMember / "holds no entry". `-` = not applicable. Rate limits
mattered: a signer with no ACL entry shares one per-address anonymous budget (burst 10, then one document per 5 s,
`routing/trust_task_admission.rs`), a known signer has its own bucket (burst 60, then one per 500 ms).

| Operation | stranger (fresh did:key) | applicant (pending) | member | admin |
|---|---|---|---|---|
| `trust-task-discovery/0.3` (list served tasks) | OK | OK | OK | OK |
| `join-requests/manifest/0.4` | OK | OK | OK | OK |
| `community/theme/show`, `directory/disclosure/0.1`, `vetting/vetters/list` | OK | OK | OK | OK |
| `join-requests/submit/0.3` | OK | OK | OK (a second open request; `decide` would then refuse as duplicate) | not tried |
| `join-requests/status/0.1` | notFound (none open) | OK | OK (`approved`) | notFound |
| `join-requests/withdraw/0.1` | notFound | OK (withdrawn) | OK for an open request; notFound when none | - |
| `join-requests/supplement/0.1` | - | not exercised (needs an "awaiting evidence" request) | notFound (none open) | - |
| `community/profile,branding,join-discovery,requested-attributes/show`, `ceremonies/list` | refused ("holds no entry in this community") | refused | OK | OK |
| `directory/fields/list`, `directory/entries/list`, `directory/query` | refused | refused | OK | OK |
| `directory/card/show,update` (own card) | refused | notMember | OK (update verified: revision 0 to 1) | notMember |
| `directory/entries/show` by `entryId` | refused | refused | OK | OK |
| `directory/entries/show` by `did`, `directory/query` for another member's DID | - | - | refused / notFound: DID addressing is administrators' only | OK |
| `directory/card/public` | notFound (nothing published) | - | notFound | - |
| `groups/list` | refused | refused | OK (empty: groups are off, see below) | OK |
| `groups/create` | - | - | refused (needs `vtc.groups.manage`) | `noKeyHolder`: no `[groups]` context configured |
| `members/renew/0.1` | - | - | OK (returns new `roleVac`) | - |
| `members/self-remove/0.1` | - | - | OK, immediate, **empty payload suffices** (tombstoned; the same DID re-applied and was re-approved) | - |
| `relationships/list/0.3` | - | - | OK (needs `did`) | needs `did` |
| `rooms/offers/list`, `rooms/memberships/list` | - | - | OK (empty) | notAMember |
| `auth/challenge/0.1` | OK (source: answers every caller) | - | OK | OK |
| `auth/authenticate/0.3` (via challenge) | - | refused "authentication failed" | refused "authentication failed" | OK |
| `auth/whoami/0.1` | refused | refused | refused | OK |
| `auth/sessions/list`, `auth/signing-key/list`, `auth/step-up/approver/list` | refused | refused | OK (empty) | OK |
| `/v1/member/wallet/auth/*` then `GET /v1/member/me` | - | 401 `session not found` | OK (role, joinedAt, personhood) | 401 `session not found` |
| `members/list,show,admit,update,admin-remove`, `join-requests/list,decide,show`, `acl/*`, `audit/*`, `config/*`, `policy/*`, `vtc/roles/*`, `registry/*`, `website/*`, `schemas/*`, `storage/*`, `endorsements/*`, `invitations/*` | refused | refused | refused ("DID is not permitted to authenticate" / "not in ACL") | OK (the read ones tried; mutating ones not tried) |
| `members/purge`, `members/rotate*`, `config/restart,reload,patch`, `backup/*`, `install/*`, `admin/bootstrap` | not probed (destructive) | | | |

Not verified live (source only): `directory/card/publish,present`, `directory/images/*`, `groups/show,join,leave,members/list`
(the community has no group key holder), `members/personhood/*`, `members/vmc`, `members/rotate*`, `relationships/publish,revoke`,
`rooms/offers/accept`, `join-requests/supplement` success path, `credential-exchange/*` and `vtc/auth/recognise/*`.
`vtc/elections/*` and `vetting-pcs` tasks are **not served** by this build (absent from the discovery list; `voting` and
`vetting-pcs` features are off).

## Contract test: `npm run test:roles`

With the local stack up (`WITH_VTC=1 npm run up`, not part of `npm test`), `npm run test:roles` makes a fresh stranger, a
throwaway applicant (who applies, is approved by the admin key in `.vta/admin.json`, and leaves again at the end) and the
admin each call a set of **safe read** tasks and compares the outcome with the matrix above: `ok`, `notFound` or `refused`.
The rows live in `scripts/lib/live-matrix.ts`; a unit test (`scripts/test/roles-matrix-doc.test.ts`, part of `npm test`) checks that every
probed task is named in this file. Calls are paced: the stranger and the applicant share the anonymous budget (burst 10, then
one per 5 s), so they are spaced about 5 s apart after a burst of seven; the member and the admin run at about two calls a second.
It takes about a minute. Without the stack it prints `SKIP` and exits 0 (`REQUIRE_STACK=1` makes that a failure).
Observed 2026-10-29 against the local stack (VTC 0.15.0): 36 of 36 probes matched.

Observed while building it, not in the table above: the member-portal sign-in routes (`POST /v1/member/wallet/auth/challenge`
and `/v1/member/wallet/auth/`) answered HTTP 429 `rate_limited` (`limiter: unauth`) for an approved member once the anonymous
budget was spent, so they count against the per-address anonymous budget even though the caller is a member.

## Public REST (no signature at all)

| Route | Returns | Status |
|---|---|---|
| `GET /health` | `{status, version, vtc_did}` | live |
| `GET /.well-known/did.jsonl` | the community's did:webvh log | live (used to learn the recipient DID) |
| `GET /v1/community/public-profile` | name, description, logo, publicUrl, contact | live |
| `GET /v1/community/did-qr.svg` | SVG QR of the community DID | live |
| `GET /v1/status-lists/{purpose}` (e.g. `revocation`) | the BitstringStatusList credential, for checking a VMC | live |
| `GET /openapi.json` | the REST surface description | source |
| `/v1/member/*` | portal session routes (above) | live for `wallet/auth/*`, `me`, `passkeys` |

## All 305 tasks served (from `trust-task-discovery/0.3`, live), by who may call them

`slug@version`, the Trust Task URI is `https://trusttasks.org/spec/<slug>/<version>` (a `vtc/` family is under that prefix too).
`unauthenticated*` means the document still has to carry a valid proof except the manifest, which a bare caller may also
read. "Returns" is each task's spec payload; the spec lives in `dtgwg-trust-tasks-tf/specs/`.

| Who | Check applied (source) | Evidence | Tasks |
|---|---|---|---|
| admin | admin ACL entry / capability (vtc.roles.assign, vtc.audit.read, vtc.policy.admin, vtc.config.admin ...) | live: member refused (or not probed: destructive) | acl/change-role@0.1, acl/change-role@0.2, acl/grant@0.2, acl/list@0.3, acl/revoke@0.2, acl/show@0.2, acl/swap-key@0.1, acl/update@0.2, audit/list@0.2, audit/verify@0.1, auth/passkey/admin-list@0.1, auth/passkey/enroll/finish@0.2, auth/passkey/enroll/invite@0.3, auth/passkey/enroll/start@0.2, auth/passkey/list@0.1, auth/passkey/revoke/finish@0.2, auth/passkey/revoke/start@0.2, auth/revoke-session@0.2, backup/abort@0.1, backup/complete-export@0.1, backup/finalize-import@0.1, backup/get-chunk@0.1, backup/initiate-export@0.1, backup/initiate-import@0.1, backup/put-chunk@0.1, config/patch@0.1, config/reload@0.1, config/restart@0.1, config/show@0.1, did-management/did/register@0.1, policy/activate@0.1, policy/active@0.1, policy/get@0.1, policy/list@0.3, policy/upsert@0.3, task-consent/decision@0.2 |
| pre-session | sign-in plumbing; authenticate then requires an ADMINISTRATOR ACL entry (auth_role_for) | live: challenge OK for member; authenticate refused 'authentication failed' for member and applicant, OK for admin | auth/authenticate@0.3, auth/challenge@0.1, auth/oob/cancel@0.1, auth/oob/claim@0.2, auth/oob/prove@0.3, auth/oob/redeem@0.2, auth/oob/request@0.2, auth/oob/respond@0.3, auth/passkey/enroll/redeem/finish@0.1, auth/passkey/enroll/redeem/start@0.1, auth/refresh@0.2, auth/step-up/approve-response@0.4, auth/step-up/approve-response@0.6, auth/step-up/approver/enroll@0.1, auth/step-up/approver/redeem/finish@0.1, auth/step-up/approver/redeem/start@0.1 |
| any ACL entry (own) | caller-scoped; empty for a member | live: sessions/list, signing-key/list, approver/list OK (empty) for member; applicant/stranger refused | auth/sessions/list@0.1, auth/signing-key/enroll@0.2, auth/signing-key/list@0.1, auth/signing-key/revoke@0.1, auth/step-up/approver/invite@0.2, auth/step-up/approver/list@0.1, auth/step-up/approver/revoke@0.1 |
| session key / console key | signer must be the key of a live ADMIN session | live: refused for member, applicant, stranger; admin OK | auth/whoami@0.1 |
| holder (signer) | resolve_holder + OID4VCI key-binding proof; the answer is PUSHED over DIDComm/TSP (off locally) | live: payload error only; no delivery path locally | credential-exchange/present@0.1, credential-exchange/request@0.1 |
| git-namespace admin / community admin (account/* any member, own link) | 'notAdministrator'/'notCommunityAdministrator' 422 for a member; account link/unlink own accounts | live: member 422 notAdministrator on lists, payload errors on the rest | git-ns/account/link-status@0.1, git-ns/account/link@0.1, git-ns/account/list@0.2, git-ns/account/unlink@0.1, git-ns/activity/list@0.3, git-ns/bridge/event@0.1, git-ns/bridge/event@0.2, git-ns/bridge/event@0.3, git-ns/bridge/event@0.4, git-ns/bridge/event@0.5, git-ns/bridge/job/list@0.4, git-ns/bridge/result@0.1, git-ns/bridge/result@0.2, git-ns/drift/resolve@0.4, git-ns/namespace/bind@0.2, git-ns/namespace/list@0.2, git-ns/namespace/reseat@0.4, git-ns/namespace/unbind@0.1, git-ns/projection/show@0.3, git-ns/repo/adopt@0.3, git-ns/repo/archive@0.3, git-ns/repo/create@0.4, git-ns/repo/list@0.2, git-ns/repo/transfer@0.3, git-ns/right/break-glass@0.2, git-ns/right/grant@0.4, git-ns/right/issued-by-departed@0.3, git-ns/right/list@0.3, git-ns/right/ratify@0.2, git-ns/right/revoke@0.4, git-ns/roles/reproject@0.2 |
| any ACL entry | projected view | live: member OK | git-ns/view@0.6 |
| admin | admin capability (vtc.policy.admin class) | not probed (mutates) | governance/capability/disable@0.1, governance/capability/enable@0.1 |
| any ACL entry | caller-visible list | live: member OK, admin OK | governance/capability/list@0.1 |
| room credential holder | authorized by the credential the room itself issued (invariant I5), never the ACL; rate-limited per address | live: member reaches handler (payload errors); no room exists locally | rooms/blobs/chunk@0.1, rooms/blobs/get@0.2, rooms/blobs/upload/abort@0.2, rooms/blobs/upload/begin@0.2, rooms/blobs/upload/chunk@0.2, rooms/blobs/upload/commit@0.2, rooms/create@0.2, rooms/epoch/chain@0.1, rooms/epoch/chain@0.2, rooms/epoch/commits@0.1, rooms/epoch/mint@0.1, rooms/epoch/prune@0.2, rooms/info@0.1, rooms/info@0.3, rooms/owner/claim@0.1, rooms/owner/transfer@0.1, rooms/records/curate@0.1, rooms/records/get@0.2, rooms/records/list@0.1, rooms/records/list@0.5, rooms/records/prune@0.2, rooms/records/put@0.1, rooms/records/put@0.2, rooms/records/put@0.3, rooms/records/retention/set@0.1, rooms/revocations/get@0.1, rooms/revocations/put@0.1, rooms/usage@0.1 |
| any signer | identified caller only (signed doc); lists the 305 served URIs | live: fresh did:key OK | trust-task-discovery@0.3 |
| admin | admin capability (surface/registry/policy/config/backup per handler) | live: member refused (or not probed: destructive) | admin/actions/acknowledge@0.3, admin/actions/cancel@0.3, admin/actions/list@0.3, admin/actions/show@0.3, admin/bootstrap@0.1, admin/events/subscribe@0.6, admin/invites/create@0.1, admin/invites/list@0.1, admin/invites/revoke@0.1, auth/admin-session@0.2, backup/export@0.1, config/did-hosting/list@0.1, config/export@0.1, config/import@0.1, install/claim/finish@0.2, install/claim/finish@0.3, install/claim/start@0.2, install/claim/start@0.3, oid4vp/identities/list@0.1, policies/test@0.1, recognition/check@0.1, registry/diagnostics@0.1, registry/records/list@0.2, registry/sync-jobs/discard@0.1, registry/sync-jobs/list@0.2, registry/sync-jobs/retry@0.2, roles/define@0.1, roles/delete@0.1, roles/list@0.1, roles/show@0.1, schemas/accepts/delete@0.1, schemas/accepts/list@0.2, schemas/accepts/register@0.2, schemas/accepts/show@0.2, schemas/delete@0.1, schemas/list@0.1, schemas/register@0.1, schemas/show@0.1, storage/configs/create@0.3, storage/configs/get@0.2, storage/configs/list@0.2, storage/configs/probe@0.1, storage/configs/retire@0.3, storage/configs/update@0.3, storage/credentials/set@0.3, vetting/auto-grant/show@0.1, vetting/auto-grant/update@0.1, vetting/revocations/list@0.1, vetting/vetters/grant@0.1, vetting/vetters/grants/list@0.1, vetting/vetters/show@0.1, website/deploy@0.1, website/files/delete@0.1, website/files/list@0.3, website/files/show@0.1, website/generations/list@0.1, website/rollback@0.1, website/upload/abort@0.1, website/upload/begin@0.1, website/upload/chunk@0.1, website/upload/commit@0.1 |
| foreign community's member (VP) | pre-session: authority is a holder-signed VP the payload carries, no ACL row | challenge: live member OK; recognise not exercised | auth/recognise@0.3, auth/recognise/challenge@0.2 |
| any ACL entry | any entry | live: member, admin OK; applicant+stranger refused | ceremonies/list@0.1 |
| any ACL entry (member or admin) | 'any entry': a live ACL row; applicant/stranger get 'the signer holds no entry in this community' | live: member OK, admin OK, applicant+stranger refused | community/branding/show@0.1, community/join-discovery/show@0.1, community/profile/show@0.1, community/requested-attributes/show@0.1 |
| admin | admin ACL entry | live: member refused | community/branding/update@0.1, community/join-discovery/update@0.1, community/profile/update@0.1, community/requested-attributes/update@0.1, community/theme/update@0.1 |
| unauthenticated* | no ACL check (public reads; applicant read of the join requirements) | live: applicant, stranger, member OK | community/theme/show@0.1, directory/disclosure@0.1, vetting/vetters/list@0.1 |
| admin | vtc.directory.admin / vtc.directory.notes | live: member refused | directory/card/assert@0.1, directory/export@0.2, directory/fields/define@0.1, directory/fields/retire@0.1, directory/fields/update@0.1, directory/notes/append@0.1, directory/notes/export@0.1, directory/notes/list@0.2 |
| active member, own card | signed by the membership DID itself (publish) / holder = member (present) | source only (payload needs a PublishedCard / presentation) | directory/card/present@0.1, directory/card/publish@0.1 |
| unauthenticated | a card its member published; no proof needed | live: notFound for an unpublished card | directory/card/public@0.1 |
| active member (entries/list, fields/list also admin) | active_member: live ACL entry not expired/suspended/application + non-removed member record. card/* only the signer's own card, never a console key. entries/show by entryId (DID addressing is admin-only); query projects by directory policy | live: member OK; admin: card/show notMember, entries OK; applicant+stranger refused | directory/card/show@0.1, directory/card/update@0.1, directory/entries/list@0.2, directory/entries/show@0.1, directory/fields/list@0.1, directory/images/upload@0.1, directory/query@0.1 |
| anyone (projected) | member/admin as entries/show; anyone else only a published external card's picture | source only | directory/images/get@0.1 |
| admin or Issuer | vtc.credentials.issue/revoke (types: admin) | live: member refused | endorsement-types/delete@0.1, endorsement-types/list@0.2, endorsement-types/register@0.1, endorsements/issue@0.1, endorsements/list@0.2, endorsements/revoke@0.1, endorsements/show@0.1 |
| group manager / admin | vtc.groups.manage (unqualified or group:<id>) or being a group manager | live: create refused for member | groups/bindings/add@0.1, groups/bindings/list@0.1, groups/bindings/remove@0.1, groups/create@0.1, groups/delete@0.1, groups/managers/add@0.1, groups/managers/remove@0.1, groups/members/add@0.1, groups/members/remove@0.1, groups/requests/decide@0.1, groups/update@0.1 |
| active member (list/show also admin) | active_member; a group the caller may not see answers notFound; members/list as the group shows members; join/leave for themselves | live: list OK (member, admin), applicant/stranger refused; create fails 'noKeyHolder' unless operator enables [groups], so join/leave/show not exercised | groups/join@0.1, groups/leave@0.1, groups/list@0.2, groups/members/list@0.2, groups/requests/list@0.2, groups/show@0.1 |
| Admin, Moderator or Issuer | vtc.invitations.manage; below Admin, own invitations only | live: member refused | invitations/deliver@0.1, invitations/issue@0.1, invitations/list@0.1, invitations/revoke@0.1 |
| admin | capability vtc.join.decide / admin ACL entry | live: member, applicant, stranger refused; admin OK (list, decide) | join-requests/decide@0.1, join-requests/list@0.2, join-requests/query@0.1, join-requests/show@0.1, join-requests/vetting/show@0.1 |
| unauthenticated* | public unless join-discovery turned off; then any signed doc | live: all 4 identities OK | join-requests/manifest@0.4 |
| signer, own request | resolve_holder (signed proof only) | live: applicant, member OK; stranger/admin notFound | join-requests/status@0.1 |
| signer (applicant/member), own request | resolve_holder: signed proof; the request's owner is the whole authority. No ACL read | live: applicant, stranger, member (submit, withdraw OK; 'notFound' when none open) | join-requests/submit@0.3, join-requests/supplement@0.1, join-requests/wallet-session/start@0.1, join-requests/wallet-session/status@0.1, join-requests/withdraw@0.1 |
| admin | vtc.members.manage / admin ACL entry | live: member refused | members/admin-remove@0.1, members/admit@0.1, members/credentials@0.1, members/list@0.2, members/make-membership@0.1, members/purge@0.1, members/removed@0.1, members/show@0.1, members/solicit-vmc@0.1, members/update@0.1 |
| member, own DID | signed by the subject (personhood), or holder reply to solicit-vmc | source only (payload errors reached the handler) | members/personhood/assert@0.2, members/personhood/challenge@0.1, members/vmc@0.1 |
| the subject or admin | signer is subject, or admin | source only | members/personhood/revoke@0.1 |
| signer's own membership | proof signer is the member (read now). self-remove takes effect at once with an EMPTY payload | live: renew OK, self-remove OK (tombstoned; re-join works); rotate not exercised | members/renew@0.1, members/rotate-challenge@0.1, members/rotate@0.1, members/self-remove@0.1 |
| admin | admin | live: member refused, admin OK | relationships/graph@0.2 |
| any current member or admin | member_tasks: any member; payload {did} | live: member OK (empty items); payload 'did' required | relationships/list@0.3 |
| the edge's issuer (publish: the signer), or admin | issuer-of-edge or admin | source only | relationships/publish@0.2, relationships/restore@0.2, relationships/revoke@0.2, relationships/suspend@0.2 |
| admin | vtc.rooms.manage / vtc.rooms.admin | live: member refused | rooms/community/create@0.4, rooms/community/get@0.3, rooms/community/list@0.3, rooms/community/members/add@0.1, rooms/community/members/list@0.1, rooms/community/members/remove@0.2, rooms/community/update@0.3, rooms/get@0.3, rooms/limits/set@0.1, rooms/list@0.2, rooms/storage/assign@0.2, rooms/storage/migrate@0.3, rooms/usage@0.1 |
| active member | active_member + being the member the offer names (needs the community's VTA room host) | live: member OK (empty items); admin notAMember | rooms/memberships/list@0.1, rooms/offers/accept@0.1, rooms/offers/list@0.2, rooms/offers/list@0.4 |
| a granted vetter | signer holds a vetter grant | live: resend notGranted (member, applicant, stranger) | vetting/revoke-statement@0.1, vetting/vetters/profile@0.1, vetting/vetters/resend@0.2 |

## Why there is no richer member session

By design, not an omission to patch (source: `acl/storage.rs`, `member_portal/mod.rs`):

1. The console session (`/v1/auth`, audience `VTC`) is for administrators; its role is "an administrator of some
   kind", and every operation then re-reads the live entry for its own capability.
2. Members get a separate, intentionally weak session (audience `VTC-member`, separate keyspaces, cookies scoped to
   `/v1/member`) whose only consumers are the portal's own `me` and passkey routes. The source says why:
   "anything a member *does* in the portal belongs on the Trust Task surface, signed by the member's own DID".
3. The member-portal delegation (`auth/oob/grant` with `signingScope`) lets a browser key sign tasks "as" the member for a
   session. That helps a human with a wallet; an app that already holds the member's did:key signs directly, so it gains nothing.

## What does not exist (do not wait for it)

- A member roster or "who is in my community" list with DIDs: `members/list` is admin-only; the directory shows
  other members by `entryId` and display fields, never their DID.
- Member-to-member messaging, chat, feeds, posts: not in the task list. Rooms (`rooms/*`) belong to the community's VTA
  room host and need credentials the room issues; locally no room exists.
- Voting/elections: not served (feature off at this pin). Vetting by members: only granted vetters.
- Receiving your membership credential over HTTP: `status` returns `credentialsDelivered:false` and no `vmc`; delivery
  goes over DIDComm/TSP, which this stack leaves off. The admin's `decide` response does contain the VMC and role VAC.
