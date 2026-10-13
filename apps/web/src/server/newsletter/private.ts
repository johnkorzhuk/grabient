import type { Issue } from "@grabient/email";
import type { Plugin } from "vite";
import { ISSUES } from "./issues/index.ts";

/* A draft is an admin's alone. The issues live under src/server, which the browser's build may not import; this check
   holds the line when an import slips past that rule some other way: the browser's build fails if any file it writes
   holds a draft's subject or title, the words nothing else on the site says. */

/** What each draft says that nothing else on the site does. */
export const draftWords = (issues: readonly Issue[] = ISSUES): string[] =>
  issues
    .filter(issue => !issue.published)
    .flatMap(issue => {
      const words = issue.write("https://grabient.com");
      return [words.subject, words.title];
    });

/** Each file, among those given as name and text, that holds a draft's words, with the words. */
export const leaks = (files: Iterable<readonly [string, string]>, words = draftWords()): string[] =>
  [...files].flatMap(([name, text]) =>
    words.filter(said => text.includes(said)).map(said => `${name}: ${JSON.stringify(said)}`)
  );

/** The browser's build fails when a file it writes holds a draft's words. For vite.config.ts. */
export function draftsStayPrivate(): Plugin {
  return {
    name: "grabient:drafts-stay-private",
    apply: "build",
    applyToEnvironment: environment => environment.name === "client",
    generateBundle(_, bundle) {
      const found = leaks(
        Object.values(bundle).map(file => [
          file.fileName,
          file.type === "chunk"
            ? file.code
            : typeof file.source === "string"
              ? file.source
              : new TextDecoder().decode(file.source)
        ])
      );
      if (found.length) {
        this.error(
          `A draft issue's words are in a file the browser is given:\n  ${found.join("\n  ")}`
        );
      }
    }
  };
}
