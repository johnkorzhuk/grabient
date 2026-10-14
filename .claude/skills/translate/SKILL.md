---
name: translate
description: Translates Grabient's own collections and tags into the site's 15 other languages through the admin MCP tools translations and translations_save, or reads kept translations back. Use when asked to translate collections or tags, to run a translation pass, or to check translations.
---

# Translate Grabient's words

Grabient's public collections, their titles and descriptions, and the tags they carry are translated by an admin's app
and kept on the site, which shows each language's readers their own words and indexes the translated pages
(`apps/web/src/server/mcp/admin/translations.ts`). This skill runs that pass from Claude Code connected to the site's
MCP server with the admin tools.

## Before you start

- The `grabient` MCP server is connected with the admin tools: `translations` and `translations_save` are among your
  tools. If they are missing, ask the site's admin to run `claude mcp login grabient`, switch on Admin tools on the
  consent page, and start a new session.
- The arguments name the languages by tag: `/translate zh-Hans ja`. With none, do all 15: ar de es fa fr id ja ko pt-BR
  ru th tr uk vi zh-Hans. `/translate check <tag>` reads translations back instead (Check, below).
- Give each language a subagent of its own, three at a time, each following One language and the rules after it, and
  collect what each reports. A language's work then stays in its own context.

## One language

1. Read `packages/i18n/glossary/README.md`, how every language writes, and `packages/i18n/glossary/<tag>.md`, that
   language's words for the product. Use those words every time.
2. Tags come first, so the collections can use the same words. Call `translations` with
   `{"language": "<tag>", "kind": "tags", "limit": 100}` and translate each `tag`. Its `known` list holds the spellings
   the search already reads it by in that language: the designer's word there (马卡龙色 for pastel, くすみカラー for
   muted), slang, or the English sound in the language's script. Take the one a designer there would put on a label,
   which the search then reads too, and write the word where none is that one. Save with `translations_save` and
   `{"language": "<tag>", "tags": [{"tag": "...", "word": "..."}]}`. Repeat until `missing` is 0.
3. Then the collections. Call `translations` with `{"language": "<tag>", "limit": 50}` and translate each title and
   description; a collection's tags say what its colors are. Save with `translations_save` and
   `{"language": "<tag>", "collections": [{"slug": "...", "source": "...", "title": "...", "description": "..."}]}`,
   with `source` exactly as it came. Repeat until `missing` is 0.
4. The answer lists what it refused under `refused`, each with why. Fix those and send them again. "Its English changed
   since it was read" means read that collection again first.

## How to translate

- Translate from the English alone and say what it says: add no adjectives and no marketing.
- Use the words the language's design tools use (Figma, Photoshop, Procreate), as its glossary notes. A collection
  called "X gradients" or "X swatches" takes the glossary's words for gradient and swatches, and its search phrase where
  the glossary gives one for titles.
- Plain, specific and short. Sentence case where the language has case. No em dashes and no exclamation marks. The
  language's own punctuation, full width in Chinese and Japanese.
- Keep as written: Grabient, the names of formats and products (CSS, SVG, PNG, OKLCH, Figma), and proper nouns people
  search as written. A festival, plant, fabric or place takes the name the language already gives it (Diwali is 排灯节
  in Chinese). Where unsure, ask Wikidata:
  `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=<name>&language=en&format=json` finds the item, and
  `https://www.wikidata.org/wiki/Special:EntityData/<id>.json` holds its `labels`. A name with no label in the language
  stays as written.
- Color words are the language's everyday ones, as the site's own color names say them
  (`packages/i18n/messages/<tag>.json`: "dark blue", "teal", "lavender").
- A tag is the word a designer would search for, lowercase where the language has case. A tag may stay as written where
  the language uses it so (y2k, css).
- A title fits in 80 characters and a tag in 32. A description stays close to the English length, about 150 characters
  at most in a Latin script, and its first sentence stands alone: a search result shows about 160 characters of a
  page's description.
- No two collections share a title in one language. `translations_save` refuses a title another collection has, so say
  it another way.

## Cultural anchors

A title or a description calls up a picture: a season, a holiday, a place, a food, a fabric, a color that means
something. Translate the picture a reader of the language should see, keeping the meaning the English has.

- A reference the culture shares takes its own name there: Diwali is 排灯节 in Chinese, and the Lunar New Year is 春节 in
  Chinese, 설날 in Korean and Tết in Vietnamese.
- A word that reads otherwise there is said so that it reads as the English means it. Watch for these: white is the
  color of mourning in Chinese, Japanese and Korean, and red the color of luck and weddings in Chinese; a green hat
  (绿帽子) means a cheated husband in Chinese; yellow is the royal color in Thai; "nude" and "flesh" as color names name
  a skin color, so translate the color itself (beige, sand) unless the English means skin; four sounds like death in
  Chinese, Japanese and Korean, so never add the number.
- A reference with no meaning there (a holiday the culture does not keep, a local food) keeps its name as written or as
  the language usually writes it, and the colors carry the rest. A title never explains it.
- Seasons and months stay as the English has them, though Brazil's summer falls in December.
- A collection about a holiday or a custom is translated like any other, since readers of every language may want it.
  Never skip one, and never soften or censor its subject.
- Add nothing political or religious. A place whose name readers of different languages dispute (a sea, a region) takes
  the most neutral name the language has, or none, and the description says what the colors are.
- Whenever a word or a reference was adapted for these reasons, say why in the entry's `note`, one line in English
  ("白 avoided for the wedding: white is the color of mourning"). A translation said word for word needs no note.

## Check

`/translate check <tag>`: call `translations` with `{"language": "<tag>", "show": "noted", "limit": 100}`, once for
collections and once with `"kind": "tags"`, and show every note beside its English and its translation: these are the
choices made for that culture. Then call it with `"show": "sample"` and `"limit": 10` for each kind, translate each kept
translation back into English, and show a table of the English, the translation and the translation back in English.
A sampled collection marked `outdated` was translated from English that has changed since, and is missing again. Name
any that add, drop or change meaning, and offer fixed ones to save with `translations_save`.

## When you finish

Say for each language how many collections and tags were saved, how many carry a note, and what was refused and why.
