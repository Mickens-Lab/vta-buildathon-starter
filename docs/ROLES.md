# Roles lab: practising roles, separation of duties and lifecycle

Part of the [docs index](README.md). **Guidance, opt-in, never blocking.** Nothing here stops you doing the simple thing; the helpers
warn and the defaults stay permissive. Everything in this kit is a playground ([SECURITY.md](SECURITY.md)).

Evidence labels: **live** and **source** are as in [VTC-SURFACE.md](VTC-SURFACE.md) (the table there is the one hand-maintained copy of
who can call what). **Guidance** means a design recommendation, not something this kit enforces or measured. **Unverified** means not
exercised here.

## Try it

```sh
npm run roles:matrix                                  # who can call what, four personas (read from VTC-SURFACE.md, no stack needed)
npm run roles:matrix -- --full                        # with each cell's explanation
npm run roles:personas -- create alice applicant      # a throwaway identity, key under .vta/personas/ (git-ignored)
npm run roles:personas -- create bob member
npm run roles:personas -- create root admin           # never gets an env file, so no dev server can embed its key
npm run roles:personas -- list
npm run roles:personas -- check                       # warns if one identity is both admin and applicant/member
npm run roles:personas -- clean                       # delete every persona
```

For an applicant or member persona (with a stack up), the helper also writes `.vta/personas/<name>.env`. Use it as the identity
for any script: `ENV_FILE=.vta/personas/alice.env npm run vta:provision` grants it the app ACL entry (provision reuses the identity
already in that file; source), then `ENV_FILE=.vta/personas/alice.env npm run vtc:join`. The persona files, and the
admin key in `.vta/admin.json`, stay out of git; `npm run reset` deletes `.vta/`, personas included.

The scripts warn, and continue, when the application identity is the admin key: `vtc:join` says so, and `vtc:approve` says so when
the request it approves belongs to its own signer. An admin persona is just a key: giving it an admin entry at the VTC is done by the
existing admin through the admin console or the `acl/*` tasks, and is **not automated or exercised by this kit**.

### Strict mode (opt-in)

`npm run roles:personas -- create alice applicant --strict` (or `ROLES_STRICT=1`) records a short expiry hint by default
(applicant 8 h, member 24 h, admin 1 h; override with `--expires-hours N`), and `check --strict` adds warnings: no expiry hint, expired
persona, an admin key present as a `VTA_CREDENTIAL` that a dev server would embed in a page, persona files readable by others.
These are **local hints**: the VTA and VTC are not told about them, so they do not revoke anything. To get a real expiry, grant the
entry with one (the kit's `VtaClient.grantHandoff` sets a one-hour expiry on the VTC setup entry; source) and delete entries when done.
Strict mode only adds warnings; it never blocks, and the default is permissive.

## Principles

**1. Roles are capability sets.** A role is a bundle of things an identity may do, not a label with magic in it. Render the actions
a signer can take from what you know it can do (the matrix above, the app's `whoami` capabilities), and hide or grey out the rest.
Still handle every refusal: a hidden button is a convenience, not a control (next point).

**2. UI state is a hint; the server decides.** Every VTC handler reads the signer's live records at call time (an ACL entry, the member
record, or ownership of the thing asked about); no gate trusts a claim the page made (live, VTC-SURFACE). So a badge that says "member"
can be stale: the membership may have been removed, expired or suspended since. Treat any refusal as information, show the server's
reason, and re-read.

**3. Keep identity, membership, role and credential separate.** They are four different things:
an *identity* is a key (a `did:key` here); a *membership* is the community's record that the identity belongs; a *role* is what the
community's ACL lets it do; a *credential* is a signed statement about one of those, delivered somewhere. The join status's
`credentialsDelivered` is about the other direction: it turns `true` only once the community holds the member's own membership credential
sent back (`vtc/members/vmc/0.1`; the dashboard's "Send my membership credential back"), so it reads `false` in every mode until then, even
when the pushed credential frames arrived ([MESSAGING.md](MESSAGING.md#what-credentialsdelivered-means)); the membership is still real. Do not infer one from another, and do not use "I hold a key" to mean "I am a member".

**4. One key per persona.** Practise with a separate key for the visitor, the applicant, the member and the admin. Mixing them hides
exactly the failures this lab is for: an admin key that also applies will always "work". The admin key should never be in a browser
bundle; the kit's pages embed the app key (a dev-only choice, see [SECURITY.md](SECURITY.md)), so never point `VTA_CREDENTIAL` at
the admin key.

**5. Separation of duties.** The one who applies should not be the one who approves, and the one who approves should not be able to
quietly grant themselves more. The kit does not enforce this (an admin key can approve any request, including its own: guidance
to avoid it; whether the VTC refuses a self-approval was **not tested**). The persona helper's warning is the nudge; a real
community would back it with two admins or a policy.

**6. Contexts and optional expiry.** An ACL entry is scoped to a context (`my-app` by default), so one app's identity should not be
able to touch another's data. Entries and sessions can carry an expiry; short-lived grants limit the blast radius of a leaked key. This
is a flag you choose, not a default of the kit (source for the expiry field; use is **unverified** beyond the setup entry).

**7. Pairwise identifiers and directory entry IDs: do not correlate members by DID.** A member's `did:key` is a stable identifier
that every community and app it uses will see; reusing it links your activity. The VTC itself helps: the directory shows other
members by `entryId` and display fields, never by DID, and addressing a member by DID is administrators' only (live, VTC-SURFACE).
In your own app, key your records on the `entryId` (or a per-community identifier you issue), keep DIDs out of logs and
URLs, and use a different identity per community where you can. (Pairwise-by-default identity generation is guidance; this kit
creates one `did:key` per app and does not do it for you.)

**8. Lifecycle states.** A join request is `pending`, `deferred`, `approved`, `rejected` or `withdrawn` ([VTC.md](VTC.md)). A person
moves through: **apply**, **withdraw** (an applicant's own open request), **approved** (member), **renew** (`members/renew`), **leave**
(`members/self-remove`: immediate, an empty payload suffices) and **re-apply** (the same DID applied again after leaving and was
approved again; live). Design each as a first-class screen with its own refusal cases (a member who applies a second time creates a
second open request that `decide` then refuses as a duplicate; live). Make leave a confirmed action: it is immediate.

**9. Re-read live state; do not cache it.** The VTC is the source of truth. After an action, read again instead of assuming the
result; on a tab refocus, read again; do not persist "I am a member" locally. If you must remember a request id (the dashboard does,
in `localStorage`), treat it as a hint: calling `join-requests/status` with no id can return an older approved request after a newer
one was withdrawn (an upstream quirk observed in earlier runs of this kit; **not re-verified** for this document), so pass the id you hold and let
the server contradict you.

## Checklist for an app that has roles

- [ ] Actions rendered from capabilities, and every call still handles a refusal.
- [ ] No role, membership or "is admin" value stored as truth in the browser; state re-read after every action and on refocus.
- [ ] A different key per persona; no admin key in any bundle, `.env` read by a dev server, or log.
- [ ] Applying and approving are different identities.
- [ ] Records keyed on directory `entryId` (or your own pairwise id), not on DIDs.
- [ ] Leave, withdraw, renew and re-apply all have a screen and a refusal path.
- [ ] Grants have a context and, where you can, an expiry.
