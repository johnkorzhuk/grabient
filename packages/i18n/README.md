# @grabient/i18n

Grabient's sixteen languages, in plain TypeScript with no Solid or DOM imports.

- `src/runtime.ts`: `t`, `msg`, `rich`, `translate`, `localHref`, `formatNumber`, `formatDate`. The English of a message
  is its key. `src/format.ts` reads the message format, a subset of ICU.
- `src/locales.ts`: the languages. `src/path.ts`: the address prefixes (`/ja/palettes`). `src/negotiate.ts`: the
  language cookie and Accept-Language.
- `vite.ts`: the build plugin. The Worker gets every catalog (`virtual:i18n/catalogs`), the browser one hashed file per
  language (`virtual:i18n/assets`).
- `messages/en.json`: the master English, every message the code says with where and a note for the translator.
  `messages/<tag>.json`: one language's translations, keyed by the English. `glossary/`: how each language names the
  product's own words; translators read it first.
- `scripts/i18n.ts`: `pnpm i18n extract | check [--strict] | pending <tag> | merge <tag> <file> | prune`.

## Writing a message

1. Every string a person reads or hears is a message: text, `aria-label`, `title`, `placeholder`, `alt`, toasts,
   errors a page shows, page titles. Class names, keys, URLs, hex codes and seeds are not.
2. Values go inside the message, never concatenated: `t("Saved to {title}", { title })`. A sentence holding a link or
   a component uses `rich()`.
3. A count is a plural, even where English has one form: `t("{count, plural, one {# palette} other {# palettes}}", { count })`.
4. Never call `t()` at a module's top level: it runs once, and every request would get that one language. Name the
   message there with `msg()` and call `t()` where it is shown.
5. A prop that chooses between messages is one call, `title={t(on ? msg("Remove") : msg("Add"))}`: Solid compiles a
   conditional around `t()` in a prop into a memo that breaks when the prop is read outside rendering.
6. The same English with two meanings takes a context: `msg("Saved", "order")`, then `t(label, { $context: "order" })`.
7. Numbers given as values are written the reader's way; pass a number that must not be grouped (a year, a size in
   pixels) as a string. Dates go through `formatDate`.
8. In Arabic and Persian every value is isolated in its sentence, so no translation needs bidi characters.

`extract` rewrites `en.json` from the code it finds, so run it only on a tree that holds every feature: a message the
code no longer says leaves `en.json` with its note, and its translations stop shipping.
