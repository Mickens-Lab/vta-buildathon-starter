// Browser check of the TSP ping page against your MODE=tunnel stack: `npm run tsp:ping:browser [-- --shot file.png]`.
// Starts the page with Vite on :3000, opens headless Chromium, clicks "Send ping" and reports what the page says.
// The mediator must allow http://localhost:3000 (start the stack with MEDIATOR_CORS_ALLOW_ORIGIN=http://localhost:3000).
// Optional: not part of `npm test`. Exit 0 only if the page showed a genuine pong.
import "./lib/cli.js";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { Browser, findChrome, tmpProfile } from "./lib/cdp.js";
import { sleep } from "./lib/live.js";

const root = resolve(import.meta.dirname, "..");
const PORT = 3000;
const BASE = `http://localhost:${PORT}`;
const shotAt = process.argv.indexOf("--shot");
const shot = shotAt > 0 ? resolve(process.argv[shotAt + 1]) : undefined;

const chrome = findChrome();
if (!chrome) { console.error("no Chrome/Chromium found (set CHROME=/path/to/chrome)"); process.exit(2); }
const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: join(root, "templates/tsp-ping"), stdio: "ignore", detached: true });
const stop = () => { try { if (vite.pid) process.kill(-vite.pid, "SIGTERM"); } catch { /* gone */ } };
const profile = tmpProfile();
let b: Browser | undefined;
let code = 1;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* starting */ } await sleep(500); }
  b = await Browser.launch(chrome, profile.dir);
  await b.goto(BASE);
  await b.waitFor(`document.getElementById('vta').value.startsWith('did:')`, 10_000, "form prefilled from .vta/tunnel.json and .env");
  await b.click("Send ping");
  await b.waitFor(`/^(pong|No pong)/.test(document.getElementById('verdict').textContent)`, 60_000, "a verdict");
  const verdict: string = await b.eval(`document.getElementById('verdict').textContent`);
  const log: string = await b.eval(`document.getElementById('log').textContent`);
  console.log(`page log:\n${log}\nverdict: ${verdict}`);
  if (shot) await b.screenshot(shot);
  code = verdict.startsWith("pong") ? 0 : 1;
} catch (e) {
  console.error(`tsp:ping:browser: ${(e as Error).message}`);
} finally {
  await b?.close();
  profile.remove();
  stop();
}
process.exit(code);
