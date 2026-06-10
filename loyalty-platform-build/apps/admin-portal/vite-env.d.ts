/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ANALYTICS_URL: string;
  readonly VITE_TENANT_ID: string;
  readonly VITE_AUTH_MODE: 'skip' | 'b2c';
  readonly VITE_USER_ID: string;
  readonly VITE_USER_ROLE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
