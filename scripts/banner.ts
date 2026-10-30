// One-line reminder that everything this kit generates is for playing, not for real use.
// Skipped when CI=1 or QUIET=1. A parent script sets DEV_BANNER_SHOWN=1 so it prints once per run.
export function devBanner(): void {
  if (process.env.CI === "1" || process.env.QUIET === "1" || process.env.DEV_BANNER_SHOWN === "1") return;
  console.log("DEV ONLY - keys are stored in plaintext; do not reuse them or use them for anything real (docs/SECURITY.md).");
}
