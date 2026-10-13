import catalogs from "virtual:i18n/assets";
import { addCatalog, DEFAULT_LOCALE, isLocale, setLocaleSource } from "@grabient/i18n";
import { hydrate } from "@solidjs/web";
import { hydrateStart, StartClient } from "@tanstack/solid-start/client";
import { watchBuild } from "./app/build-watch.ts";
import { framed } from "./app/framed.ts";
import { loadAccount } from "./features/account/session.ts";

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
/* the account loads after the page has drawn its public form: no page waits on it */
void loadAccount();
/* the service worker that opens the site with no connection, once the page has loaded: a production build's alone,
   and never in another site's frame, where the browser keeps it apart from the site's own */
if (import.meta.env.PROD && "serviceWorker" in navigator && !framed()) {
  const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => {});
  if (document.readyState === "complete") register();
  else addEventListener("load", register, { once: true });
}
