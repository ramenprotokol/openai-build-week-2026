/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STATIC_REPLAY?: string;
  readonly VITE_REAL_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
