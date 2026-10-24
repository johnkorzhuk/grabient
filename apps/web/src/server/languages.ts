/* How the Worker readies a language before it writes in it: server/i18n.ts, which server.ts loads first, sets the
   way (each language's catalog read once per isolate). The integration tests' Worker loads the server modules alone,
   with no catalogs, so it readies nothing and writes in English. */
import type { Locale } from "@grabient/i18n";
import type { AssetsEnv } from "./assets.ts";

type Ready = (env: Partial<AssetsEnv>, locale: Locale) => Promise<void>;
let ready: Ready = async () => {};

export const setLocaleReadier = (readier: Ready): void => {
  ready = readier;
};

/** Readies a language: its catalog read, if this isolate has not read it, before a request or an email writes in it. */
export const readyLocale: Ready = (env, locale) => ready(env, locale);

/** Readies several languages at once: an issue's letters, one to each language its readers chose. */
export const readyLocales = (env: Partial<AssetsEnv>, locales: Iterable<Locale>) =>
  Promise.all([...new Set(locales)].map(locale => ready(env, locale)));
