# Community dashboard

A React + TypeScript (Vite) app for one person's journey with a Verifiable Trust Community: visit, apply, wait for a
decision, be a member, leave or re-apply. It signs everything with the app identity from your own generated
credential (`VTA_CREDENTIAL`, as in `web-vta-app`) and talks to the community named by `VTC_URL` / `VTC_DID`.
There is **no session**: a plain member cannot `auth/authenticate`, so every fact comes from a signed Trust Task
(see [../../docs/VTC-SURFACE.md](../../docs/VTC-SURFACE.md) and [../../docs/VTC.md](../../docs/VTC.md)).

```sh
npm run up                                       # repo root; WITH_VTC=1 for a local VTC (or MODE=farm)
npm run dev -w @buildathon/community-dashboard    # http://localhost:5173, or the port Vite reports (any port works: /__vta and /__vtc are proxied)
npm run vtc:approve                              # local: approve the pending request; the page notices within 10 s
npm test -w @buildathon/community-dashboard      # pure modules, polling helper, and component tests (jsdom, fake community)
npm run e2e                                      # repo root, optional: real headless Chromium against the local stack
```

## What you see

Top bar: community name (its short DID if it has no name), your short app `did:key`, a status badge, and a
connection dot that opens the status panel as a drawer. Under it, a journey strip (Visit, Apply, In review, Member)
and the screen for your state. The collapsible **Under the hood** panel lists the last 20 Trust Task calls
(type and version, who signed, outcome, duration) with *View signed request* and *Copy as TypeScript*.
Every action ends in a toast; a refusal is explained in plain words with its code.

Markers: **verified** = seen working against the local stack (VTC 0.15.0, VTA 0.65.0, headless Chromium);
**inferred** = worked out from the spec or source, not seen; **unverified** = the path is built but not tried.

| State | How it is detected (signed calls only) | Screen | Marker |
|---|---|---|---|
| Visitor | `join-requests/status` answers `notFound`, nothing remembered | Public profile, *How to join* (criteria; ones needing an invitation, credentials or vetting are greyed with the reason), *Apply to join* with a preview of the request before it is signed | verified |
| Pending | status `pending` | Summary, timeline, automatic check every 10 s with Pause (and *Refresh status* above it), *Withdraw* with confirmation; local hint to run `npm run vtc:approve` | verified |
| Member | status `approved` **and** a member-only read (`community/profile/show`) succeeds | Membership card (role, joined, community from `/v1/member/me`), *Prove I am a member*, tabs Community / Directory / My card / Account | verified |
| Withdrawn | status `withdrawn` | What happened, *Re-apply* | verified |
| Left | status `approved` but the member-only read is refused | Same, *Re-apply* | verified that this is what the VTC returns after leaving; the word "left" is inferred (removal looks the same) |
| Left (request gone) | `notFound` after this browser remembers a request | Same | inferred |
| Rejected | status `rejected` | Same | inferred |
| Deferred | status `deferred`: shown as in review | Pending screen | inferred |
| Needs more information | status naming more info or evidence | Pending screen plus *Add more information* (paste a presentation; `supplement` is the only path) | inferred and **unverified** |
| Any other status | unknown value | Generic "Status: X" screen, request kept | inferred |
| Error | network failure or an unexpected refusal | Plain explanation and *Try again* | verified (community unreachable) |

Member tabs: **Community** (profile; groups list, with a note that groups are off when it is empty; verified empty at this
version), **Directory** (browse by entry id, projected fields, DIDs removed from what is shown; the fields shown depend on the
community's policy), **My card** (view, and edit through `updateMyCard` with `expectedRevision`), **Account** (renew; leave in a
danger zone that needs you to type `leave` and then confirm). All verified live.

Things the live run taught (kept in the code comments too):

- `join-requests/status` with no request id returned an older **approved** request after a newer one was withdrawn. The
  page therefore asks about the request id it remembers (in `localStorage`, per app identity) and only falls back to "latest"
  when the VTC does not know that id. A different browser with the same key does not know the id, so it can see
  "Left" instead of "Withdrawn".
- A refusal for "not a member" is `HTTP 403 permissionDenied` on community reads and `422 ...:notMember` on the card.
- Status polling at 10 s stays well under the anonymous per-address limit (burst 10, then one per 5 s); a failed poll backs
  off (doubling up to 60 s) and polling pauses while the tab is hidden.

## The community is the database

The page keeps no authoritative copy of anything: the VTC (and the VTA behind it) is the source of truth, and the page is a
window onto it that can be out of date. What that means in the UI (all **verified** by the component tests and the browser
run unless marked):

- **As-of line.** Every panel says `As of 14:03:22, from vtc/community/profile/show, 8 ms`, taken from the newest matching
  entry of the **Under the hood** call log when the read finished, so the claim is what the community actually answered.
- **Refresh.** A *Refresh status* button above the screen for visitor, pending, ended and error states, a *Refresh* on each
  member panel, and *Refresh all* in the top bar. They share a cooldown: 1 s for a member, 5 s when the signer is probably
  anonymous (visitor, applicant, someone who left), because of the community's admission budgets (a signer with no ACL entry:
  burst 10, then one per 5 s per address; a known signer: burst 60, then one per 500 ms; the applicant case is **inferred**).
  A refresh keeps the old data on screen until the new answer arrives.
- **No optimistic updates.** After every action (apply, withdraw, renew, leave, save card, prove) the page re-reads from the
  community and shows what it read, never what it just sent. A refusal re-reads too (the records probably differ from what the
  page showed); a dead network does not.
- **Return to the tab.** Coming back to the tab (visibility or focus), debounced 400 ms, re-reads if the last read is at least
  15 s old and no cooldown is running. The pending poll (10 s) still runs on top and skips ticks while paused or hidden; a pause
  lasts for one open request.
- **The membership card is special.** It comes from the member portal (`GET /v1/member/me` after a challenge and a sign-in:
  three plain REST calls). Live, those routes were rate-limited like anonymous callers even for a member (HTTP 429, burst 10
  then one per 5 s). So *Refresh all* skips the card; the card has its own *Refresh* with the 5 s cooldown.
- **Local hint.** The request id this browser remembers (`localStorage`, per app identity) is labelled as a hint, never as the
  record. It is used to ask about the right request (an upstream quirk: `join-requests/status` with no id can answer with an
  older approved request after a newer one was withdrawn). *Forget local hints* removes it and re-reads; without it, a person
  who left shows as "Left" (approved but refused the member check) instead of the browser-only "request gone" inference.
- **Rate limit screen.** A 429 shows "The community asked for a pause", not "Cannot reach the community".

## Tests

- `npm test -w @buildathon/community-dashboard`: node:test for the pure modules (`test/*.test.ts`), then Vitest + Testing
  Library (`test/ui/`, jsdom) against a fake community (`test/ui/fake.ts`) behind the real `VtcClient` interface. They cover each
  state screen, refusals and toasts, the journey strip, Refresh and the as-of lines, cooldown, focus refresh, local hints,
  StrictMode (no repeated state-changing call; shared mount reads) and poller/listener cleanup on unmount. No Docker, no network.
- `npm run e2e` (repo root, optional, **not** in `npm test`): the same journey in a real headless Chromium against the local stack.
  Needs Docker (`WITH_VTC=1 npm run up`), Chromium or Chrome (`CHROME=/path` to choose), Node 22 and port 3000 free.
  It takes about 3 minutes because it waits for the anonymous rate budget. `--shots <dir>` saves a screenshot per step.
  Clicks are done in the page (`element.click()`): a headless Chromium froze on synthesised mouse input in an earlier session.
- `npm run test:roles` (repo root, optional): see [../../docs/VTC-SURFACE.md](../../docs/VTC-SURFACE.md).

## How it is built

Pure, framework-free modules (unit-tested, no DOM, no network): `src/state.ts` (`deriveState`, journey step),
`src/criteria.ts` (which join criteria are usable and why not), `src/format.ts` (DID, date and duration formatting,
refusal wording, DID stripping, TypeScript snippets), `src/poll.ts` (a non-overlapping poller and an in-flight de-duplicator),
`src/store.ts`, `src/refresh.ts` (cooldown, debounce, epoch, as-of text). Thin glue: `src/client.ts` (the single `VtcClient`, call log, error wording), `src/probe.ts`,
`src/hooks.ts` (`useDashboard`, `useLoad`, `useCallLog`). React components live in `src/components/` and `src/App.tsx`.
The call log uses the optional `onCall` hook on `VtcClient` (`packages/vtc-client`); the status panel is the
framework-free `@buildathon/status-panel`, mounted by a small wrapper component (`useEffect` that mounts and destroys it).

**Why React here.** The dashboard has many screens that change with state, tabs, a live log and toasts; React keeps that
readable. `web-vta-app` and `status-panel` stay framework-free, and so do the clients and the logic in `packages/*`: to
reuse them from Vue, Svelte or anything else, import `VtcClient` and the pure modules and subscribe to `onCall` and
`createPoller` from your own lifecycle hooks. The React versions are pinned exactly in `pins.json` (React 18.3.1: the
last 18 line, which `@vitejs/plugin-react` 4.7.0 and the pinned Vite 5.4.21 support; React 19 would add nothing here).

**StrictMode.** `main.tsx` keeps `<StrictMode>`, which runs effects twice in development. Calls that change anything
(apply, withdraw, renew, leave, edit card, add information) run only from event handlers (`actions.run` in `App.tsx`).
Reads that effects start share one in-flight request per key (`inflight`), the poller never fires immediately and is
stopped by the effect cleanup, and the status-panel wrapper defers its mount a tick. Check, with the VTC running and a pending
request: open the page, wait 35 s, and compare the **Under the hood** log with `docker compose logs vtc`: one `status` and
one `manifest` on load, then one `status` per 10 s, and the same number of `join-requests/status poll answered` lines in the
VTC log (measured: 4 and 4; `test/poll.test.ts` covers the cleanup and de-duplication).

## Status of verification

Typecheck, unit and component tests and `vite build` pass. The full journey was driven in headless Chromium against the local stack
on 2026-10-29 (and again, scripted, as `npm run e2e`, with the refresh features): visit, apply (preview then sign), pending with polling, approval with `vtc:approve`, member screens,
edit card, renew, leave, re-apply, withdraw, re-apply screen, error state, light and dark, phone width. Not tried: the
farm community, *Add more information*, a community with a named profile, logo or groups.

## Next

Not in this MVP: a persona switcher (several identities), an admin inbox (decide requests in the page), publishing a
card beyond the community, and the supplement success path.
