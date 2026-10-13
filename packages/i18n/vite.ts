import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { DEFAULT_LOCALE, isLocale, LOCALE_INFO, LOCALES, type Locale } from "./src/locales.ts";
import { messageKey } from "./src/message-key.ts";

/* The catalogs as the app ships them. messages/<tag>.json keeps a language's translations keyed by the English, for
   people and review; the build turns each into a catalog keyed by messageKey(English), holding only messages the code
   still says (messages/en.json).
     virtual:i18n/catalogs  every catalog as JSON text, for the Worker, which parses one when a request first needs it.
                            The browser's build refuses it.
     virtual:i18n/assets    each catalog's address, for the head's preload and the browser's fetch:
                            /assets/i18n-<segment>-<hash>.json, content-hashed, so it is cached for good like the build's
                            other assets. Development serves them fresh from /@i18n/<tag>.json.
   A language whose file is missing ships an empty catalog and reads in English. */

const MESSAGES = fileURLToPath(new URL("./messages/", import.meta.url));
const CATALOGS_ID = "virtual:i18n/catalogs";
const ASSETS_ID = "virtual:i18n/assets";

export interface CatalogFile {
  fileName: string;
  /** the catalog as the JSON text that ships */
  source: string;
}

function readJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`i18n: ${file} is not valid JSON: ${(error as Error).message}`);
  }
}

/** Every translated language's catalog from the files as they are now. Refuses two messages that share a key. */
export function buildCatalogs(dir = MESSAGES): Map<Locale, CatalogFile> {
  const english = readJson(`${dir}en.json`);
  const used = Object.keys(english).length ? new Set(Object.keys(english)) : null;
  const owners = new Map<string, string>();
  const files = new Map<Locale, CatalogFile>();
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const translations = readJson(`${dir}${locale}.json`);
    const catalog: Record<string, string> = {};
    for (const message of Object.keys(translations).sort()) {
      const text = translations[message];
      if (typeof text !== "string" || !text || (used && !used.has(message))) continue;
      const key = messageKey(message);
      const owner = owners.get(key);
      if (owner !== undefined && owner !== message) {
        throw new Error(
          `i18n: ${JSON.stringify(owner)} and ${JSON.stringify(message)} share the key ${key}. Reword one.`
        );
      }
      owners.set(key, message);
      catalog[key] = text;
    }
    const source = JSON.stringify(catalog);
    const hash = createHash("sha256").update(source).digest("hex").slice(0, 10);
    files.set(locale, {
      fileName: `assets/i18n-${LOCALE_INFO[locale].segment}-${hash}.json`,
      source
    });
  }
  return files;
}

export function i18n(): Plugin {
  let dev = false;
  let built: Map<Locale, CatalogFile> | undefined;
  const files = () => {
    built ??= buildCatalogs();
    return built;
  };
  return {
    name: "grabient:i18n",
    configResolved(config) {
      dev = config.command === "serve";
    },
    buildStart() {
      built = undefined;
      for (const file of readdirSync(MESSAGES)) {
        if (file.endsWith(".json")) this.addWatchFile(MESSAGES + file);
      }
    },
    resolveId(id) {
      if (id === CATALOGS_ID || id === ASSETS_ID) return `\0${id}`;
    },
    load(id) {
      if (id === `\0${CATALOGS_ID}`) {
        if (this.environment.name === "client") {
          this.error(
            `${CATALOGS_ID} holds every language and is the Worker's alone; the browser reads ${ASSETS_ID}.`
          );
        }
        const sources = Object.fromEntries(
          [...files()].map(([locale, file]) => [locale, file.source])
        );
        return `export default ${JSON.stringify(sources)};`;
      }
      if (id === `\0${ASSETS_ID}`) {
        const urls = Object.fromEntries(
          [...files()].map(([locale, file]) => [
            locale,
            dev ? `/@i18n/${locale}.json` : `/${file.fileName}`
          ])
        );
        return `export default ${JSON.stringify(urls)};`;
      }
    },
    generateBundle() {
      if (this.environment.name !== "client") return;
      for (const file of files().values()) {
        this.emitFile({ type: "asset", fileName: file.fileName, source: file.source });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const tag = /^\/@i18n\/([A-Za-z-]+)\.json$/.exec(req.url ?? "")?.[1];
        if (!isLocale(tag)) return next();
        built = undefined;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(files().get(tag)?.source ?? "{}");
      });
      server.watcher.add(MESSAGES);
      server.watcher.on("change", file => {
        if (!file.startsWith(MESSAGES)) return;
        built = undefined;
        for (const environment of Object.values(server.environments)) {
          for (const id of [`\0${CATALOGS_ID}`, `\0${ASSETS_ID}`]) {
            const module = environment.moduleGraph.getModuleById(id);
            if (module) environment.moduleGraph.invalidateModule(module);
          }
        }
      });
    }
  };
}
