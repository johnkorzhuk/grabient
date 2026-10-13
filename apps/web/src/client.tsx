import catalogs from "virtual:i18n/assets";
import { addCatalog, DEFAULT_LOCALE, isLocale, setLocaleSource } from "@grabient/i18n";
import { hydrate } from "@solidjs/web";
import { hydrateStart, StartClient } from "@tanstack/solid-start/client";
import { watchBuild } from "./app/build-watch.ts";

/* The browser speaks the document's language, which the Worker wrote on <html lang>, and only that one: a page never
   changes language without a load. The head preloads its catalog, so waiting for it before the app starts usually
   costs nothing; a catalog that cannot be read starts the page in English rather than not at all. */
const lang = document.documentElement.lang;
const pageLocale = isLocale(lang) ? lang : DEFAULT_LOCALE;
setLocaleSource(() => pageLocale);
const catalog = catalogs[pageLocale];
if (catalog) {
  try {
    const response = await fetch(catalog);
    if (response.ok) addCatalog(pageLocale, await response.json());
  } catch {
    // English, below
  }
}

watchBuild();
const router = await hydrateStart();
hydrate(() => <StartClient router={router} />, document);
