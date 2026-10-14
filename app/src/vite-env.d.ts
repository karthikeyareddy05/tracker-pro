/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Base URL of the Tracker Pro API, e.g. https://tracker-pro.onrender.com. Empty = same origin. */
  readonly VITE_API_BASE_URL?: string;
  /** "1" builds the offline test-accounts variant (no server). */
  readonly VITE_TEST_ACCOUNTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
