/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VTA_URL?: string;
  readonly VTA_CREDENTIAL?: string;
}
declare const __VTA_BROWSER_URL__: string;
declare const __VTA_URL__: string;
declare const __FARM__: boolean;
declare const __FARM_INFO__: { id: string; name: string; portalUrl: string; issues: string[] } | null;
/** Pin from the repo-root pins.json, injected at build time. */
declare const __PIN__: { version: string; imageTag: string; portalDefault: string };
/** Optional VTC link from VTC_URL / VTC_DID in the repo-root .env. */
declare const __VTC__: { url: string; browserUrl: string; did?: string } | null;
