/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VTA_CREDENTIAL?: string;
  readonly VTC_DID?: string;
}
declare const __VTA_BROWSER_URL__: string;
declare const __VTA_URL__: string;
declare const __VTC_BROWSER_URL__: string;
declare const __VTC_URL__: string;
declare const __FARM__: boolean;
declare const __TUNNEL__: boolean;
declare const __APPLICANT__: "did:key" | "did:peer";
declare const __MEDIATOR_DID__: string | null;
declare const __FARM_INFO__: { id: string; name: string; portalUrl: string; issues?: string[] } | null;
declare const __PIN__: { version: string; imageTag: string; portalDefault?: string };
