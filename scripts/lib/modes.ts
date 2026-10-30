// Which mode and whether the VTC is part of a run: pure decisions (tested), used by env.ts, up.ts and doctor.ts.
export type Mode = "local" | "tunnel" | "farm";
export type ModeSource = "flag" | "environment" | ".env" | "running stack" | "default";

/** Validate a MODE value. */
export function validMode(raw: string | undefined, where: string): Mode {
  const m = (raw ?? "local").trim();
  if (m !== "local" && m !== "tunnel" && m !== "farm") throw new Error(`MODE must be "local", "tunnel" or "farm", got "${m}". Edit ${where}.`);
  return m;
}

export interface ModeInputs {
  /** `--local` / `--tunnel` / `--farm` on this command line. */
  flag?: Mode;
  /** MODE in the process environment. */
  env?: string;
  /** MODE written in .env by the user (the kit only writes it for farm). */
  dotenv?: string;
  /** The mode of the stack that is running or has data (.vta/mode.json), written by `up`. */
  marker?: Mode | null;
  where?: string;
}

/**
 * The mode in use, strongest first: a flag for this one command, the environment, a MODE line in .env,
 * the stack that is actually there (so `down`/`hello` follow a tunnel stack without a prefix), then local.
 */
export function resolveMode(i: ModeInputs): { mode: Mode; source: ModeSource } {
  const where = i.where ?? ".env";
  if (i.flag) return { mode: i.flag, source: "flag" };
  if (i.env) return { mode: validMode(i.env, where), source: "environment" };
  if (i.dotenv) return { mode: validMode(i.dotenv, where), source: ".env" };
  if (i.marker) return { mode: i.marker, source: "running stack" };
  return { mode: "local", source: "default" };
}

export interface ParsedFlags { mode?: Mode; vtc?: boolean; rest: string[]; error?: string }

/** Pull `--local|--tunnel|--farm` and `--vtc|--no-vtc` out of argv. Two different mode flags are an error. */
export function parseModeFlags(argv: string[]): ParsedFlags {
  const out: ParsedFlags = { rest: [] };
  for (const a of argv) {
    if (a === "--local" || a === "--tunnel" || a === "--farm") {
      const m = a.slice(2) as Mode;
      if (out.mode && out.mode !== m) out.error = `${a} conflicts with --${out.mode}: pick one mode.`;
      out.mode = m;
    } else if (a === "--vtc") out.vtc = true;
    else if (a === "--no-vtc") out.vtc = false;
    else out.rest.push(a);
  }
  return out;
}

/** The VTC is on by default in every mode. `explicit` = the user said so (flag or WITH_VTC), which makes a missing VTC image an error, not a skip. */
export function resolveVtc(i: { flag?: boolean; env?: string }): { on: boolean; explicit: boolean } {
  if (i.flag !== undefined) return { on: i.flag, explicit: true };
  if (i.env === "1") return { on: true, explicit: true };
  if (i.env === "0") return { on: false, explicit: true };
  return { on: true, explicit: false };
}

/** The one line that says what a command is about to use, and why. */
export function modeLine(mode: Mode, source: ModeSource, vtc: boolean): string {
  const why = source === "flag" ? "from the flag, this run only" : source === "running stack" ? "the stack that is already there" : source === "default" ? "the default" : `from ${source}`;
  return `mode: ${mode} (${why})${mode === "farm" ? "" : `, community (VTC) ${vtc ? "on" : "off"}`}`;
}
