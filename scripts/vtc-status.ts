// "Where do I stand?" for the app identity, with no session: the signed join status, and, once
// admitted, the member portal proof (`/v1/member/me`: role, joinedAt, personhood).
//   npm run vtc:status
import { decodeCredential, identityFromCredential } from "@buildathon/vta-client";
import { TrustTaskError, VtcClient } from "@buildathon/vtc-client";
import { die, env, reachable, refusal, vtcUrl } from "./env.js";

const cred = env("VTA_CREDENTIAL");
if (!cred) die("VTA_CREDENTIAL not set. Run `npm run up` first.");
const url = vtcUrl();
const me = identityFromCredential(decodeCredential(cred));
const vtc = await reachable("VTC", url, () => VtcClient.connect(url, me, undefined, env("VTC_DID")));
console.log(`identity  ${me.did}\ncommunity ${vtc.vtcDid}`);

try {
  const s = await vtc.joinStatus();
  console.log(`join      request ${s.requestId} is ${s.status}`);
} catch (e) {
  if (!(e instanceof TrustTaskError)) throw e;
  console.log(`join      ${refusal(e.body)}`);
}
try {
  const m = await vtc.memberProof();
  console.log(`member    yes: role=${m.role} joinedAt=${m.joinedAt} personhood=${m.personhood} (community "${m.community.name ?? "unnamed"}")`);
} catch (e) {
  if (!(e instanceof TrustTaskError)) throw e;
  console.log(`member    no (HTTP ${e.status}: ${refusal(e.body)})`);
}
