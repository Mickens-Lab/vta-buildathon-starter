// Shared command-line behaviour for every runnable script. Import it FIRST (`import "./lib/cli.js";`):
//   --help / -h  prints the script's own header comment and exits, so `npm run hello -- --help` never runs hello
//   TRACE=1      appends every client call to .vta/trace.jsonl
//   EPIPE        `npm run vta:call | head` ends quietly instead of crashing
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The leading `//` comment block of a script's source, without the slashes (a shebang is skipped). */
export function helpText(source: string): string {
  const lines = source.split("\n");
  let i = lines[0]?.startsWith("#!") ? 1 : 0;
  const out: string[] = [];
  for (; i < lines.length && lines[i].startsWith("//"); i++) out.push(lines[i].replace(/^\/\/ ?/, ""));
  return out.join("\n").trimEnd();
}

export const wantsHelp = (args: string[]): boolean => args.includes("--help") || args.includes("-h");

/** Parse JSON typed on a command line; the failure message explains the usual shell-quoting mistake. */
export function parseJsonArg(raw: string, what = "the JSON argument"): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return {
      ok: false,
      message: `${what} is not valid JSON (${(e as Error).message}). Put it in single quotes and use double quotes inside: '{"key":"value"}'. Received: ${raw.length > 60 ? raw.slice(0, 60) + "..." : raw}`,
    };
  }
}

// TRACE=1: log every call any client makes to .vta/trace.jsonl (read it with `npm run trace`).
if (process.env.TRACE === "1") {
  const { installTrace } = await import("./trace.js");
  installTrace();
}

process.stdout.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

const script = process.argv[1];
if (script && wantsHelp(process.argv.slice(2))) {
  try {
    const text = helpText(readFileSync(script.startsWith("file:") ? fileURLToPath(script) : script, "utf8"));
    if (text) {
      console.log(text);
      process.exit(0);
    }
  } catch {
    /* no source to read: fall through and run normally */
  }
}
