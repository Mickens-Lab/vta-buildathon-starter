// Side-effecting helpers for MODE=tunnel and the compose stack (Docker, the file system, cloudflared).
// The decisions they act on are pure and tested in ./tunnel.ts.
import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pins } from "../pins.js";
import { env } from "../env.js";
import { IMAGE_KINDS, useImages } from "./images.js";
import { composeEnv, composeProject, existingVolumes, hostFromLog, MODE_FILE, profileArgs, TUNNEL_FILE, type StackMode, type TunnelState } from "./tunnel.js";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function readTunnel(): TunnelState | undefined {
  try { return JSON.parse(readFileSync(TUNNEL_FILE, "utf8")); } catch { return undefined; }
}
export function writeTunnel(s: TunnelState): void {
  mkdirSync(".vta", { recursive: true });
  writeFileSync(TUNNEL_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
}
export function readStackMode(): StackMode | null {
  try {
    const m = JSON.parse(readFileSync(MODE_FILE, "utf8")).mode;
    return m === "local" || m === "tunnel" ? m : null;
  } catch { return null; }
}
export function writeStackMode(mode: StackMode): void {
  mkdirSync(".vta", { recursive: true });
  writeFileSync(MODE_FILE, JSON.stringify({ mode }), { mode: 0o600 });
}
export const clearStackFiles = () => { for (const f of [TUNNEL_FILE, MODE_FILE]) rmSync(f, { force: true }); };

let imagesResolved = false;
/** Environment for `docker compose`: the tunnel hosts, if a tunnel stack is recorded. */
export const composeEnvNow = (): NodeJS.ProcessEnv => {
  // Standalone commands (vtc:up, ...) pick the same images `up` did: no pulling here, failures fall through to compose's own error.
  if (!imagesResolved) {
    imagesResolved = true;
    try { useImages(pins(), IMAGE_KINDS, { pull: false, quiet: true, get: env }); } catch { /* bad IMAGES value: `up` reports it */ }
  }
  const t = readTunnel();
  return { ...process.env, ...(t ? composeEnv(t) : {}) };
};

/** Run `docker compose` with the profiles for the mode. */
export function dc(mode: StackMode, withVtc: boolean, args: string[], opts: { inherit?: boolean } = {}): SpawnSyncReturns<string> {
  return spawnSync("docker", ["compose", ...profileArgs(mode, withVtc), ...args], {
    encoding: "utf8", env: composeEnvNow(), stdio: opts.inherit ? "inherit" : "pipe", timeout: 600_000,
  });
}

export function existingStackVolumes(): string[] {
  const r = spawnSync("docker", ["volume", "ls", "-q"], { encoding: "utf8", timeout: 30_000 });
  return existingVolumes((r.stdout ?? "").split("\n").filter(Boolean), composeProject(process.cwd()));
}

export const have = (cmd: string): boolean => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
export const imageLabel = (image: string, label: string): string | undefined => {
  const r = spawnSync("docker", ["image", "inspect", image, "--format", `{{ index .Config.Labels "${label}" }}`], { encoding: "utf8" });
  return r.status !== 0 ? undefined : r.stdout.trim() === "<no value>" ? "" : r.stdout.trim();
};

/** Start one quick tunnel to a local port; resolves with its host and pid. The process outlives this one. */
export async function startTunnel(name: string, port: number, timeoutMs = 60_000): Promise<{ host: string; pid: number }> {
  mkdirSync(".vta", { recursive: true });
  const log = `.vta/cloudflared-${name}.log`;
  const fd = openSync(log, "w", 0o600);
  const child = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`, "--metrics", "127.0.0.1:0"], {
    detached: true, stdio: ["ignore", fd, fd],
  });
  child.unref();
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const host = hostFromLog(readFileSync(log, "utf8"));
    if (host && child.pid) return { host, pid: child.pid };
    if (child.exitCode !== null) break;
    await sleep(500);
  }
  if (child.pid) try { process.kill(child.pid); } catch { /* already gone */ }
  throw new Error(`cloudflared did not print a tunnel host for the ${name} within ${timeoutMs / 1000} s (see ${log}). Quick tunnels can be flaky or rate limited: try again in a minute.`);
}

/** Stop the cloudflared processes `up` recorded, but only if the pid still is a cloudflared. */
export function stopTunnels(pids: number[]): number {
  let n = 0;
  for (const pid of pids) {
    try {
      if (!readFileSync(`/proc/${pid}/cmdline`, "utf8").includes("cloudflared")) continue;
      process.kill(pid);
      n++;
    } catch { /* gone, or no /proc on this OS */ }
  }
  for (const f of existsSync(".vta") ? ["vta", "vtc", "mediator"] : []) rmSync(`.vta/cloudflared-${f}.log`, { force: true });
  return n;
}

/** GET until 200 or the deadline; for public tunnel hosts, whose DNS can lag a few seconds. */
export async function waitFor200(url: string, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(8000) })).status === 200) return true; } catch { /* retry */ }
    await sleep(2000);
  }
  return false;
}
