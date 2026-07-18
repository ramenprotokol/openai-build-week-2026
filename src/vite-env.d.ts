/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STATIC_REPLAY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
