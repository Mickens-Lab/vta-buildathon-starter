// The files the checks scan. In a git checkout: what git tracks plus what it would pick up (so ignored files are skipped).
// Without git (a ZIP download of the repository): walk the folder and skip what .gitignore would.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", ".vta", "dist", ".webauthn", ".claude"]);
/** Files .gitignore excludes that a plain walk would otherwise pick up. */
const SKIP_FILE = /(^|\/)(\.env($|\.)|[^/]*\.log$|[^/]*\.pem$|[^/]*\.key$|[^/]*passkey[^/]*$|\.mcp\.json$)/;
/** apps/ holds the user's own code (git-ignored) apart from its README. */
const USER_APPS = /^apps\/(?!README\.md$)/;

/** Pure: should a path (relative, forward slashes) be scanned when there is no git to ask? */
export function scannable(rel: string): boolean {
  if (rel.split("/").some((p) => SKIP_DIRS.has(p))) return false;
  return !SKIP_FILE.test(rel) && !USER_APPS.test(rel);
}

function walk(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) out.push(...walk(dir, r));
    } else if (scannable(r)) out.push(r);
  }
  return out;
}

export function hasGit(cwd: string = process.cwd()): boolean {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Repository files (relative paths), optionally only those matching `pattern` (e.g. /\.md$/). */
export function repoFiles(pattern?: RegExp, cwd: string = process.cwd()): string[] {
  const all = hasGit(cwd)
    ? execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd, encoding: "utf8", maxBuffer: 1 << 28 }).split("\n").filter(Boolean)
    : walk(cwd);
  return pattern ? all.filter((f) => pattern.test(f)) : all;
}
