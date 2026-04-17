/// <reference types="vite/client" />
/// <reference types="vite-plugin-pages/client-react" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
  readonly VITE_WORLD_WIZARD_ENABLED?: string;
  readonly VITE_WORLD_VIS_ENABLED?: string;
}

interface Window {
  __AI_NOVEL_RUNTIME__?: {
    mode?: "web" | "desktop";
    apiBaseUrl?: string;
    apiTimeoutMs?: number | string;
  };
}
