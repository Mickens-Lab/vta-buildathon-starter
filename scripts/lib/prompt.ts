// A y/N question for interactive terminals. Never blocks a script that has no terminal: it returns the default.
import { createInterface } from "node:readline/promises";

export const interactive = (): boolean => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** Ask `question [y/N]`. Without a terminal (CI, a pipe) nothing is asked and the answer is `no`. */
export async function confirm(question: string): Promise<boolean> {
  if (!interactive()) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}
