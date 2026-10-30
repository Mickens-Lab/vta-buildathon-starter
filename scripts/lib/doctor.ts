// `npm run doctor`: the checks, as pure functions over probe results, so the messages are tested without Docker.
// scripts/doctor.ts gathers the real probes; `up` runs the blocking subset first.
import { cloneCommand, DEFAULT_VTI_DIR } from "./images.js";

export type Level = "ok" | "warn" | "fail";
export interface Check { level: Level; name: string; detail: string; fix?: string }

/** Ports the kit uses. `stack` ports must be free (or held by this stack) for `up`; `dev` ports only matter for the templates. */
export const STACK_PORTS = [{ port: 8100, what: "VTA", env: "VTA_PORT" }, { port: 8200, what: "VTC", env: "VTC_PORT" }] as const;
export const DEV_PORTS = [
  { port: 5173, what: "web-vta-app and community-dashboard (Vite)", use: (p: number) => `npm run dev -w @buildathon/web-vta-app -- --port ${p}` },
  { port: 3000, what: "tsp-ping page and npm run e2e", use: (p: number) => `npm run dev -w @buildathon/tsp-ping -- --port ${p}` },
  { port: 4000, what: "inbox-verifier", server: true, use: (p: number) => `INBOX_PORT=${p} npm start -w @buildathon/inbox-verifier` },
] as const;
export const MEDIATOR_PORT = 7037;
/** Origins the local VTA allows for browser pages: other ports need a CORS change (docs/CHEATSHEET.md). */
export const CORS_PORTS = [3000, 5173, 8000];

export function nodeCheck(version: string, minMajor = 20): Check {
  const major = Number(/^v?(\d+)/.exec(version)?.[1]);
  return major >= minMajor
    ? { level: "ok", name: "Node", detail: version }
    : { level: "fail", name: "Node", detail: `${version} is too old`, fix: `install Node ${minMajor} or newer (nvm install ${minMajor})` };
}

export function dockerCheck(p: { cli: boolean; daemon: boolean; compose: boolean }): Check {
  if (!p.cli) return { level: "fail", name: "Docker", detail: "the docker command was not found", fix: "install Docker (https://docs.docker.com/get-docker/), or use MODE=farm (docs/FARM.md)" };
  if (!p.daemon) return { level: "fail", name: "Docker", detail: "installed, but the daemon does not answer", fix: "start Docker Desktop or the docker service (sudo systemctl start docker), then run this again" };
  if (!p.compose) return { level: "fail", name: "Docker Compose", detail: "`docker compose` (v2) is missing", fix: "install the Compose v2 plugin (https://docs.docker.com/compose/install/)" };
  return { level: "ok", name: "Docker", detail: "running, Compose v2 available" };
}

export function memoryCheck(availKb: number | undefined, needGb: number, forWhat: string): Check {
  if (availKb === undefined) return { level: "ok", name: "Memory", detail: "not measured on this OS" };
  const gb = availKb / 1024 / 1024;
  return gb >= needGb
    ? { level: "ok", name: "Memory", detail: `${gb.toFixed(1)} GB available` }
    : { level: "warn", name: "Memory", detail: `${gb.toFixed(1)} GB available; ${forWhat} wants about ${needGb} GB`, fix: "close other applications (a Rust image build is the heavy part)" };
}

export interface PortProbe { port: number; busy: boolean; ownStack: boolean }

/** A busy stack port is fine when this very stack holds it (a second `up`), a failure otherwise. */
export function stackPortCheck(p: PortProbe & { what: string; env: string }, free: number | undefined): Check {
  const name = `Port ${p.port} (${p.what})`;
  if (!p.busy) return { level: "ok", name, detail: "free" };
  if (p.ownStack) return { level: "ok", name, detail: "in use by this stack" };
  return {
    level: "fail", name, detail: `already in use by another program`,
    fix: free
      ? `stop that program, or start on another port: ${p.env}=${free} npm run up (a fresh stack only; set the matching ${p.env === "VTA_PORT" ? "VTA_URL" : "VTC_URL"}). Find the program with: lsof -i :${p.port}`
      : `stop that program (lsof -i :${p.port})`,
  };
}

/** A busy template port is only a warning: the page can use another allowed origin. */
export function devPortCheck(p: PortProbe & { what: string; server?: boolean; use?: (port: number) => string }, free: number | undefined): Check {
  const name = `Port ${p.port} (${p.what})`;
  if (!p.busy) return { level: "ok", name, detail: "free" };
  return {
    level: "warn", name, detail: "in use",
    fix: free ? `use port ${free}: ${(p.use ?? ((n: number) => `npm run dev -w <template> -- --port ${n}`))(free)}${p.server || CORS_PORTS.includes(free) ? "" : " (a port other than 3000, 5173 or 8000 needs a CORS change, docs/CHEATSHEET.md)"}` : "use another port with -- --port <n>",
  };
}

export function mediatorPortCheck(busy: boolean): Check {
  return busy
    ? { level: "fail", name: `Port ${MEDIATOR_PORT} (mediator)`, detail: "already in use by another program", fix: `stop it (lsof -i :${MEDIATOR_PORT}); MODE=tunnel needs this port for the mediator` }
    : { level: "ok", name: `Port ${MEDIATOR_PORT} (mediator)`, detail: "free" };
}

export interface ImageNeed { image: string; build: string; why: string }

/** The images a mode needs, with the command that builds each. */
export function imagesNeeded(mode: "local" | "tunnel" | "farm", withVtc: boolean, env: Record<string, string | undefined> = {}): ImageNeed[] {
  if (mode === "farm") return [];
  const out: ImageNeed[] = [{ image: env.VTA_IMAGE ?? "vta-buildathon:local", build: "npm run images:build vta", why: "the VTA (about 12 min cold)" }];
  if (withVtc) out.push({ image: env.VTC_IMAGE ?? "vtc-buildathon:local", build: "npm run images:build vtc", why: "the community, VTC (about 8 to 23 min)" });
  if (mode === "tunnel") out.push({ image: env.MEDIATOR_IMAGE ?? "mediator-buildathon:local", build: "npm run images:build mediator", why: "the mediator (about 12 min cold, 8 GB RAM advised)" });
  return out;
}

export function imageChecks(needs: ImageNeed[], present: (image: string) => boolean): Check[] {
  return needs.map((n) =>
    present(n.image)
      ? { level: "ok" as const, name: `Image ${n.image}`, detail: "present" }
      : { level: "fail" as const, name: `Image ${n.image}`, detail: `not built on this machine (${n.why}); no images are published`, fix: `${n.build}   (docs/PINS.md#where-the-images-come-from)` },
  );
}

export function vtiCheckout(p: { exists: boolean; dir: string; repoUrl: string }): Check {
  return p.exists
    ? { level: "ok", name: "VTI checkout", detail: p.dir }
    : { level: "warn", name: "VTI checkout", detail: `not at ${p.dir}; needed only to build the VTA and VTC images`, fix: `${cloneCommand(p.repoUrl, DEFAULT_VTI_DIR)}  (or: npm run images:build -- --clone)` };
}

export function cloudflaredCheck(have: boolean): Check {
  return have
    ? { level: "ok", name: "cloudflared", detail: "found" }
    : { level: "fail", name: "cloudflared", detail: "not on PATH (MODE=tunnel needs it)", fix: "install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" };
}

export function modeCheck(mode: string, source: string, withVtc: boolean): Check {
  return { level: "ok", name: "Mode", detail: `MODE=${mode} (from ${source}); VTC ${withVtc ? "on" : "off"}`, fix: source === ".env" ? "change it for one run with `-- --local` / `-- --tunnel`, or edit .env" : undefined };
}

export const blocking = (cs: Check[]): Check[] => cs.filter((c) => c.level === "fail");

const MARK: Record<Level, string> = { ok: "ok  ", warn: "warn", fail: "FAIL" };

/** One line per check, with the fix indented under any warning or failure. */
export function formatChecks(cs: Check[]): string {
  return cs
    .map((c) => `  ${MARK[c.level]}  ${c.name}: ${c.detail}${c.level !== "ok" && c.fix ? `\n        -> ${c.fix}` : ""}`)
    .join("\n");
}

export function summary(cs: Check[]): string {
  const f = cs.filter((c) => c.level === "fail").length;
  const w = cs.filter((c) => c.level === "warn").length;
  return f ? `${f} problem(s) block \`npm run up\`${w ? `, ${w} warning(s)` : ""}. Fix the lines marked FAIL.` : w ? `Ready to start, ${w} warning(s) above.` : "All good.";
}
