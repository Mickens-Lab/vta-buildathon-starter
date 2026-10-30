# Trust Task fitness scorecard

Copy this file next to the code that uses the task. Fill it in from the spec's front matter and prose
([05 Evaluating tasks](../05-evaluating-tasks.md), part A). Score: **2** good, **1** acceptable with a mitigation, **0** blocker.

| | |
|---|---|
| Task (Type URI, exact version) | |
| Evaluated by / date | |
| Spec status and last change (`git log` on its folder) | |
| Intended use in our app | |
| Target deployment(s) and whether discovery lists it | |

| # | Criterion | Finding (quote the spec) | Score | Mitigation or note |
|---|---|---|---|---|
| 1 | Status and maturity (draft? successor? two implementations?) | | | |
| 2 | Parties: our role is issuer / recipient; identifier scope fits | | | |
| 3 | Side effects (`sideEffects.level`); is it consequential? | | | |
| 4 | Exposure (`discloses`, `ingests`, `actsAsSubject`); data we will send | | | |
| 5 | Proof requirement (request / response) vs our transport and need to retain | | | |
| 6 | Freshness (`issuedAt`), size bound, replay and idempotency behaviour | | | |
| 7 | Authorization: what entitles our app; is our role enough | | | |
| 8 | Extension points (`extends`, `ext`); how we handle later minors | | | |
| 9 | Error model: codes we handle, retry semantics, leakage | | | |
| 10 | Interop evidence: examples, invalid examples, second implementation, vectors | | | |
| 11 | Retention of what we send (`retention.class`) vs our policy | | | |
| 12 | Tested here: schema, signature, replay, wrong-recipient, live call | | | |

**Total** ___ / 24. Any **0** in rows 3, 5, 6 or 7 on a consequential task blocks adoption.

**Decision:** [ ] adopt  [ ] adopt with mitigations  [ ] do not adopt

**Pinned version and re-check trigger** (for example "re-score when a newer minor or a `supersededBy` appears"):

**Security checklist** (05 part C) completed: [ ] yes  [ ] n/a, reason:
