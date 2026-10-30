# Security: what this playground is not, and the way up

**This kit is for demos and testing only.** It is built to make a first signed Trust Task easy, not to protect anything.
Treat every key, DID and community it creates as disposable.

## Where every secret lives

| What | Where | Why it matters |
|---|---|---|
| Admin private key | `.vta/admin.json` (mode 0600), public DID in `.vta/admin.env` | Super-admin of the local VTA and the setup identity of the local VTC. Plaintext. |
| App credential (contains the app's private key) | `.env` as `VTA_CREDENTIAL` (mode 0600) | Lets anyone holding it act as your app. Plaintext. |
| VTA seed (all keys the VTA derives) | A plaintext file on the container volume `vta-data` (`[secrets] backend = "plaintext"` in `vta-entrypoint.sh`; `vta:call -- vta/health/details/0.1` reports `storageEncrypted: false`) | Anyone with Docker access to the volume has every key the VTA holds. |
| The app key in the browser | `web-vta-app` and `community-dashboard` read `VTA_CREDENTIAL` at dev time and embed it in the page; a `vite build` bundles it into `dist/` | Anyone who can load the page, or read the bundle, can act as the app. Both pages say so in a banner. |
| Transport and DIDs | Plain `http`, `localhost` DIDs, `VTA_ALLOW_PRIVATE_ENDPOINTS=1` | No TLS, and the DID is only meaningful on your machine. |
| Access control | One admin, one app role, a context | No real access policy, no key rotation, no backup, no audit review. |
| CORS | Exact origins `localhost:3000`, `:5173`, `:8000` | Dev only; do not widen it for a deployed page. |

## Tunnel mode widens the exposure

`MODE=tunnel` ([MODES.md](MODES.md)) puts the VTA, VTC and a messaging mediator on public, unauthenticated Cloudflare quick-tunnel URLs, and the
mediator is **open** (any DID may register and relay). Treat it as a demo you switch on while you need it: demo data only, keys are plaintext
on the volumes, and `MODE=tunnel npm run down` when you finish. MODES.md lists the log and setup-output hazards (the mediator setup prints an
admin private key; the VTC logs an install URL with a token).

## What not to do

- Do not reuse any key from `.vta/` or `.env`, anywhere, ever.
- Do not deploy the output of `vite build` or the dev servers: the key is inside.
- Do not commit `.env`, `.env.*` or `.vta/` (they are git-ignored; keep it that way).
- Do not point this kit, or its credentials, at a production VTA, VTC or community. Use `npm run vta:reset` to throw everything away.
- Do not paste a `VTA_CREDENTIAL`, an admin key or a seed into chats, tickets or screenshots.

The scripts that create keys (`npm run up`, `vta:keygen`, `vta:provision`) print a one-line `DEV ONLY` reminder; set `QUIET=1` or `CI=1` to silence it.

## Hardening ladder

Each rung is guidance for moving past the playground. Statements about what a VTA does are marked **(unverified)** unless this kit exercised them. The *Evidence* lines under L3 to L5 come from a source and docs review of the VTA (0.65.0) and VTC (0.15.0), **not** from running them here; they keep that review's tags: **[V]** read in source, **[D]** stated in docs only, **[I]** inferred. Nothing tagged [V], [D] or [I] was exercised by this kit.

**L0. Playground (today).** Plaintext keys, key in the page, http, localhost. Fine for learning; nothing else.

**L1. Keys in a backend, not the page.** Keep the app key on a server you control and have the page call that server, which signs with `VtaClient`
(the README's `vta.call` snippet works unchanged in Node). The browser then holds, at most, a session to your own backend. Store the key in the server's
secret store, never in the repository or the bundle. Recipe: [`scripts/recipes/backend-signer.ts`](../scripts/recipes/backend-signer.ts) (`npm run recipe:backend-signer`) is a small server that holds `VTA_CREDENTIAL`, allows exact origins and an allow-list of tasks, and passes refusals through; its handler is unit-tested with a fake client, and it was **not run against a live VTA** in this change. A design review suggests a server-side signer as the first step **[I]**.

**L2. A non-extractable browser key.** Generate a WebCrypto key with `extractable: false`, derive its public key, make a `did:key` from it, and have an admin
grant that DID an ACL entry from the CLI (`VtaClient.grantAcl`). The page can sign but cannot export the key. Caveat: a script running in the page can still
ask it to sign, so protect the page against injected code (strict CSP, no third-party scripts). Check that your WebCrypto build supports Ed25519 before relying on it: Node 22 does (tested here), browsers vary and are **unverified in this kit**. Recipe: [`scripts/recipes/webcrypto-key.ts`](../scripts/recipes/webcrypto-key.ts) (`npm run recipe:webcrypto-key`) generates the key and its `did:key`. It does **not** plug into `VtaClient`: the kit's signer is synchronous and WebCrypto signing is async, so wiring needs an async signer path that does not exist yet.

**L3. Least privilege.** Use one context per app, the narrowest role and capabilities, short-lived entries and sessions, and rotate keys on a schedule. Where the VTA can
hold the signing key itself, call its signing tasks instead of holding the key in your app (the app's `whoami` lists capabilities such as `sign`, `sign-document` and
`sign-trust-task`; what each does and how it is scoped is **unverified**). Delete the ACL entry when the app is retired.

*Evidence (design review):* `vault/sign-trust-task` has the VTA sign an envelope as a vault entry's principal DID, so the key stays in the VTA **[V]**. See [ROLES.md](ROLES.md) for contexts and expiry.

**L4. A human in the loop.** Passkeys authenticate a human to a service; they are **not** usable to sign Trust Task documents (those need an Ed25519 DID key). Use a
wallet or browser extension that asks the person to consent before each signature. The VTA serves approval and step-up tasks (`auth/step-up/*` appear in its discovery list)
and has policy features. [APPROVALS.md](APPROVALS.md) runs a consent rule end to end with a software approver, and [MOBILE-WALLET.md](MOBILE-WALLET.md) says what a phone would add and what was not checked.

*Evidence (design review):* a passkey proves presence at login or step-up and does not sign Trust Task documents (those need an `eddsa-jcs-2022` or `ecdsa-jcs-2019` proof) **[V]**. Approvals are rules keyed by task type, either re-authentication or consent by named approvers bound to the exact payload, and are **off by default**: they need `policy.enforcement = true`, which this kit's `vta-entrypoint.sh` sets only for the approvals demo (`npm run approvals:setup`); the default stack leaves it off **[V]**. The `auth/oob` step-up purpose is reserved, not defined **[V]**.

**L5. Production custody.** Keep secrets in a protected backend (cloud KMS or an HSM), use the OS keychain on user devices, prefer attested or hardware-backed keys, and let
a mobile wallet hold the user's identity.

*Evidence (design review):* the VTA's secrets backends include an OS keyring, an encrypted file and cloud or cluster stores **[V]**; this kit uses `plaintext`. The VTA stores a device's hardware-attestation evidence but does **not** verify it in 0.65.0 **[V]**; the wallet we reviewed holds its approval key in software, so a compromised phone would compromise its approvals (other wallets may differ) **[V]**; no Trust Task or ACL entry uses an attested key today **[D]**. Hardware-backed keys for Trust Tasks are therefore a goal, not a current capability.

Secrets backends are independent of any phone and a cheap next step for the VTA seed, but how to configure them is **unverified** here. Use TLS everywhere, real DIDs on real domains, backups and restore drills, audit review, and an incident plan.

## Before you build something real

- [ ] No key, seed or credential in the repository, the bundle, logs or screenshots.
- [ ] Keys live in a secrets backend or hardware, with rotation and a revoke path.
- [ ] The browser never holds an extractable key; humans consent to what is signed in their name.
- [ ] TLS, real DIDs and exact CORS origins; no `VTA_ALLOW_PRIVATE_ENDPOINTS`.
- [ ] Each app has its own context, least-privilege role and an expiry.
- [ ] You authorise senders against the ACL, not only the proof ([inbox-verifier README](../templates/inbox-verifier/README.md)).
- [ ] Replay protection backed by shared storage, not memory.
- [ ] Backups, monitoring and an owner for each key.

## Check yourself

- **Key custody card.** The [status panel](../packages/status-panel/README.md) has a card, "8. Key custody": where the app key lives, which level above that is, and the next step. It only reports what the page can know (the kit's pages embed the key, so they show L0).
- **`npm run security:check`** scans a tree (default `.`; `-- --root <dir>`) for: `.env*` and `.vta/` files readable by group or others, a credential or private key inside built output (`dist/`, `build/`), a plaintext secrets backend (a warning in the playground, because the local stack uses one), a CORS allow-list that admits `*`, and key files that git would not ignore. It never prints a secret, exits 1 on an error, and with `-- --production` also fails on warnings. A clean result is hygiene, not safety: it does not check your code, dependencies, TLS or the VTA's own configuration.
- Roles and separation of duties: [ROLES.md](ROLES.md).
