import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

/* What the site is built from, with each one's license, served at /licenses.md: Vite lists every package the
   browser's code bundles (build.license), and the repository's NOTICE follows, which names the fonts, drawings, code
   and data the site carries from others' work, with their license texts. */

/** The file the client's build writes the licenses to, served at the site's root. */
export const LICENSES = "licenses.md";

const NOTICE = resolve(dirname(new URL(import.meta.url).pathname), "../../../NOTICE");

/** Adds the repository's NOTICE after the packages Vite listed in the client's licenses file. */
export function licenses(): Plugin {
  return {
    name: "grabient:licenses",
    applyToEnvironment: environment => environment.name === "client",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const file = bundle[LICENSES];
        if (file?.type !== "asset")
          return this.error(`${LICENSES} was not written: set build.license`);
        const notice = readFileSync(NOTICE, "utf8").trim();
        file.source = `${String(file.source).trimEnd()}\n\n# NOTICE\n\n\`\`\`text\n${notice}\n\`\`\`\n`;
      }
    }
  };
}
