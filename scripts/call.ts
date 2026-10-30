// Call any Trust Task on your VTA as your app identity and print the reply or the refusal.
//   npm run vta:call                                  # list the tasks this VTA serves
//   npm run vta:call -- vta/contexts/list/1.0         # a slug under https://trusttasks.org/spec/ (or a full URI)
//   npm run vta:call -- vta/memory/put/0.1 '{"key":"k","value":"v"}'
import "./lib/cli.js";
import { TrustTaskError, TT, VtaClient } from "@buildathon/vta-client";
import { die, env, mode, reachable } from "./env.js";
import { parseJsonArg } from "./lib/cli.js";

const cred = env("VTA_CREDENTIAL");
if (!cred) die("no VTA_CREDENTIAL in .env. Run `npm run up` first.");
const vta = await reachable("VTA", env("VTA_URL") ?? "the VTA", () => VtaClient.fromCredential(cred, env("VTA_URL"), undefined, { resolveDid: mode() !== "farm" }));
await vta.authenticate();
const [slug, json] = process.argv.slice(2);
if (!slug) {
  const tasks = await vta.discover();
  console.log(`${tasks.length} Trust Tasks served (pass one as the first argument):`);
  for (const t of tasks) console.log("  " + t.replace(`${TT}/`, ""));
} else {
  const type = slug.startsWith("http") ? slug : `${TT}/${slug}`;
  let payload: Record<string, unknown> = {};
  if (json) {
    const parsed = parseJsonArg(json, "the payload");
    if (!parsed.ok) die(parsed.message);
    payload = parsed.value as Record<string, unknown>;
  }
  try {
    console.log(JSON.stringify(await vta.call(type, payload), null, 2));
  } catch (e) {
    if (!(e instanceof TrustTaskError)) throw e;
    const p = (e.body as any)?.payload;
    console.log(`refused (HTTP ${e.status}): ${p?.code ?? "?"}: ${p?.message ?? JSON.stringify(e.body)}`);
    process.exitCode = 1;
  }
}
