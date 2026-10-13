import catalogs from "virtual:i18n/assets";
import { addCatalog, DEFAULT_LOCALE, isLocale, setLocaleSource } from "@grabient/i18n";
import { syncMotion } from "@grabient/ui/motion.ts";
import { syncTheme } from "@grabient/ui/theme.ts";
import { hydrate } from "@solidjs/web";
import { hydrateStart, StartClient } from "@tanstack/solid-start/client";
import { watchBuild } from "./app/build-watch.ts";
import { installErrorReports, reportCaught } from "./app/error-report.ts";
import { initializeAnalytics } from "./features/analytics/analytics.ts";

/* before anything can fail: an error while the page loads its language or hydrates is reported too */
installErrorReports();

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
/* a page's boundary showing its fallback is the one failure the window never hears of: it is reported from here */
hydrate(() => <StartClient router={router} />, document, { onError: reportCaught });
/* the theme and motion signals start at the server's values so the page hydrates as it was sent; now the page's own */
syncTheme();
syncMotion();
initializeAnalytics();
