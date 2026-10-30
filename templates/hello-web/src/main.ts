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
    out.textContent = `failed: ${(e as Error).message}`;
  }
});
