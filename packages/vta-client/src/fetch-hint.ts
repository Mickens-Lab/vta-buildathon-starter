// Turn the browser's bare "NetworkError when attempting to fetch resource" into an explanation. A blocked cross-origin call and an
// unreachable server look identical to the page (a TypeError with no detail), so say both causes, with the origin, the URL and the fix.
import { LOCAL_CORS_SUMMARY, originInDefaultCors } from "./cors.js";

export interface FetchFailureContext {
  /** What the page called (the proxy URL when proxied, else the server's own URL). */
  url: string;
  /** This page's origin, e.g. `location.origin`. */
  origin: string;
  /** True when `url` is the page's own origin (the Vite dev proxy): CORS cannot be the cause. */
  proxied?: boolean;
  /** The real server behind the proxy, for the message. */
  target?: string;
  /** Which server: decides the override variable named in the fix. Default "vta". */
  server?: "vta" | "vtc" | "mediator";
  /** The mediator's tunnel host (server "mediator"): adds the command that recreates only the mediator with the new origin. */
  mediatorHost?: string;
}

// What browsers say when a fetch got no answer: Chromium, Firefox, Safari. Libraries often wrap the TypeError into their own
// Error and keep only this text (the did:webvh resolver: "did:webvh resolve failed: invalidDid — Failed to fetch").
const NO_ANSWER = /Failed to fetch|NetworkError when attempting to fetch|Load failed/i;

/** True for a fetch that never got an answer: the browser's TypeError, or another error whose message carries its wording. */
export function looksLikeFetchFailure(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  return e instanceof Error && NO_ANSWER.test(e.message);
}

const CORS_VAR = { vta: "CORS_ORIGINS_TOML", vtc: "VTC_CORS_ORIGINS_TOML", mediator: "MEDIATOR_CORS_ALLOW_ORIGIN" } as const;
const NAME = { vta: "VTA", vtc: "VTC", mediator: "mediator" } as const;

const statusOf = (e: unknown): number | undefined => {
  const s = (e as { status?: unknown })?.status;
  if (typeof s === "number") return s;
  const m = /HTTP (\d{3})/.exec(e instanceof Error ? e.message : "");
  return m ? Number(m[1]) : undefined;
};

/** The explanation for a fetch that never got an answer (looksLikeFetchFailure), or for the dev proxy's 502; `undefined` for any other error. */
export function explainFetchFailure(e: unknown, c: FetchFailureContext): string | undefined {
  const server = c.server ?? "vta";
  const name = NAME[server];
  const status = statusOf(e);
  if (c.proxied && status !== undefined && [502, 503, 504].includes(status)) {
    return `The dev server is running but could not reach the ${name}${c.target ? ` at ${c.target}` : ""}. Is the stack up? Run \`npm run doctor\`, then \`npm run up\`. If ${server === "vta" ? "VTA_URL" : "the URL"} in the repo-root .env changed, restart the dev server.`;
  }
  if (!looksLikeFetchFailure(e)) return undefined;
  if (c.proxied) {
    return `The page could not reach its own dev server at ${c.origin} (called ${c.url}). Is \`npm run dev\` still running? The ${name} is reached through that server, so this page's port does not matter.`;
  }
  const allowed = originInDefaultCors(c.origin);
  const v = CORS_VAR[server];
  const fix =
    server === "mediator"
      ? [
          `The mediator allows no browser origin by default. It needs this exact line (one origin, scheme and port included):`,
          `MEDIATOR_CORS_ALLOW_ORIGIN=${c.origin}`,
          `Either start a fresh tunnel stack with it (\`MEDIATOR_CORS_ALLOW_ORIGIN=${c.origin} npm run up -- --tunnel\`; a tunnel stack is never resumed)${c.mediatorHost ? `, or recreate only the running mediator with it (it keeps its DID): \`MEDIATOR_PUBLIC_HOST=${c.mediatorHost} MEDIATOR_CORS_ALLOW_ORIGIN=${c.origin} docker compose --profile messaging up -d mediator\`` : ""} (docs/MODES.md, "Browser access").`,
        ].join("\n")
      : `Either call it through the Vite dev proxy (/__vta, /__vtc: the templates do), or allow ${c.origin}: set ${v} to a list that includes it (it replaces the default; first boot only), then \`npm run reset && npm run up\`.`;
  return [
    `The browser could not reach the ${name} at ${c.url} from ${c.origin}. A browser reports two different problems the same way:`,
    `1. The ${name} is not running or not reachable: run \`npm run doctor\`.`,
    server === "mediator"
      ? `2. The mediator refused this origin (${c.origin}).`
      : `2. The ${name} refused this origin (CORS). ${c.origin} ${allowed ? "is in" : "is NOT in"} the default list (${LOCAL_CORS_SUMMARY}).`,
    fix,
  ].join("\n");
}
