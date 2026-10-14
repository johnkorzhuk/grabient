import catalogs from "virtual:i18n/catalogs";
import {
  addCatalogLoader,
  type Catalog,
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  setLocaleSource,
  splitLocale
} from "@grabient/i18n";
import { currentRequest } from "./request.ts";

/* The Worker speaks every language: it holds each catalog as text and parses one when a request first needs it, and
   it speaks the language of whichever request it is answering, read once from that request's address. Outside a
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

setLocaleSource(() => {
  const event = currentRequest();
  if (!event) return DEFAULT_LOCALE;
  event.locals.locale ??= splitLocale(new URL(event.request.url).pathname).locale;
  return event.locals.locale;
});
