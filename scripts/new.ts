// Start your own app from a template: copies it to apps/<name>, makes it a workspace package and installs.
//   npm run new -- my-app --from hello-web          # a page that calls whoami
//   npm run new -- my-app --from hello-node         # a Node script: whoami + memory put/get
//   npm run new                                     # lists the starting points
// Needs the stack up (`npm run up`) to run the result. apps/ is git-ignored: it is your code, not part of the kit.
import "./lib/cli.js";
import { spawnSync } from "node:child_process";
import { die } from "./env.js";
import { nextSteps, parseNewArgs, scaffold, STARTERS, validName } from "./lib/scaffold.js";

const { name, from } = parseNewArgs(process.argv.slice(2));
if (!name && !from) {
  console.log("Starting points (npm run new -- <name> --from <template>):");
  for (const [k, v] of Object.entries(STARTERS)) console.log(`  ${k.padEnd(15)} ${v.what}`);
  process.exit(0);
}
const bad = validName(name);
if (bad) die(bad);
const starter = from ? STARTERS[from] : undefined;
if (!from || !starter) die(`--from must be one of: ${Object.keys(STARTERS).join(", ")}.`);
let pkg: string;
try {
  pkg = scaffold(process.cwd(), from, name!);
} catch (e) {
  die((e as Error).message);
}
console.log(`created apps/${name} from templates/${from} (package ${pkg}); installing...`);
const r = spawnSync("npm", ["install", "--no-package-lock", "--no-audit", "--no-fund", "--prefer-offline"], { stdio: "inherit", timeout: 300_000 });
if (r.status !== 0) die(`npm install failed. Try it by hand: npm install --no-package-lock (the copy is in apps/${name}).`);
console.log(nextSteps(from, name!, pkg));
