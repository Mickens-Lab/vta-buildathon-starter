// Print who can call what, for stranger / applicant / member / admin. Guidance only: reads docs/VTC-SURFACE.md,
// needs no stack and no network.   npm run roles:matrix [-- --full]
import { readFileSync } from "node:fs";
import { formatMatrix, parseMatrix } from "./lib/matrix.js";

const rows = parseMatrix(readFileSync(new URL("../docs/VTC-SURFACE.md", import.meta.url), "utf8"));
console.log("Who can call what at the VTC (from docs/VTC-SURFACE.md; observed on one local run, see the doc for caveats)\n");
console.log(formatMatrix(rows));
console.log("\nOK = answered; refused = permission denied or no entry; notFound / notMember = reached the handler, nothing to act on;");
console.log("- = not applicable; untried = not exercised; anything else is the first word of the doc cell (use --full). The server decides: render from this, handle refusals anyway.");
if (process.argv.includes("--full")) {
  console.log("");
  for (const r of rows) {
    console.log(r.operation);
    for (const p of ["stranger", "applicant", "member", "admin"] as const) console.log(`  ${p.padEnd(10)} ${r.cells[p].text}`);
  }
}
