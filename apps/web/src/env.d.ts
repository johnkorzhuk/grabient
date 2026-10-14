/** The build's id: its clock in base 36 (vite.config.ts). */
declare const __BUILD_ID__: string;
/** The address of the precise color names the build writes (scripts/color-names.ts). */
declare const __COLOR_NAMES__: string;

interface Window {
  /** the page's messages, asked for by the head as the document is read (routes/__root.tsx) */
  $catalog?: Promise<Response>;
}

declare module "virtual:i18n/catalogs" {
  /** Every translated language's catalog as JSON text: the Worker's alone. */
  const catalogs: Readonly<Partial<Record<import("@grabient/i18n").Locale, string>>>;
  export default catalogs;
}

declare module "virtual:i18n/assets" {
  /** Each translated language's catalog file, by address. */
  const urls: Readonly<Partial<Record<import("@grabient/i18n").Locale, string>>>;
  export default urls;
}
