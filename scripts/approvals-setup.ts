// Mint the throwaway software approver (a second did:key) BEFORE the VTA first boots, and tell compose about it.
// The VTA entrypoint then seeds a consent rule (docs/APPROVALS.md). If a stack already exists, run `npm run reset` (it also deletes this key), THEN this script:
// the seed is applied once, on a volume's first boot.
import "./lib/cli.js";
import { existsSync } from "node:fs";
import { newIdentity } from "@buildathon/vta-client";
import { devBanner } from "./banner.js";
import { die, mode, updateEnv } from "./env.js";
import { APPROVER_FILE, saveApprover } from "./lib/approver.js";

devBanner();
if (mode() === "farm") die("the approvals demo needs your own VTA (MODE=local or MODE=tunnel); a hosted VTA is configured in its portal. See docs/APPROVALS.md.");
if (existsSync(APPROVER_FILE) && !process.argv.includes("--new")) {
  console.log(`${APPROVER_FILE} exists; keeping it (use --new for a fresh approver).`);
} else {
  saveApprover(newIdentity());
}
const { did } = (await import("./lib/approver.js")).loadApprover();
updateEnv({ APPROVER_DID: did });
console.log(`approver DID: ${did}`);
console.log(`wrote ${APPROVER_FILE} (private key, git-ignored) and APPROVER_DID to .env`);
console.log("next: npm run up (on a fresh stack: after `npm run reset` if one exists), then npm run approvals:demo");
