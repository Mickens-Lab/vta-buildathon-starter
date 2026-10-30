// Local security hygiene checks for a starter tree. Reports; never modifies anything and never prints a secret value.
//   npm run security:check [-- --root <dir>] [--production]
// error = fix it now. warn = expected in the playground (plaintext secrets backend); --production makes warnings fail.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type Severity = "error" | "warn";
export interface Finding { rule: "permissions" | "bundle-credential" | "plaintext-secrets" | "wide-cors" | "not-ignored"; severity: Severity; file: string; message: string; fix: string }

const SKIP_DIRS = new Set(["node_modules", ".git"]);
const BUNDLE_DIRS = new Set(["dist", "build"]);
const BUNDLE_FILE = /\.(js|mjs|cjs|html|map|css|json)$/;
const CONFIG_FILE = /(\.toml|\.sh|\.ya?ml|\.json|\.conf|\.cfg)$|(^|\/)\.env[\w.-]*$/;
const MAX_BYTES = 8 << 20;

function walk(root: string, dir: string, out: string[], depth = 0): void {
  if (depth > 6) return;
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(root, rel, out, depth + 1); }
    else if (e.isFile()) out.push(rel);
  }
}

const readText = (p: string): string | undefined => {
  try { return statSync(p).size > MAX_BYTES ? undefined : readFileSync(p, "utf8"); } catch { return undefined; }
};
const inBundleDir = (rel: string) => rel.split("/").some((s) => BUNDLE_DIRS.has(s));
const isEnvFile = (rel: string) => /(^|\/)\.env[\w.-]*$/.test(rel);
const isVtaDir = (rel: string) => rel === ".vta" || rel.startsWith(".vta/") || rel.includes("/.vta/");

/** Secret values the tree itself holds (credentials in env files, keys in .vta), used to look for them inside bundles. */
function knownSecrets(root: string, files: string[]): string[] {
  const secrets = new Set<string>();
  for (const rel of files) {
    if (!isEnvFile(rel) && !(isVtaDir(rel) && /\.(json|env)$/.test(rel))) continue;
    const text = readText(join(root, rel));
    if (!text) continue;
    for (const m of text.matchAll(/^VTA_CREDENTIAL=(\S{40,})$/gm)) secrets.add(m[1]);
    for (const m of text.matchAll(/"privateKeyMultibase"\s*:\s*"(z[1-9A-HJ-NP-Za-km-z]{40,})"/g)) secrets.add(m[1]);
  }
  return [...secrets];
}

/** A token that decodes to JSON carrying a private key (the shape of a credential bundle), whatever its value. */
function credentialShaped(text: string): boolean {
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{60,}/g)) {
    try {
      const json = Buffer.from(m[0], "base64url").toString("utf8");
      if (json.includes("privateKeyMultibase")) return true;
    } catch { /* not base64 */ }
  }
  return /privateKeyMultibase["']?\s*[:=]\s*["']z[1-9A-HJ-NP-Za-km-z]{40,}/.test(text);
}

export function securityCheck(root: string): { findings: Finding[]; scanned: number } {
  const files: string[] = [];
  walk(root, "", files);
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);
  const secrets = knownSecrets(root, files);

  for (const rel of files) {
    const abs = join(root, rel);
    // 1. Permissions on files that hold keys.
    if (isEnvFile(rel) || isVtaDir(rel)) {
      const mode = statSync(abs).mode & 0o777;
      if (mode & 0o077) add({ rule: "permissions", severity: "error", file: rel, message: `mode ${mode.toString(8)}: readable by group or others, and it holds secrets`, fix: `chmod 600 ${rel}` });
    }
    // 2. A credential or key inside built output.
    if (inBundleDir(rel) && BUNDLE_FILE.test(rel)) {
      const text = readText(abs);
      if (text && (secrets.some((s) => text.includes(s)) || credentialShaped(text))) {
        add({ rule: "bundle-credential", severity: "error", file: rel, message: "a credential or private key is embedded in built output; anyone who can load or download it can act as that identity", fix: "do not deploy this build; keep the key on a backend (docs/SECURITY.md, level 1) and rebuild without VTA_CREDENTIAL in the environment" });
      }
    }
    if (inBundleDir(rel) || !CONFIG_FILE.test(rel)) continue;
    const text = readText(abs);
    if (!text) continue;
    text.split("\n").forEach((line, i) => {
      const at = `${rel}:${i + 1}`;
      if (/^\s*#/.test(line)) return;
      // 3. A plaintext secrets backend (the playground default; fine to learn with, not to run).
      if (/\bbackend\s*=\s*["']plaintext["']/.test(line)) {
        add({ rule: "plaintext-secrets", severity: "warn", file: at, message: "secrets backend is plaintext: the seed (every key the service derives) sits unencrypted on disk", fix: "use an encrypted or OS/cloud-backed secrets backend before real use (docs/SECURITY.md, level 5; backend options are unverified here)" });
      }
      // 4. A CORS allow-list that admits every origin.
      if (/(cors[\w]*origins?|allowed_origins|access-control-allow-origin)\b[^\n]*?(["']\*["']|[:=]\s*\*)/i.test(line)) {
        add({ rule: "wide-cors", severity: "error", file: at, message: "CORS admits every origin (*)", fix: "list the exact origins your page is served from" });
      }
    });
  }

  // 5. Key files that git would pick up.
  if (existsSync(join(root, ".git"))) {
    for (const rel of files.filter((f) => isEnvFile(f) || f === ".vta/admin.json")) {
      try {
        execFileSync("git", ["-C", root, "check-ignore", "-q", rel], { stdio: "ignore" });
      } catch (e) {
        if ((e as { status?: number }).status === 1) add({ rule: "not-ignored", severity: "error", file: rel, message: "holds secrets and is not git-ignored", fix: `add ${rel.startsWith(".vta") ? ".vta/" : ".env*"} to .gitignore` });
      }
    }
  }
  return { findings, scanned: files.length };
}

export const display = (root: string, f: Finding) => `[${f.severity}] ${f.rule}  ${f.file.startsWith("/") ? relative(root, f.file) : f.file}\n        ${f.message}\n        fix: ${f.fix}`;
