// Live check: a did:peer:2 applicant receives its credential over TSP with NO ping or relationship invite first.
//   npm run tsp:peer-push        (MODE=tunnel stack with the VTC up: npm run up -- --tunnel)
// The did:peer is the tunnel-mode default applicant; this script forces it (VTC_APPLICANT=did:peer for its children) even if
// .env says VTC_APPLICANT=did:key. Steps: start `tsp:listen` (no relate), `vtc:join`, `vtc:approve`, then wait (bounded, 150 s) for
// credential-exchange/issue frames, and print the join status's credentialsDelivered with what it means (it stays false: it
// reports the member's own credential sent back, not frame arrival). Skips with exit 0 when no tunnel stack is up
// (REQUIRE_STACK=1 makes that a failure). Optional: not part of `npm test`. Approves EVERY pending request (vtc:approve).
import "./lib/cli.js";
import { spawn, spawnSync } from "node:child_process";
import { readTunnel } from "./lib/compose.js";
import { skip, stackProblem } from "./lib/live.js";
import { env, mode } from "./env.js";

if (mode() !== "tunnel") skip("tsp:peer-push", `MODE=${mode()}: a did:peer applicant needs MODE=tunnel (npm run up -- --tunnel).`);
const problem = await stackProblem();
if (problem) skip("tsp:peer-push", problem);
if (!readTunnel()?.mediatorDid || !env("VTC_URL")) skip("tsp:peer-push", "no mediator DID in .vta/tunnel.json or no VTC_URL; bring the tunnel stack up with the VTC.");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const childEnv = { ...process.env, VTC_APPLICANT: "did:peer" };
const run = (args: string[], timeoutMs: number) => {
  const r = spawnSync(npm, ["run", "-s", ...args], { encoding: "utf8", timeout: timeoutMs, env: childEnv });
  process.stdout.write(r.stdout ?? ""); process.stderr.write(r.stderr ?? "");
  if (r.status !== 0) throw new Error(`npm run ${args.join(" ")} exited ${r.status ?? r.signal}`);
  return r.stdout ?? "";
};

console.log("1/4 listener as the did:peer, no invite");
const listener = spawn(npm, ["run", "-s", "tsp:listen", "--", "--seconds", "150", "--until-issue", "2"], { stdio: ["ignore", "pipe", "inherit"], env: childEnv });
let out = "";
const listening = new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("the listener did not connect within 60 s")), 60_000);
  listener.stdout.on("data", (b: Buffer) => { const s = b.toString(); out += s; process.stdout.write(s.replace(/^/gm, "  [listen] ")); if (out.includes("listening for")) { clearTimeout(t); resolve(); } });
  listener.on("exit", (code) => { clearTimeout(t); reject(new Error(`the listener exited (${code}) before it was listening`)); });
});
const exited = new Promise<number>((r) => listener.on("exit", (code) => r(code ?? 1)));
try {
  await listening;
  console.log("2/4 apply as the did:peer");
  const joined = run(["vtc:join"], 60_000);
  if (!/^applicant did:peer:2\./m.test(joined)) throw new Error("vtc:join did not apply as the did:peer (see its note above for why)");
  console.log("3/4 approve");
  run(["vtc:approve"], 60_000);
  console.log("4/4 wait for the frames (up to 150 s)");
  const code = await exited;
  const status = run(["vtc:join"], 60_000);
  const delivered = /"credentialsDelivered":(true|false)/.exec(status)?.[1];
  console.log(`join status credentialsDelivered: ${delivered ?? "(not reported)"}; that flag reports the member's own credential sent back, not frame arrival.`);
  console.log(code === 0 ? "PASS: the credential reached the did:peer over TSP with no earlier contact." : "FAIL: no credential frame reached the did:peer (see the listener's last line).");
  process.exit(code === 0 ? 0 : 1);
} catch (e) {
  listener.kill();
  console.error(`tsp:peer-push: ${(e as Error).message}`);
  process.exit(1);
}
