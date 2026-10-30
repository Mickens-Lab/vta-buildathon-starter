// `npm run new`: copy a template into apps/<name> and make it its own workspace package. Pure parts are tested.
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Templates `new` can start from: name -> the command that runs the copy. */
export const STARTERS: Record<string, { run: (pkg: string) => string; what: string }> = {
  "hello-node": { run: (pkg) => `npm start -w ${pkg}`, what: "a Node script: sign in, whoami, memory put/list" },
  "hello-web": { run: (pkg) => `npm run dev -w ${pkg}`, what: "a one-button web page that calls whoami (Vite)" },
  "inbox-verifier": { run: (pkg) => `npm run demo -w ${pkg}`, what: "a server that accepts signed documents (works offline)" },
  "web-vta-app": { run: (pkg) => `npm run dev -w ${pkg}`, what: "browser app with the status panel and an optional wallet" },
};

export const APPS_DIR = "apps";
export const SCOPE = "@apps";

/** A folder-and-package-safe name: lowercase letters, digits and dashes, starting with a letter. */
export function validName(name: string | undefined): string | undefined {
  if (!name) return "give the new app a name: npm run new -- my-app --from hello-web";
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(name)) return `"${name}" is not a usable name: use lowercase letters, digits and dashes, starting with a letter (my-app).`;
  return undefined;
}

export function parseNewArgs(argv: string[]): { name?: string; from?: string } {
  const i = argv.indexOf("--from");
  const from = i >= 0 ? argv[i + 1] : undefined;
  const name = argv.find((a, j) => !a.startsWith("--") && j !== i + 1);
  return { name, from };
}

/** The package.json of the copy: new name, no `-w`-relative surprises. */
export function renamePackage(pkgJson: string, name: string): string {
  const pkg = JSON.parse(pkgJson);
  pkg.name = `${SCOPE}/${name}`;
  pkg.version = "0.0.0";
  return JSON.stringify(pkg, null, 2) + "\n";
}

/** Copy a template (skipping installed and built folders) and rename it. Returns the new package name. */
export function scaffold(root: string, from: string, name: string): string {
  const src = join(root, "templates", from);
  const dest = join(root, APPS_DIR, name);
  if (!existsSync(src)) throw new Error(`no template "${from}" (templates/${from} is missing).`);
  if (existsSync(dest)) throw new Error(`${APPS_DIR}/${name} already exists. Pick another name or delete that folder.`);
  cpSync(src, dest, { recursive: true, filter: (p) => !/(^|\/)(node_modules|dist)(\/|$)/.test(p) });
  const pj = join(dest, "package.json");
  writeFileSync(pj, renamePackage(readFileSync(pj, "utf8"), name));
  return `${SCOPE}/${name}`;
}
