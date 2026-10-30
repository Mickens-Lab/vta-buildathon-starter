// Report drift between pins.json and what is installed, running and upstream.
// Read-only; never advances a pin. `npm run pins:check [-- --strict]` (strict exits 1 on drift).
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { farmImageTag, pins } from "./pins.js";
import { env, LOCAL_VTC_URL } from "./env.js";

const p = pins();
let drift = 0;
const out = (ok: boolean | null, what: string, detail: string) => {
  if (ok === false) drift++;
  console.log(`${ok === true ? "ok   " : ok === false ? "DRIFT" : "info "} ${what.padEnd(34)} ${detail}`);
};
const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: "utf8", timeout: 30_000 });

// 1. npm: exact pins vs the lockfile's resolved versions, then upstream.
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8")).packages as Record<string, { version: string }>;
for (const [name, want] of Object.entries(p.npm)) {
  const got = lock[`node_modules/${name}`]?.version;
  out(got === want, `npm ${name}`, got === want ? want : `pinned ${want}, lockfile ${got ?? "missing"}`);
}
const od = run("npm", ["outdated", "--json"]);
try {
  for (const [name, v] of Object.entries(JSON.parse(od.stdout || "{}") as Record<string, { latest: string; current: string }>)) {
    if (name in p.npm && v.latest !== v.current) out(null, `npm latest ${name}`, `${v.current} -> ${v.latest} available (not applied)`);
  }
} catch { out(null, "npm outdated", "could not run (offline?)"); }

// 2. VTI: upstream tags (each image is pinned to its own release tag) and a local checkout.
const imgs = [["vta", p.vti.vta], ["vtc", p.vti.vtc]] as const;
const co = process.env.VTI_PATH ?? "../verifiable-trust-infrastructure";
const tags = run("git", ["ls-remote", "--tags", "--refs", p.vti.repo]);
if (tags.status === 0) {
  const latest = (prefix: string) =>
    tags.stdout.split("\n").map((l) => l.split("refs/tags/")[1]).filter((t) => t?.startsWith(prefix)).map((t) => t.slice(prefix.length))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
  for (const [, pin] of imgs) {
    const l = latest(`${pin.service}-v`);
    out(null, `${pin.service} upstream latest tag`, `${l ?? "?"} (pinned ${pin.version}${l === pin.version ? ", current" : ", newer exists: advance only per docs/PINS.md"})`);
  }
} else out(null, "VTI upstream tags", "unreachable or private; skipped");
for (const [, pin] of imgs) {
  // The tag must still resolve to the pinned ref in the local checkout (a moved or retagged release is drift).
  const t = run("git", ["-C", co, "rev-parse", `${pin.tag}^{commit}`]);
  if (t.status === 0) out(t.stdout.trim() === pin.ref, `tag ${pin.tag}`, t.stdout.trim() === pin.ref ? `-> ${pin.ref.slice(0, 8)}` : `now ${t.stdout.trim().slice(0, 8)}, pinned ${pin.ref.slice(0, 8)}`);
  else out(null, `tag ${pin.tag}`, "not in the local checkout (git fetch --tags); skipped");
}

// 3. Images: label (set by images:build) and the binary's own version, per image.
for (const [name, pin] of imgs) {
  const image = `${pin.image}:local`;
  const lab = run("docker", ["image", "inspect", image, "--format", '{{ index .Config.Labels "org.buildathon.vti-ref" }}']);
  if (lab.status !== 0) { out(null, `image ${image}`, "not present"); continue; }
  const ref = lab.stdout.trim();
  const labelled = ref !== "" && ref !== "<no value>";
  out(labelled ? ref === pin.ref : null, `image ${image} ref`, labelled ? ref.slice(0, 8) : `unlabelled (not built by images:build); pinned ${pin.ref.slice(0, 8)}`);
  if (name === "vta" && pin.features) {
    const f = run("docker", ["image", "inspect", image, "--format", '{{ index .Config.Labels "org.buildathon.vta-features" }}']).stdout.trim();
    const has = f !== "" && f !== "<no value>";
    out(has ? f === pin.features : null, `image ${image} features`, has ? (f === pin.features ? "match (includes tsp)" : `built with ${f}, pinned ${pin.features}`) : "unlabelled (built before MODE=tunnel); rebuild with `npm run images:build vta` to be sure it has tsp");
  }
  const v = run("docker", ["run", "--rm", "--entrypoint", name, image, "--version"]);
  const ver = /(\d+\.\d+\.\d+)/.exec(v.stdout + v.stderr.replace(/\x1b\[[0-9;]*m/g, ""))?.[1];
  out(ver ? ver === pin.version : null, `image ${image} version`, ver ?? "could not read");
}

// 3b. The mediator image (MODE=tunnel only; absent is normal).
{
  const m = p.messaging.mediator;
  const lab = run("docker", ["image", "inspect", `${m.image}:local`, "--format", '{{ index .Config.Labels "org.buildathon.mediator-ref" }}']);
  if (lab.status !== 0) out(null, `image ${m.image}:local`, "not present (only MODE=tunnel needs it: npm run images:build mediator)");
  else {
    const ref = lab.stdout.trim();
    const labelled = ref !== "" && ref !== "<no value>";
    out(labelled ? ref === m.ref : null, `image ${m.image}:local ref`, labelled ? ref.slice(0, 8) : `unlabelled; pinned ${m.ref.slice(0, 8)}`);
  }
  out(null, "redis image", `${p.messaging.redis.image}:${p.messaging.redis.tag} (compose default)`);
  const cf = run("cloudflared", ["--version"]);
  out(null, "cloudflared", cf.status === 0 ? `${/(\d{4}\.\d+\.\d+)/.exec(cf.stdout + cf.stderr)?.[1] ?? "?"} (validated ${p.messaging.cloudflared.validated})` : "not on PATH (only MODE=tunnel needs it)");
}

// 4. A running local VTC reports its version on /health (the VTA's /health does not).
try {
  const h = await (await fetch(`${env("VTC_URL") ?? LOCAL_VTC_URL}/health`, { signal: AbortSignal.timeout(3000) })).json() as { version?: string };
  out(h.version === p.vti.vtc.version, "running VTC /health version", `${h.version} (pinned ${p.vti.vtc.version})`);
} catch { out(null, "running VTC", "not reachable; skipped"); }

// 5. What the Farm portal must be told to pick.
out(null, "farm portal image to pick", `${farmImageTag(p)} (the portal default is NOT compatible)`);
out(null, "farm", p.farm.note);
console.log(drift ? `\n${drift} drift item(s). Nothing was changed. To advance deliberately: docs/PINS.md.` : "\nno drift.");
if (drift && process.argv.includes("--strict")) process.exit(1);
