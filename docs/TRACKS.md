# Track ideas

Part of the [docs index](README.md). Hands-on first: [TRY-THIS.md](TRY-THIS.md); security limits: [SECURITY.md](SECURITY.md).

Pick one, or invent your own. Every track needs a working Trust Task round trip
first (see the rubric in [EVENT.md](EVENT.md)).

| # | Track | Template | Idea |
|---|---|---|---|
| 1 | Sign in with VTA | `web-vta-app` (partial) | A site that signs a user in with a VTA or wallet DID, no password. Verify the signed login server-side, then show the user's role from the VTA ACL. |
| 2 | Inbox / verifier | `inbox-verifier` | A service that accepts signed documents from strangers: notes, bug reports, orders. Show it rejecting tampering, wrong recipients and replays. |
| 3 | Signed-everything service | none (start from `inbox-verifier`) | An API where every request and response is a signed Trust Task, with an audit log you can replay and check. |
| 4 | AI agent with a VTA | `mcp-agent` (stub) | An agent with its own context-scoped identity. It can read and sign within its scope; a human approves anything bigger. |
| 5 | Community dashboard | `community-dashboard` (needs a VTC) or `web-vta-app` | A page over one context: members (ACL), recent activity, supported tasks. With a VTC: the join manifest, join requests, status, member sign-in. Read-mostly; polish the story. |
| 6 | Credential showcase | none | Issue and present a credential tied to a VTA identity, and show a verifier accepting it. Check the registry (`credentials/*`, `credential-exchange/*`) with `vta.discover()` for what your VTA serves. |

## Notes per track

1. The wallet branch in `web-vta-app` shows `walletProfile` and `signTrustTask`.
   Login (`login`, `proxyLogin`) is in `bridge-protocol.ts` of the browser plugin;
   no template covers it.
2. Add a real task: change `NOTE_TYPE`, the schema and the handler. Authorize
   senders against your VTA ACL, not just the proof.
3. Reuse `createInbox`'s pipeline for each route; keep a signed append-only log.
4. `mcp-agent` is a stub. The TypeScript fallback in its README is the safer plan.
5. The VTA has audit, consent and policy features: showing one scores on the
   "real VTA feature" criterion. Discover them with `npm run hello` and `vta.discover()`.
6. Not templated: expect to read the task schemas yourself.
