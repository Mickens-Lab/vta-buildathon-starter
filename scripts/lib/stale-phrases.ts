// Phrases that were true once and are now wrong. check:docs fails when a markdown file still says one of them,
// so a fix that landed in one doc cannot silently survive in another. Add a rule when a statement goes stale.
// Historical records (PINS_LOG.md, and lines that say "earlier"/"older"/"first pin" about a past failure) are exempt.

export interface StaleRule {
  /** What is wrong with the phrase, and what is true now. */
  why: string;
  re: RegExp;
}

export const STALE_RULES: StaleRule[] = [
  { why: "the TSP pong comes back since the mediator 0.45.0 pin (Stage H)", re: /pong does not come back|no pong (?:ever )?comes back|the mediator pin refuses TSP 1\.0/i },
  { why: "the TSP round trip is verified (Stage H); only DIDComm is not", re: /not verified:[^\n]*(?:TSP round trip|the pong is refused)/i },
  { why: "images are not supplied by the organiser by default: no images are published, everyone builds locally (docs/PINS.md#where-the-images-come-from)", re: /an organiser (?:usually|normally) (?:hands|supplies)|nobody should build/i },
  { why: "the agenda commands are npm ci and npm run up, not docker load / npm i / vta:up", re: /`docker load`, `npm i`/ },
];

/** Lines of `text` that match a stale rule, as `line N: why`. A line mentioning a past or older version is skipped. */
export function staleHits(text: string): string[] {
  const out: string[] = [];
  text.split("\n").forEach((line, i) => {
    if (/\b(earlier|older|first pin|before the pin|verified failure)\b/i.test(line)) return;
    for (const r of STALE_RULES) if (r.re.test(line)) out.push(`line ${i + 1}: stale phrase (${r.why}): ${line.trim().slice(0, 90)}`);
  });
  return out;
}
