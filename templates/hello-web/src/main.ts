import { VtaClient } from "@buildathon/vta-client";

declare const __CRED__: { credential: string; url: string; context: string };
const out = document.getElementById("out")!;

document.getElementById("go")!.addEventListener("click", async () => {
  out.textContent = "calling...";
  try {
    if (!__CRED__.credential) throw new Error("no VTA_CREDENTIAL: run `npm run up` at the repo root, then restart this dev server.");
    const vta = await VtaClient.fromCredential(__CRED__.credential, __CRED__.url);
    await vta.authenticate();
    out.textContent = JSON.stringify({ me: vta.me.did, whoami: await vta.whoami() }, null, 2);
  } catch (e) {
    const msg = (e as Error).message;
    // A browser reports a blocked cross-origin call (this page's origin is not in the VTA's CORS list) or an unreachable VTA as the same bare fetch error.
    const hint = e instanceof TypeError
      ? `\n\nThe browser could not reach ${__CRED__.url} from ${location.origin}. Is the stack up (\`npm run doctor\`)? The VTA only allows the origins http://localhost:5173, :3000 and :8000, so this page must be served from one of them.`
      : "";
    out.textContent = `failed: ${msg}${hint}`;
  }
});
