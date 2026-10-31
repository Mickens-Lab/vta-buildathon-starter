// The tunnel host a did:webvh is bound to. The browser pages (tsp-ping, the community dashboard) name it in the command that
// recreates only the mediator with a new MEDIATOR_CORS_ALLOW_ORIGIN (docs/MODES.md, "Browser access"). Browser-safe, pure.

/** The host a did:webvh is bound to (`did:webvh:<scid>:<host>[:path]`, a port encoded as %3A), else undefined. */
export function mediatorHostOf(did: string): string | undefined {
  const p = did.split(":");
  if (p[0] !== "did" || p[1] !== "webvh" || p.length < 4 || !p[3]) return undefined;
  try { return decodeURIComponent(p[3]); } catch { return undefined; }
}
