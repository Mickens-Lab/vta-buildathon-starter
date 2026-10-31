// Phrases that were true once and are now wrong. check:docs fails when a markdown file still says one of them,
// so a fix that landed in one doc cannot silently survive in another. Add a rule when a statement goes stale.
// Historical records (PINS_LOG.md, and lines that say "earlier"/"older"/"first pin" about a past failure) are exempt, except
// from a `strict` rule (the stale lines themselves said "verified failure").

export interface StaleRule {
  /** What is wrong with the phrase, and what is true now. */
  why: string;
  re: RegExp;
  /** Applies only while pins.json images.available is this (true: prebuilt images can be pulled; false: they cannot). Default: always. */
  only?: "available" | "unavailable";
  /** A line that also matches this is a statement about the future or about the absence, and is allowed. */
  unless?: RegExp;
  /** The general history exemption (earlier, older, verified failure, ...) does not apply: the stale lines themselves used those words. */
  strict?: boolean;
}

/** Said of the tunnel-mode did:peer applicant before the mediator got a short did:webvh (2026-10-30): it now works and is the default. */
const PEER_BLOCKED = /blocked by the mediator's DID size|a-didpeer2-applicant-blocked|(?:does not work|stops at once|blocked)[^\n]{0,80}(?:this kit's (?:did:peer )?mediator|DID size|1000-byte)|this kit's did:peer mediator|opt-in (?:`?did:peer(?::2)?`? )?applicant|the did:key stays the default|`?--did-peer`?|mediator's DID \(did:peer:2|mediator setup mints a `?did:peer/i;

/** Said of prebuilt images in the present tense as if participants could pull them. */
const PREBUILT_DEFAULT = /prebuilt images? (?:are|is) the default|prebuilt by default|by default[^.\n]{0,60}prebuilt|prebuilt[^.\n]{0,40}by default|pulls? (?:the )?(?:prebuilt )?images? by default|pull by default|pulled by default|local builds? (?:is|are) the fallback|build(?:ing)? locally (?:is|as) the fallback|images:pull`? first|pulls them for you|pulled, else local|participants (?:can|just) pull|publish the pinned images, then check a clean laptop pulls/i;
const FUTURE_OR_ABSENT = /not (?:yet |generally )?available|unavailable|images\.available|future|later|once (?:the )?packages|when (?:the )?packages|if (?:the )?(?:organisation|packages)|would|used to|no longer/i;

export const STALE_RULES: StaleRule[] = [
  { why: "the TSP pong comes back since the mediator 0.45.0 pin (Stage H)", re: /pong does not come back|no pong (?:ever )?comes back|the mediator pin refuses TSP 1\.0/i },
  { why: "the TSP round trip is verified (Stage H); only DIDComm is not", re: /not verified:[^\n]*(?:TSP round trip|the pong is refused)/i },
  { why: "prebuilt images from ghcr.io/mickens-lab are the default and a local build is the fallback (docs/PINS.md#where-the-images-come-from); applies once images.available is true", only: "available", re: /no images are published|there is no\s+published image|everyone builds (?:them )?locally|an organiser (?:usually|normally) (?:hands|supplies)|nobody should build/i },
  { why: "tunnel mode applies as a did:peer:2 naming the mediator's short did:webvh by default, and the credential reaches it (verified); --did-peer is gone, VTC_APPLICANT=did:key is the override (docs/MESSAGING.md#tunnel-mode-delivers-the-credential-to-the-applicant)", re: PEER_BLOCKED, strict: true, unless: /used to|no longer|was tried|is gone|removed/i },
  { why: "the agenda commands are npm ci and npm run up, not docker load / npm i / vta:up", re: /`docker load`, `npm i`/ },
  { why: "prebuilt images are not available (pins.json images.available is false): say \"build locally; prebuilt images not yet available\"", re: PREBUILT_DEFAULT, only: "unavailable", unless: FUTURE_OR_ABSENT },
];

/**
 * Lines of `text` that match a stale rule, as `line N: why`. A line mentioning a past or older version is skipped.
 * `imagesAvailable` is pins.json images.available: rules with `only` apply only for that value.
 */
export function staleHits(text: string, imagesAvailable = false): string[] {
  const out: string[] = [];
  text.split("\n").forEach((line, i) => {
    const historical = /\b(earlier|older|first pin|before the pin|verified failure)\b/i.test(line);
    for (const r of STALE_RULES) if (!(historical && !r.strict) && r.re.test(line) && !(r.only === (imagesAvailable ? "unavailable" : "available")) && !(r.unless && r.unless.test(line))) out.push(`line ${i + 1}: stale phrase (${r.why}): ${line.trim().slice(0, 90)}`);
  });
  return out;
}
