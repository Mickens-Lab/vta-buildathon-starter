// Shared by the live (local stack) checks: `npm run test:roles` and `npm run e2e`. Neither runs in `npm test`.
import { env, LOCAL_VTA_URL, LOCAL_VTC_URL, mode, vtcUrl } from "../env.js";

/** Why the local stack cannot be used, or undefined when both services answer. Never throws. */
export async function stackProblem(): Promise<string | undefined> {
  if (mode() !== "local") return "MODE is not local: these checks drive the local Docker stack, not a Farm.";
  const vta = env("VTA_URL") ?? LOCAL_VTA_URL;
  const vtc = vtcUrl();
  if (!env("VTA_CREDENTIAL")) return "no VTA_CREDENTIAL in .env. Start the stack with `WITH_VTC=1 npm run up`.";
  for (const [what, base] of [["VTA", vta], ["VTC", vtc]] as const) {
    try {
      const r = await fetch(`${base.replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) return `${what} at ${base} answered HTTP ${r.status}. Start the stack with \`WITH_VTC=1 npm run up\`.`;
    } catch {
      return `${what} at ${base} did not answer. Start the stack with \`WITH_VTC=1 npm run up\`.`;
    }
  }
  return undefined;
}

/** Print a clear SKIP and exit 0, unless REQUIRE_STACK=1 (use that in CI that is supposed to have the stack). */
export function skip(what: string, why: string): never {
  const need = process.env.REQUIRE_STACK === "1";
  console.error(`${need ? "FAIL" : "SKIP"} ${what}: ${why}`);
  process.exit(need ? 1 : 0);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Paces calls to stay inside the VTC's admission budgets (docs/VTC-SURFACE.md): a signer with no ACL entry shares one
 * per-address bucket (burst 10, then one per 5 s); a known signer has its own (burst 60, then one per 500 ms).
 * It spends less than the burst on purpose, then spaces calls by the refill time.
 */
export class Pacer {
  private n = 0;
  private last = 0;
  constructor(private readonly burst: number, private readonly gapMs: number) {}
  async next(): Promise<void> {
    if (this.n++ >= this.burst) {
      const wait = this.last + this.gapMs - Date.now();
      if (wait > 0) await sleep(wait);
    }
    this.last = Date.now();
  }
}
export const anonymousPacer = () => new Pacer(7, 5200);
export const knownPacer = () => new Pacer(50, 550);
