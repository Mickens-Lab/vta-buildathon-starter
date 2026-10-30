// Tiny .env reader and the admin key file; Node only.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { identityFromSeed, seedFromMultibase, seedToMultibase, type Identity } from "@buildathon/vta-client";

export const ADMIN_FILE = ".vta/admin.json";
/** `ENV_FILE=.env.other` lets one repo hold several app identities. */
export const ENV_FILE = process.env.ENV_FILE ?? ".env";

export function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    return readFileSync(ENV_FILE, "utf8").match(new RegExp(`^${name}=(.+)$`, "m"))?.[1];
  } catch {
    return undefined;
  }
}

export function saveAdmin(id: Identity): void {
  mkdirSync(".vta", { recursive: true });
  writeFileSync(
    ADMIN_FILE,
    JSON.stringify({ did: id.did, privateKeyMultibase: seedToMultibase(id.seed) }, null, 2),
    { mode: 0o600 },
  );
}

export function loadAdmin(): Identity {
  if (!existsSync(ADMIN_FILE)) throw new Error(`${ADMIN_FILE} not found. Run \`npm run vta:keygen\` first.`);
  return identityFromSeed(seedFromMultibase(JSON.parse(readFileSync(ADMIN_FILE, "utf8")).privateKeyMultibase));
}

export type Mode = "local" | "tunnel" | "farm";

/** Validate a MODE value (pure; tested). */
export function parseMode(raw: string | undefined, where = ENV_FILE): Mode {
  const m = (raw ?? "local").trim();
  if (m !== "local" && m !== "tunnel" && m !== "farm") throw new Error(`MODE must be "local", "tunnel" or "farm", got "${m}". Edit ${where}.`);
  return m;
}

/** `MODE=local|tunnel|farm` from the environment or `.env`. Default: local. */
export function mode(): Mode {
  return parseMode(env("MODE"));
}

/** Drop KEY=value lines from the env file (used when a tunnel stack is torn down and its URLs and credential are dead). */
export function removeEnv(keys: string[]): void {
  if (!existsSync(ENV_FILE)) return;
  const kept = readFileSync(ENV_FILE, "utf8").split("\n").filter((l) => l !== "" && !keys.some((k) => l.startsWith(`${k}=`)));
  writeFileSync(ENV_FILE, kept.length ? kept.join("\n") + "\n" : "", { mode: 0o600 });
}

/** Merge KEY=value pairs into the env file, keeping every other line (MODE, VTC_URL, ...). */
export function updateEnv(updates: Record<string, string | undefined>): void {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split("\n").filter((l) => l !== "") : [];
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue;
    const i = lines.findIndex((l) => l.startsWith(`${k}=`));
    if (i >= 0) lines[i] = `${k}=${v}`;
    else lines.push(`${k}=${v}`);
  }
  writeFileSync(ENV_FILE, lines.join("\n") + "\n", { mode: 0o600 });
}

export const LOCAL_VTA_URL = "http://localhost:8100";
export const LOCAL_VTC_URL = "http://localhost:8200";

/** Exit with a short actionable message instead of a stack trace. */
export function die(msg: string): never {
  console.error(`\nerror: ${msg}\n`);
  process.exit(1);
}

/** Run `fn`; on a network failure print what to check for the current mode. */
export async function reachable<T>(what: string, url: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const cause = String((e as any)?.cause?.code ?? (e as any)?.cause?.message ?? (e as Error).message);
    const hint =
      mode() === "farm"
        ? `MODE=farm: check ${what === "VTA" ? "VTA_URL" : "VTC_URL"} in ${ENV_FILE} against the URL shown in the VTA Farm portal (FARM=ic3: https://vtafarm.ic3.dev, FARM=firstperson: https://vtafarm.firstperson.dev), or set FARM_AGENT=<name>, and that the agent shows "online". See docs/FARM.md.`
        : mode() === "tunnel"
          ? `MODE=tunnel: is the stack up and are the tunnels alive? Quick-tunnel URLs die when cloudflared stops, and every run gets new ones. Run \`npm run tunnel:probe\`, or \`MODE=tunnel npm run down\` then \`MODE=tunnel npm run up\`. See docs/MODES.md.`
          : `MODE=local: is the stack up? Run \`npm run up\` (docker compose ps / npm run vta:logs).`;
    die(`could not reach the ${what} at ${url} (${cause}).\n${hint}`);
  }
}

/** VTC base URL for the current mode (no trailing slash). */
export function vtcUrl(): string {
  const u = process.env.VTC_URL ?? env("VTC_URL") ?? (mode() === "local" ? LOCAL_VTC_URL : undefined);
  if (!u) {
    die(`MODE=farm needs VTC_URL=https://vtc-<name>.<domain> in ${ENV_FILE}. A VTC exists only if you created a community (full stack) in the VTA Farm portal. See docs/FARM.md.`);
  }
  return u.replace(/\/+$/, "");
}

/** One line for a Trust Task refusal: `code: message`, not the whole signed error envelope. */
export function refusal(body: unknown): string {
  const p = (body as any)?.payload;
  return p?.code ? `${p.code}${p.message ? ` - ${p.message}` : ""}` : JSON.stringify(body);
}
