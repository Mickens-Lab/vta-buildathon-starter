// Fails when the tree holds anything specific to one person, agent, account or machine.
// This repo is a general tool: no keys, agents, accounts or personal infrastructure.
//   npm run check:generic            # scans tracked and untracked-but-not-ignored files
//   npm run check:generic -- --history   # also scans every commit's diff and message (the Signed-off-by trailer is exempt) on the current branch
// Fake test fixtures are fine as long as they are short or say "fake" (e.g. did:webvh:Qmfake:localhost).
import "./lib/cli.js";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { hasGit, repoFiles } from "./lib/files.js";

const B58 = "[1-9A-HJ-NP-Za-km-z]";
// [label, pattern, optional path allow-list]
const RULES: [string, RegExp, RegExp?][] = [
  ["email address", /[A-Za-z0-9._%+-]+@(?!example\.)[A-Za-z0-9-]+\.(com|edu|org|net|io|dev|ai)\b/i],
  ["did:webvh with a concrete scid", new RegExp(`did:webvh:Qm${B58}{20,}`)],
  ["did:key with a concrete key", new RegExp(`did:key:z6Mk${B58}{30,}`)],
  ["bare ed25519 multibase key", new RegExp(`\\bz6Mk${B58}{30,}`)],
  ["private key material", /privateKeyMultibase["']?\s*[:=]\s*["']z[1-9A-Za-z]{20,}/],
  ["absolute path on a dev machine", /(\/srv\/dev|\/home\/[a-z][\w.-]*\/|\/Users\/[a-z]|\/var\/tmp\/sea-|\/tmp\/claude)/],
  ["personal or account name", /\b(brendan|miller|harvard|seas-?account)\b/i],
  ["specific agent name", /\b(bam-[\w-]+|keyring-runner[\w-]*|buildathon-starter-test)\b/i],
  ["private repo or machine", /\b(keyring-wallet|vti-stack|ngrok)\b/i],
  // A Farm-operated community: may be named only as an example in the Farm doc, never as a default.
  ["named community default", /vtc\.ic3\.dev/, /^docs\/FARM\.md$/],
];
const SELF = "scripts/check-generic.ts";
const SKIP = /(^|\/)package-lock\.json$/;

const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1 << 28 });
const hits: string[] = [];
const scan = (where: string, text: string, path?: string) => {
  text.split("\n").forEach((line, i) => {
    for (const [label, re, allow] of RULES) {
      if (allow && (path ? allow.test(path) : /example Farm-hosted/.test(line))) continue; // history lines carry no path
      if (re.test(line)) hits.push(`${where}:${i + 1}  ${label}  ${line.trim().slice(0, 100)}`);
    }
  });
};

const GIT = hasGit();
for (const f of repoFiles()) {
  if (f === SELF || SKIP.test(f)) continue;
  let text: string;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  if (text.includes("\0")) continue;
  scan(f, text, f);
}
if (process.argv.includes("--history") && !GIT) {
  console.log("check:generic: no git history here (a ZIP download?), so --history was skipped; the files were scanned.");
} else if (process.argv.includes("--history")) {
  for (const c of git("rev-list", "HEAD").split("\n").filter(Boolean)) {
    const show = git("show", "--format=%B", "--no-color", "-U0", c, "--", ".", `:!${SELF}`, ":!package-lock.json");
    // The author and Signed-off-by trailer identify the committer by design; everything else must be generic.
    scan(`commit ${c.slice(0, 8)}`, show.split("\n").filter((l) => !/^Signed-off-by:/i.test(l)).join("\n"));
  }
}
for (const f of repoFiles(/(^|\/)package\.json$/).filter((p) => !p.includes("node_modules"))) {
  let license: unknown;
  try { license = JSON.parse(readFileSync(f, "utf8")).license; } catch { continue; }
  if (license !== "Apache-2.0") hits.push(`${f}  licence  expected "license": "Apache-2.0", found ${JSON.stringify(license)}`);
}
if (hits.length) {
  console.error(`check:generic FAILED: ${hits.length} specific reference(s). This repo must stay general-purpose.\n`);
  for (const h of hits.slice(0, 60)) console.error("  " + h);
  process.exit(1);
}
console.log("check:generic ok: no personal keys, agents, accounts, paths or hosts found.");
