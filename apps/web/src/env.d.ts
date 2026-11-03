/** The build's id: its clock in base 36 (vite.config.ts). */
declare const __BUILD_ID__: string;
/** The address of the precise color names the build writes (scripts/color-names.ts). */
declare const __COLOR_NAMES__: string;
/** The folder of the grain's tiles the build writes, one PNG a strength: `${__GRAIN__}/40.png` (scripts/grain.ts). */
declare const __GRAIN__: string;
/** The addresses of the effects' embed scripts the build writes (src/embed/build.ts). */
declare const __EFFECT_EMBEDS__: {
  readonly glass: string;
  readonly blob: string;
  readonly silk: string;
  readonly rosette: string;
  readonly papercut: string;
};

interface Window {
  /** the page's messages, asked for by the head as the document is read (routes/__root.tsx) */
  $catalog?: Promise<Response>;
}

declare module "virtual:i18n/catalogs" {
  /** Every translated language's catalog as JSON text under `vite dev` and in tests, the Worker's alone; empty in a
      build, whose Worker reads the catalogs' files (server/i18n.ts). */
  const catalogs: Readonly<Partial<Record<import("@grabient/i18n").Locale, string>>>;
  export default catalogs;
}

declare module "virtual:i18n/assets" {
  /** Each translated language's catalog file, by address. */
  const urls: Readonly<Partial<Record<import("@grabient/i18n").Locale, string>>>;
  export default urls;
}

declare module "*.wasm" {
  /** A WebAssembly module the Worker is deployed with, compiled before the Worker runs (the Cloudflare plugin's rule
      for .wasm). */
  const module: WebAssembly.Module;
  export default module;
}
