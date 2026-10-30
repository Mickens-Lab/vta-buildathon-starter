# Working with Trust Tasks

Part of the [docs index](../README.md); hands-on exercises: [TRY-THIS.md](../TRY-THIS.md).

How to find, use, develop and evaluate Trust Tasks with this starter. Everything the VTA and VTC do over
HTTP is a Trust Task, so these pages are the background for every track.

- Registry and specifications: <https://trusttasks.org> (browse at <https://trusttasks.org/registry>)
- Spec repository (specs, framework text, libraries, build tooling): <https://github.com/trustoverip/dtgwg-trust-tasks-tf>
- Framework specification ("SPEC" below): <https://trusttasks.org/SPEC>

## Reading order

| Read | When |
|---|---|
| [01 Concepts](01-concepts.md) | First. The envelope, requests and responses, versions, proofs, side effects. 10 minutes. |
| [02 Finding tasks](02-finding-tasks.md) | You need a task for a job: search, read a spec, decide use / extend / propose. |
| [03 Using tasks](03-using-tasks.md) | You are calling a VTA or VTC, or receiving signed documents. Copy-paste TypeScript. |
| [04 Developing tasks](04-developing-tasks.md) | You need a task that does not exist. Authoring, plus a hands-on "note" task wired into a handler and test. |
| [05 Evaluating tasks](05-evaluating-tasks.md) | Is this task fit for my use? Is my implementation right? Security and spec-PR checklists. |
| [06 Troubleshooting and glossary](06-troubleshooting-and-glossary.md) | An error you do not recognise, or a term you do not know. |

Templates to copy: [`templates/spec.md`](templates/spec.md), [`templates/payload.schema.json`](templates/payload.schema.json),
[`templates/scorecard.md`](templates/scorecard.md).

## Legend: how each claim was checked

| Mark | Meaning |
|---|---|
| **[run]** | Executed while writing these pages (commands, tests, HTTP requests, typechecks) |
| **[src]** | Read from the spec repository or this starter's source; not executed |
| **[untested]** | Documented upstream, not run here. Treat as a starting point |
| **[draft]** | A design proposal upstream, not an implemented feature |

Checked against: framework SPEC 1.0 working draft 0.7.0 (a draft, not a ratified standard); `@openvtc/trust-tasks`
0.28.1 and `@openvtc/trust-tasks-proof` 0.1.6 as pinned by this starter; the live registry as of 2026-10-29
(1140 task versions: 1074 `draft`, 66 `retired`, none `candidate` or `standard` yet **[run]**).

## Status of this section

These pages describe the framework as of the dates above. The specs are drafts and move. When a page and a spec
disagree, the spec wins: open the Type URI.
