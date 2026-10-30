// Local security hygiene check: permissions on .env/.vta, credentials embedded in built bundles, a plaintext secrets
// backend, wide CORS, key files not git-ignored. Read-only; never prints a secret.
//   npm run security:check [-- --root <dir>] [--production]
// Exit 1 on any error; with --production, warnings (the playground's plaintext backend) fail too. See docs/SECURITY.md.
import "./lib/cli.js";
import { display, securityCheck } from "./lib/security.js";

const i = process.argv.indexOf("--root");
const root = i > 0 ? process.argv[i + 1] : ".";
const production = process.argv.includes("--production");
const { findings, scanned } = securityCheck(root);
for (const f of findings) console.log(display(root, f) + "\n");
const errors = findings.filter((f) => f.severity === "error").length;
const warns = findings.length - errors;
console.log(`security:check scanned ${scanned} files: ${errors} error(s), ${warns} warning(s).`);
if (warns && !production) console.log("Warnings are expected in the playground; run with --production to treat them as failures.");
if (!findings.length) console.log("Nothing found. That is hygiene, not safety: see docs/SECURITY.md for what this does not check.");
process.exit(errors || (production && warns) ? 1 : 0);
