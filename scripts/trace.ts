// Show what the clients did: every signed task from the CLI scripts, the REPL and the apps that ran with TRACE=1.
//   TRACE=1 npm run hello         # record
//   npm run trace                 # the last 40 calls, one line each
//   npm run trace -- --follow     # keep printing as new calls arrive (Ctrl-C to stop)
//   npm run trace -- --json -n 0  # raw JSON lines, all of them
//   npm run trace -- --clear      # delete the log
// A line: time, client (vta|vtc|tsp), transport, task, outcome, duration, who -> to, document id. Payloads and keys are never logged.
import "./lib/cli.js";
import { createReadStream, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { formatTrace, lastN, parseTrace, TRACE_FILE } from "./lib/trace.js";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const nArg = args.indexOf("-n");
const count = nArg >= 0 ? Number(args[nArg + 1]) : 40;
if (flag("clear")) {
  rmSync(TRACE_FILE, { force: true });
  console.log(`deleted ${TRACE_FILE}`);
  process.exit(0);
}
const show = (text: string) => {
  for (const e of parseTrace(text)) console.log(flag("json") ? JSON.stringify(e) : formatTrace(e));
};
if (!existsSync(TRACE_FILE) && !flag("follow")) {
  console.log(`no trace yet (${TRACE_FILE}). Record one: TRACE=1 npm run hello   then   npm run trace`);
  process.exit(0);
}
let pos = 0;
if (existsSync(TRACE_FILE)) {
  const text = readFileSync(TRACE_FILE, "utf8");
  pos = Buffer.byteLength(text);
  const events = lastN(parseTrace(text), Number.isFinite(count) ? count : 40);
  for (const e of events) console.log(flag("json") ? JSON.stringify(e) : formatTrace(e));
}
if (flag("follow")) {
  console.log(`-- following ${TRACE_FILE} --`);
  setInterval(() => {
    if (!existsSync(TRACE_FILE)) { pos = 0; return; }
    const size = statSync(TRACE_FILE).size;
    if (size < pos) pos = 0;
    if (size === pos) return;
    let chunk = "";
    const s = createReadStream(TRACE_FILE, { start: pos, end: size - 1, encoding: "utf8" });
    pos = size;
    s.on("data", (d) => { chunk += d; });
    s.on("end", () => show(chunk));
  }, 500);
}
