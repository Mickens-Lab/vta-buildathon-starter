// `npm run doctor`: is this machine ready for the kit, and if not, exactly what to run?
//   npm run doctor                 # mode from .env or the environment
//   npm run doctor -- --tunnel     # check as if MODE=tunnel (also --local)
// `npm run up` runs the blocking subset first (runPreflight), so a missing image or a busy port is a short message, not a Docker error.
import "./lib/cli.js";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { resolve } from "node:path";
import { devBanner } from "./banner.js";
import { type Mode, mode, modeSource, withVtc } from "./env.js";
import {
  blocking, cloudflaredCheck, type Check, dockerCheck, DEV_PORTS, devPortCheck, formatChecks, imageChecks, imagesNeeded, CORS_PORTS, MEDIATOR_PORT, mediatorPortCheck,
  memoryCheck, modeCheck, nodeCheck, STACK_PORTS, stackPortCheck, summary, vtiCheckout,
} from "./lib/doctor.js";
import { have } from "./lib/compose.js";
import { pins } from "./pins.js";

/** Busy = something accepts a connection on loopback (IPv4 or IPv6). */
const portBusy = (port: number): Promise<boolean> =>
  new Promise((done) => {
    const tryHost = (host: string, next?: () => void) => {
      const s = net.connect({ port, host });
      s.setTimeout(500);
      s.once("connect", () => { s.destroy(); done(true); });
      s.once("timeout", () => { s.destroy(); next ? next() : done(false); });
      s.once("error", () => { s.destroy(); next ? next() : done(false); });
    };
    tryHost("127.0.0.1", () => tryHost("::1"));
  });

const ownStackRunning = (): boolean => {
  const r = spawnSync("docker", ["compose", "--profile", "vtc", "--profile", "messaging", "ps", "--status", "running", "-q"], { encoding: "utf8", timeout: 20_000 });
  return r.status === 0 && r.stdout.trim() !== "";
};

const imagePresent = (image: string): boolean => spawnSync("docker", ["image", "inspect", image], { stdio: "ignore", timeout: 20_000 }).status === 0;

function availKb(): number | undefined {
  try { return Number(/MemAvailable:\s+(\d+)/.exec(readFileSync("/proc/meminfo", "utf8"))?.[1]) || undefined; } catch { return undefined; }
}

export interface DoctorOptions { mode: Mode; withVtc: boolean; scope: "full" | "up" }

/** Gather the real probes and judge them. `scope: "up"` skips the template ports and the mode line. */
export async function runChecks(o: DoctorOptions): Promise<Check[]> {
  const out: Check[] = [nodeCheck(process.version)];
  if (o.mode === "farm") {
    if (o.scope === "full") out.push(modeCheck(o.mode, modeSource(), o.withVtc));
    return out;
  }
  const cli = have("docker");
  const daemon = cli && spawnSync("docker", ["info"], { stdio: "ignore", timeout: 20_000 }).status === 0;
  const compose = cli && spawnSync("docker", ["compose", "version"], { stdio: "ignore", timeout: 20_000 }).status === 0;
  const docker = dockerCheck({ cli, daemon, compose });
  out.push(docker);
  const needs = imagesNeeded(o.mode, o.withVtc, process.env);
  out.push(memoryCheck(availKb(), o.mode === "tunnel" ? 8 : 4, o.mode === "tunnel" ? "building the mediator" : "building an image"));
  if (docker.level === "ok") {
    const images = imageChecks(needs, imagePresent);
    out.push(...images);
    const buildsVti = images.some((c) => c.level === "fail" && /vta|vtc/.test(c.name));
    if (buildsVti) {
      const dir = resolve(process.env.VTI_PATH ?? "../verifiable-trust-infrastructure");
      out.push(vtiCheckout({ exists: existsSync(dir), dir: process.env.VTI_PATH ? dir : "../verifiable-trust-infrastructure", repoUrl: pins().vti.repo }));
    }
  }
  const own = daemon ? ownStackRunning() : false;
  const busyCache = new Map<number, boolean>();
  const busy = async (p: number) => { if (!busyCache.has(p)) busyCache.set(p, await portBusy(p)); return busyCache.get(p)!; };
  for (const p of STACK_PORTS) {
    if (p.port === 8200 && !o.withVtc) continue;
    const isBusy = await busy(p.port);
    let free: number | undefined;
    if (isBusy && !own) for (let c = p.port + 1; c < p.port + 30 && free === undefined; c++) if (!(await busy(c))) free = c;
    out.push(stackPortCheck({ port: p.port, what: p.what, env: p.env, busy: isBusy, ownStack: own }, free));
  }
  if (o.mode === "tunnel") {
    out.push(cloudflaredCheck(have("cloudflared")));
    out.push(mediatorPortCheck(await busy(MEDIATOR_PORT) && !own));
  }
  if (o.scope === "full") {
    const allowed = new Map<number, boolean>();
    for (const p of CORS_PORTS) allowed.set(p, await busy(p));
    const freeAllowed = CORS_PORTS.find((p) => !allowed.get(p));
    for (const p of DEV_PORTS) {
      const isBusy = await busy(p.port);
      let free = freeAllowed;
      if (p.port === 4000 && isBusy) { free = undefined; for (let c = 4001; c < 4020 && free === undefined; c++) if (!(await busy(c))) free = c; }
      out.push(devPortCheck({ port: p.port, what: p.what, busy: isBusy, ownStack: false, use: p.use, server: "server" in p }, free));
    }
    out.push(modeCheck(o.mode, modeSource(), o.withVtc));
  }
  return out;
}

/** Called by `up`: print only failures and warnings, exit if anything blocks. */
export async function runPreflight(o: Omit<DoctorOptions, "scope">): Promise<void> {
  const cs = await runChecks({ ...o, scope: "up" });
  const bad = cs.filter((c) => c.level !== "ok");
  if (bad.length) console.log(`\nchecking this machine first:\n${formatChecks(bad)}\n`);
  if (blocking(cs).length) {
    console.error(`${summary(cs)} (\`npm run doctor\` shows everything.)\n`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  devBanner();
  const cs = await runChecks({ mode: mode(), withVtc: withVtc(), scope: "full" });
  console.log(`\nVTA buildathon starter: machine check\n\n${formatChecks(cs)}\n\n${summary(cs)}`);
  process.exit(blocking(cs).length ? 1 : 0);
}
