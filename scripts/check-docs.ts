// Docs check: every relative markdown link resolves to a file, and every `npm run <script>` named in a
// markdown file exists in a package.json (root, the `-w` workspace, or the package the doc sits in), and no doc repeats a known-stale phrase
// (scripts/lib/stale-phrases.ts).
//   npm run check:docs
import "./lib/cli.js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { staleHits } from "./lib/stale-phrases.js";

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "*.md"], { encoding: "utf8" }).split("\n").filter(Boolean);
const scriptsOf = (dir: string): Set<string> | undefined => {
  const p = join(dir, "package.json");
  return existsSync(p) ? new Set(Object.keys(JSON.parse(readFileSync(p, "utf8")).scripts ?? {})) : undefined;
};
const workspaces = new Map<string, string>(); // package name -> dir
for (const g of ["packages", "templates"]) {
  for (const d of existsSync(g) ? execFileSync("ls", [g], { encoding: "utf8" }).split("\n").filter(Boolean) : []) {
    const p = join(g, d, "package.json");
    if (existsSync(p)) workspaces.set(JSON.parse(readFileSync(p, "utf8")).name, join(g, d));
  }
}
const root = scriptsOf(".")!;
const problems: string[] = [];
// docs/trust-tasks/ describes the upstream Trust Tasks repository's own scripts and a spec template whose links
// point into that repository, so only its own relative links to this repo's files are checked.
const UPSTREAM = /^docs\/trust-tasks\//;
const TEMPLATE = /^docs\/trust-tasks\/templates\/spec\.md$/;

for (const f of files) {
  const text = readFileSync(f, "utf8").replace(/^```[\s\S]*?^```/gm, (b) => b.replace(/\]\(/g, "] ("));  // links inside fenced code are examples
  if (f !== "PINS_LOG.md") for (const h of staleHits(text)) problems.push(`${f}:${h.replace("line ", "")}`);
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const at = `${f}:${i + 1}`;
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1].split("#")[0];
      if (!target || /^(https?:|mailto:)/.test(target) || TEMPLATE.test(f)) continue;
      if (!existsSync(normalize(join(dirname(f), target)))) problems.push(`${at}  broken link: ${m[1]}`);
    }
    if (UPSTREAM.test(f)) return;
    for (const m of line.matchAll(/npm (?:run|start|test)(?: -s| --silent)?(?: ([a-z][\w:.-]*))?([^`\n|]*)/g)) {
      const name = m[0].startsWith("npm start") ? "start" : m[0].startsWith("npm test") ? "test" : m[1];
      if (!name) continue;
      const w = /(?:-w|--workspace)[ =](\S+)/.exec(m[2] ?? "")?.[1];
      let set: Set<string> | undefined;
      if (w) set = workspaces.has(w) ? scriptsOf(workspaces.get(w)!) : undefined;
      else set = new Set([...root, ...(scriptsOf(dirname(f)) ?? [])]);
      if (w && !set) problems.push(`${at}  unknown workspace: ${w}`);
      else if (set && !set.has(name)) problems.push(`${at}  no such npm script: ${name}${w ? ` in ${w}` : ""}`);
    }
  });
}
if (problems.length) {
  console.error(`check:docs FAILED: ${problems.length} problem(s)\n`);
  for (const p of problems.slice(0, 80)) console.error("  " + p);
  process.exit(1);
}
console.log(`check:docs ok: ${files.length} markdown files, links and npm scripts resolve.`);
