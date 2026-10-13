/** The build's id: its clock in base 36 (vite.config.ts). */
declare const __BUILD_ID__: string;

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
