// outside: esbuild defines the manifest's version at build time, so the bundle reads no package.json.
declare const HOVERFLY_LSP_VERSION: string;

export const VERSION = HOVERFLY_LSP_VERSION;
