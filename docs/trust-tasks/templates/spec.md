---
# Skeleton for specs/<slug>/<version>/spec.md in the spec repository (https://github.com/trustoverip/dtgwg-trust-tasks-tf).
# Prefer `npm run new-spec -- <slug> --category <id>` there: it writes this file with current values and it validates as generated.
# Use this copy to see the shape, or to start a private spec: change the Type URIs to your own authority.
# Every TODO is prose only the author can write. The build does not check for leftover TODOs; reviewers do.
# Replace <slug>, <Title> and the example documents. Section order matters to reviewers, not to the build.
slug: <slug>
version: "0.1"
title: "<Title>"
summary: "TODO: one sentence saying what <slug> achieves and for whom."
status: draft
targetFrameworkVersion: "0.6.0"
category: messaging
# keywords and authors are OPTIONAL, and omitted here on purpose: the build derives
# keywords from the slug segments + category, and authors from CODEOWNERS (falling
# back to this folder's git history). Declare them only where the derivation would
# be wrong — a term a searcher would use that appears nowhere in the slug, or an
# editor who is not this slug's CODEOWNER.
#   keywords: [<slug-segment>, a-term-a-searcher-would-use]
#   authors:
#     - Your Name (https://github.com/your-handle)
parties:
  - role: "TODO: the party that issues the request"
    requirement: REQUIRED
    member: issuer
    # identifierScope: pairwise   # framework 0.5.0, OPTIONAL: pairwise | public | any.
                                  # `public` says the counterparty must recognise a reusable
                                  # identifier, which forecloses pairwise identifiers for every
                                  # producer — the build warns unless the prose justifies it.
  - role: "TODO: the party that acts on it"
    requirement: REQUIRED
    member: recipient
proofRequirement:
  requirement: RECOMMENDED
  rationale: >-
    TODO: one sentence on why your threat model needs this strength. RECOMMENDED is the right default where the transport already guarantees integrity; REQUIRED commits every conforming consumer to reject a proofless document.
issuedAtRequirement:
  requirement: REQUIRED
  rationale: >-
    TODO: name what makes this task's documents worth placing in time. REQUIRED is the
    floor SPEC §7.3 item 17 sets for a consequential Trust Task (sideEffects.level: mutating) — §7.2
    item 11 can only absorb a duplicate inside a bounded window, and a document with no
    issuedAt cannot be placed in one. The build rejects anything weaker.
sideEffects:
  level: mutating
  rationale: >-
    TODO: why this level.
exposure:
  discloses: metadata
  actsAsSubject: false
  # ingests: metadata     # framework 0.5.0, OPTIONAL: what the REQUEST carries INTO the recipient
                          # (none | metadata | personal | secret). Note the enum differs from
                          # discloses — `personal` exists here because personal-but-not-secret
                          # data is exactly what changes a recipient's minimisation obligations.
                          # `personal` or `secret` makes exposure.rationale REQUIRED.
# retention:              # framework 0.5.0, OPTIONAL: how long what the recipient receives lives.
#   class: exchange       # transient (discarded in flight) | exchange (life of the session/thread/
#                         # enactment) | durable (kept beyond it, because it is a record).
#                         # An absent declaration reads as `durable`.
#   rationale: >-
#     TODO: why this class. For durable, name what makes the record worth keeping.
errorCodes: []
related: []
---

## Abstract

TODO: two or three sentences. What outcome do the two parties agree to achieve, and why does it need to be a Trust Task rather than an API call?

## Status of this Document

This specification is a **draft** ([SPEC §5.3](/SPEC.md#53-maturity-levels)). It targets framework version 0.6.0 and may change without a version bump while it remains a draft ([SPEC §5.2](/SPEC.md#52-compatibility-rules)).

## Conformance

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY** and **OPTIONAL** in this document are to be interpreted as described in [BCP 14](https://www.rfc-editor.org/info/bcp14) when, and only when, they appear in all capitals.

A conforming producer and consumer satisfy [SPEC §7.1 and §7.2](/SPEC.md#7-minimum-requirements) in addition to the requirements stated here.

## Authorization

TODO — **required**: this task is *consequential* ([SPEC §3](/SPEC.md#3-terminology)), because it declares `sideEffects.level: mutating`. [SPEC §7.3 item 15](/SPEC.md#73-specification-requirements) requires it to describe the class of authorization evidence a consumer needs.

Name the **authority**, not the pipeline step. "The consumer verifies the proof, then executes" describes a check; it never says what entitles the producer to the outcome. Write the entitlement in one sentence — ownership of the resource, a held capability, membership of the exchange named in `parties`, an accepted prior proposal, possession of a token — and say which conformance rule enforces it.

Then distinguish it from identity and proof validation: per [SPEC §7.2 item 10](/SPEC.md#72-consumer-requirements), verifying a VID, `issuer`, `recipient`, transport identity or `proof` establishes *who* and *unaltered*, never *authorized*. If this task is open to any caller, say so explicitly — that is a legitimate design and item 15 asks for it to be stated rather than inferred from silence.

Keep it descriptive: a specification **MUST NOT** declare that consent, human approval or a step-up is required. That policy belongs to the consumer.

## Definitions

TODO: define each payload member — what it means, who chooses its value, and what a consumer does with it. Members are lowerCamelCase ([SPEC §4.10](/SPEC.md#410-naming-conventions)).

## Request

TODO: one sentence naming the producer and the recipient, and pointing at the top-level schema in [`payload.schema.json`](payload.schema.json).

### TODO: what this example demonstrates

```json
{
  "id": "urn:uuid:00000000-0000-4000-8000-000000000001",
  "type": "https://trusttasks.org/spec/<slug>/<version>#request",
  "issuer": "did:example:producer",
  "recipient": "did:example:recipient",
  "issuedAt": "2026-01-01T00:00:00Z",
  "threadId": "urn:uuid:00000000-0000-4000-8000-0000000000ff",
  "payload": {
    "subject": "did:example:subject"
  }
}
```

## Response

TODO: one sentence naming the producer (the *recipient* of the request, now responding) and pointing at the sub-schema reachable via `$anchor: "response"`. Describe each payload member, and note that failures use `trust-task-error` rather than a `#response` document.

### TODO: what this example demonstrates

```json
{
  "id": "urn:uuid:00000000-0000-4000-8000-000000000002",
  "type": "https://trusttasks.org/spec/<slug>/<version>#response",
  "issuer": "did:example:recipient",
  "recipient": "did:example:producer",
  "issuedAt": "2026-01-01T00:00:01Z",
  "threadId": "urn:uuid:00000000-0000-4000-8000-0000000000ff",
  "payload": {
    "outcome": "accepted"
  }
}
```

## Security & Privacy

### Data carried

TODO: what the request and the response actually move. Name the personal or sensitive members explicitly, and say what a producer **MUST NOT** put in the free-form ones. State the smallest payload that still answers the task — this is where data minimisation gets written down.

### Correlation

TODO: what an observer, an intermediary, or the recipient can join across documents — subject identifiers, `threadId`, stable handles, request timing. Say which of those are unavoidable given the task and which a producer can vary.

### Retention

TODO: how long a recipient needs to keep what it receives, and what this document's evidentiary value implies about deleting it.

### Consent/purpose

TODO: the purpose the data is collected for and the limit on reusing it. Descriptive only — per [SPEC §7.3 item 13](/SPEC.md#73-specification-requirements) a specification **MUST NOT** declare that consent, approval or a step-up is required.
