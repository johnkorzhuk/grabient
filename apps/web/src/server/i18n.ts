import files from "virtual:i18n/assets";
import catalogs from "virtual:i18n/catalogs";
import {
  addCatalog,
  addCatalogLoader,
  type Catalog,
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  setLocaleSource,
  splitLocale
} from "@grabient/i18n";
import { type AssetsEnv, asset, once } from "./assets.ts";
import { setLocaleReadier } from "./languages.ts";
import { currentRequest } from "./request.ts";

/* The Worker speaks every language and holds none from its start: a language's catalog is the file the build writes
   for the browser, read through the ASSETS binding the first time an isolate needs that language and kept for the
   isolate's life, so a language or a message more costs the Worker's start nothing. A request waits for its own
   language before it is answered (pipeline.ts), and an email for its reader's; a catalog that cannot be read leaves
   that one request in English, and the next tries again. Under `vite dev` and in tests the catalogs come with this
   module instead, parsed when a request first needs one.

   It speaks the language of whichever request it is answering, read once from that request's address. Outside a
   request (a scheduled job) it is English. Imported by server.ts before anything renders. */

declare module "@solidjs/web" {
  interface RequestEventLocals {
    /** the request's language, from its address */
    locale?: Locale;
  }
}

for (const [locale, json] of Object.entries(catalogs)) {
  if (isLocale(locale) && json) addCatalogLoader(locale, () => JSON.parse(json) as Catalog);
}

const reads = new Map<Locale, (env: AssetsEnv) => Promise<Catalog | null>>();
const held = new Set<Locale>();

/** Readies a language for this isolate: at once for English, a language held already or one this module carries. */
async function readyLocale(env: Partial<AssetsEnv>, locale: Locale): Promise<void> {
  const path = files[locale];
  if (locale === DEFAULT_LOCALE || held.has(locale) || catalogs[locale] || !path || !env.ASSETS) {
    return;
  }
  let read = reads.get(locale);
  if (!read) {
    read = once(async assets => JSON.parse(await (await asset(assets, path)).text()) as Catalog);
    reads.set(locale, read);
  }
  const catalog = await read({ ASSETS: env.ASSETS });
  if (!catalog) {
    console.error(`i18n: the ${locale} catalog was not read; this answer is in English`);
    return;
  }
  addCatalog(locale, catalog);
  held.add(locale);
}

setLocaleReadier(readyLocale);

setLocaleSource(() => {
  const event = currentRequest();
  if (!event) return DEFAULT_LOCALE;
  event.locals.locale ??= splitLocale(new URL(event.request.url).pathname).locale;
  return event.locals.locale;
});
