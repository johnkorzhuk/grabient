import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

/* What the site is built from, with each one's license, served at /licenses.md: Vite lists every package the
   browser's code bundles (build.license), and the files the site serves from others' work follow it, each under its
   own license. The repository's NOTICE names them too. */

/** The file the client's build writes the licenses to, served at the site's root. */
export const LICENSES = "licenses.md";

const require = createRequire(import.meta.url);
const here = dirname(new URL(import.meta.url).pathname);
const packageOf = (name: string) => {
  const dir = dirname(require.resolve(`${name}/package.json`));
  const { version, license } = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")) as {
    version: string;
    license: string;
  };
  return { version, license, text: readFileSync(resolve(dir, "LICENSE"), "utf8").trim() };
};

function dataNotices(): string {
  const names = packageOf("color-name-list");
  const cldr = readFileSync(resolve(here, "search/cldr-license.txt"), "utf8").trim();
  return [
    "# Data and fonts",
    "",
    "The site also serves files made from others' work.",
    "",
    "## Poppins",
    "",
    "The typeface the site is set in, served under /fonts/ beside its license (/fonts/OFL.txt).",
    "Copyright 2020 The Poppins Project Authors (https://github.com/itfoundry/Poppins), under the SIL Open Font",
    "License, Version 1.1.",
    "",
    `## color-name-list - ${names.version}`,
    "",
    "The precise color names in swatch files and palette files, from David Aerne's Color Names",
    `(https://github.com/meodai/color-name-list), under the ${names.license} License:`,
    "",
    "```",
    names.text,
    "```",
    "",
    "## Unicode CLDR annotations - 48.0.0",
    "",
    "The search's words for emoji are chosen with Unicode's names and keywords for them (CLDR annotations, English):",
    "",
    "```",
    cldr,
    "```",
    "",
    "## XKCD color survey",
    "",
    "Some color words the search knows come from Randall Munroe's XKCD color survey, in the public domain (CC0)."
  ].join("\n");
}

/** Adds the data files' notices after the packages Vite listed in the client's licenses file. */
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
        file.source = `${String(file.source).trimEnd()}\n\n${dataNotices()}\n`;
      }
    }
  };
}
