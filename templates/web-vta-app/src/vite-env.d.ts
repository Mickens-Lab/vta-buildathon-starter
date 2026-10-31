/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VTA_URL?: string;
  readonly VTA_CREDENTIAL?: string;
}
declare const __VTA_BROWSER_URL__: string;
declare const __VTA_URL__: string;
declare const __FARM__: boolean;
declare const __TUNNEL__: boolean;
/** VTC_APPLICANT from the repo-root .env ("" = unset: the mode decides). */
declare const __APPLICANT__: "did:key" | "did:peer" | "";
/** The running tunnel stack's mediator DID (.vta/tunnel.json); null outside tunnel mode or with no stack. */
declare const __MEDIATOR_DID__: string | null;
declare const __FARM_INFO__: { id: string; name: string; portalUrl: string; issues: string[] } | null;
/** Pin from the repo-root pins.json, injected at build time. */
declare const __PIN__: { version: string; imageTag: string; portalDefault: string };
/** Optional VTC link from VTC_URL / VTC_DID in the repo-root .env. */
declare const __VTC__: { url: string; browserUrl: string; did?: string } | null;
