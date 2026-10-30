// The loopback origins the local VTA and VTC allow by default (vta-entrypoint.sh, vtc-entrypoint.sh).
// DEV ONLY. The servers take exact origins (no wildcard), so common dev-server ports are listed one by one.
// Loopback only: every entry is http://localhost:<port> or http://127.0.0.1:<port>, so no page from another machine
// or a public site is admitted. The entrypoints repeat this list in shell; scripts/test/cors.test.ts keeps the two equal.
// Browser templates avoid the question entirely with a same-origin dev proxy (scripts/lib/dev-proxy.ts).

/** Inclusive port ranges: 3000s (React, Next), 3050, 4000s, 4173 (vite preview), 5173+ (Vite and its bumps), 8000s. */
export const LOCAL_CORS_PORT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [3000, 3009], [3050, 3050], [4000, 4009], [4173, 4173], [5173, 5183], [8000, 8009],
];
export const LOOPBACK_HOSTS = ["localhost", "127.0.0.1"] as const;

/** Every default origin, in the order the entrypoints write them. */
export function localCorsOrigins(): string[] {
  const out: string[] = [];
  for (const [lo, hi] of LOCAL_CORS_PORT_RANGES) for (let p = lo; p <= hi; p++) for (const h of LOOPBACK_HOSTS) out.push(`http://${h}:${p}`);
  return out;
}

/** The TOML array body the entrypoints render: `"http://localhost:3000", "http://127.0.0.1:3000", ...`. */
export const corsTomlBody = (origins: readonly string[] = localCorsOrigins()): string => origins.map((o) => `"${o}"`).join(", ");

/** A short human description of the default list, for error messages. */
export const LOCAL_CORS_SUMMARY =
  "http://localhost or http://127.0.0.1 on ports " +
  LOCAL_CORS_PORT_RANGES.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(", ");

/** Would the default list admit this page origin? (Exact match, as the servers do.) */
export const originInDefaultCors = (origin: string): boolean => localCorsOrigins().includes(origin);
