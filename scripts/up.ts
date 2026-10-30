// One entry point for both modes: `npm run up`, `npm run down`.
//   MODE=local  keygen + docker compose up (VTA) + provision   [+ VTC with WITH_VTC=1]
//   MODE=farm   mint the admin key and print the portal steps; once VTA_URL is in
//               .env, provision.
import { spawnSync } from "node:child_process";
import { devBanner } from "./banner.js";
import { die, env, mode } from "./env.js";

const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, DEV_BANNER_SHOWN: "1" } });
  if (r.status !== 0) die(`\`${cmd} ${args.join(" ")}\` failed (exit ${r.status}).`);
};
const npm = (s: string) => run("npm", ["run", "--silent", s]);

const down = process.argv[2] === "down";
if (!down) devBanner();
const m = mode();
if (m === "local") {
  if (down) {
    run("docker", ["compose", "--profile", "vtc", "down"]);
  } else {
    npm("vta:keygen");
    run("docker", ["compose", ...(process.env.WITH_VTC === "1" ? ["--profile", "vtc"] : []), "up", "-d", "--wait"]);
    npm("vta:provision");
    if (process.env.WITH_VTC === "1") npm("vtc:up");
  }
} else if (down) {
  console.log("MODE=farm: nothing runs locally. Delete the agent in the VTA Farm portal if you are done.");
} else if (env("VTA_URL")?.startsWith("https://")) {
  npm("vta:keygen");
  npm("vta:provision");
} else {
  npm("farm:setup");
}
