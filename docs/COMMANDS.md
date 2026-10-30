# All commands

Part of the [docs index](README.md). Every root `npm run` script, grouped by who needs it. Any script prints its own usage with `--help`
(`npm run hello -- --help`). The groups are a naming convention in this page rather than a prefix in the script names, so older notes and
muscle memory keep working; a test fails if a script is missing from this page.

## Everyday (hour one)

| Command | Does |
|---|---|
| `npm run doctor` | Is this machine ready: Node, Docker, memory, ports, images (with the exact build command), VTI checkout, mode. `up` runs the blocking checks first |
| `npm run up` | Start the stack for the current mode (keys, VTA, optional VTC, an app context and credential in `.env`) |
| `npm run down` | Stop it and keep the data (tunnel mode: also deletes its volumes, which cannot be reused) |
| `npm run reset` | Stop everything (tunnels too), delete volumes and `.vta/`, remove the keys the kit wrote to `.env`. Works in every mode; lines you added to `.env` stay |
| `npm run hello` | The checkpoint: discover, authenticate, one signed call |
| `npm run new -- my-app --from hello-web\|hello-node` | Copy a minimal template to `apps/my-app` (git-ignored) and install it; prints the command that runs it. `npm run new` lists the starting points |
| `npm run vta:call -- <task> [json]` | Call any Trust Task as your app identity (no argument lists them; invalid JSON is reported, not a stack trace) |
| `npm run vta:call -- --search memory` / `--schema vta/memory/put/0.1` | Only the tasks whose name contains a word / a task's request and response fields (offline, from the bindings in `node_modules`) |
| `TRACE=1 <command>` then `npm run trace` | Record every client call (VTA and VTC REST, TSP ping) to `.vta/trace.jsonl`, then show them one per line: time, client, task, outcome, ms, who to whom, id. `-- --follow` keeps printing, `--json` for raw, `--clear` deletes. Payloads and keys are never logged |
| `npm run repl` | A Node REPL with `vta` (authenticated), `vtc`, `call(slug, payload)`, `tasks(words)` and top-level await |
| `npm run vtc:hello` / `vtc:join` / `vtc:approve` / `vtc:status` | Community: read the join manifest / apply / admin approves / where do I stand |
| `npm run tsp:ping` / `tsp:listen` | `MODE=tunnel`: TSP ping and pong / receive the credential frames the VTC pushes |

## Community (VTC), more

`vtc:profile` (what a member can read), `vtc:withdraw` (withdraw the open request), `vtc:leave -- --yes`, `vtc:refusals` (the same calls as a stranger and as you).

## Roles, approvals, security

`roles:matrix`, `roles:personas -- create <name> <role>` ([ROLES.md](ROLES.md)); `approvals:setup`, `approvals:demo`, `approver` ([APPROVALS.md](APPROVALS.md));
`security:check`, `recipe:backend-signer`, `recipe:webcrypto-key` ([SECURITY.md](SECURITY.md)).

## Plumbing (called by `up`, rarely by hand)

`vta:keygen` (mint the admin key), `vta:provision -- <context>` (a new context and app identity; `ENV_FILE=.env.x` keeps several), `vtc:up` (VTC hand-off),
`vta:logs` (follow the VTA log), `tunnel:probe` (re-run the tunnel checks).

## Organiser

`images:build [vta|vtc|mediator|all]`, `pins:check` ([PINS.md](PINS.md)); `farm:setup`, `farm:check`, `farm:probe`, `farm:canary` ([FARM.md](FARM.md), [EVENT.md](EVENT.md)).

## Maintainer

`typecheck`, `test`, `check:generic` (`-- --history` also scans commits; without a `.git` folder, such as a ZIP download, it scans the files and skips the history), `check:docs`, and the live tests `test:roles`, `e2e`, `tsp:ping:browser`
(need a running stack and, for the last two, Chromium; not part of `npm test`).

## Old names (aliases)

`vta:up` is `up`, `vta:down` is `down`, `vta:reset` is `reset`.
