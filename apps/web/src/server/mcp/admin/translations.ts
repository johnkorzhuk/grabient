import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_INFO,
  LOCALES,
  type Locale,
  messageKey
} from "@grabient/i18n";
import { all, batch, type Statement } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";

/* Grabient's own words in the site's other languages. An admin's app translates the titles and descriptions of
   Grabient's public collections and the tags they carry (the translations tools), and k_translations keeps them. A
   page or an answer in another language shows them in place of the English; a reader's own words stay as written. A
   collection's translation keeps the fingerprint of the English it was made from, so English changed since shows as
   English until it is translated again. */

type DB = Pick<Env, "DB">;
export type TranslatedLocale = Exclude<Locale, "en">;
export const TRANSLATED_LOCALES = LOCALES.filter(
  (l): l is TranslatedLocale => l !== DEFAULT_LOCALE
);
export const translatedLocale = (value: unknown): TranslatedLocale | null =>
  isLocale(value) && value !== DEFAULT_LOCALE ? (value as TranslatedLocale) : null;
/** The language an answer is asked in: `lang` on its address. English, and anything else, is null. */
export const askedLocale = (url: URL): TranslatedLocale | null =>
  translatedLocale(url.searchParams.get("lang"));

/** What a collection's English words were when they were translated. */
export const fingerprint = (title: string, description: string): string =>
  messageKey(`${title}\n${description}`);

const tagList = (raw: string | null | undefined): string[] => {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
};

/* —— What pages read —— */

export interface Words {
  title: string;
  description: string;
}
interface WordRow {
  slug: string;
  english: string;
  english_description: string;
  locale: string;
  title: string;
  description: string;
  source: string;
}
const WORDS = `SELECT c.slug, c.title AS english, c.description AS english_description, t.locale, t.title, t.description,
  t.source FROM k_collections c JOIN k_translations t ON t.kind = 'collection' AND t.key = c.id`;
const current = (row: WordRow) => row.source === fingerprint(row.english, row.english_description);

/** Each collection's words in `locale`, by its slug, where they translate the English it has now. */
export async function collectionWords(
  env: DB,
  locale: TranslatedLocale | null,
  slugs: readonly string[]
): Promise<Map<string, Words>> {
  const out = new Map<string, Words>();
  if (!locale || !slugs.length) return out;
  const rows = await all<WordRow>(
    env.DB,
    `${WORDS} AND t.locale = ? WHERE c.slug IN (SELECT value FROM json_each(?))`,
    locale,
    JSON.stringify([...new Set(slugs)])
  );
  for (const row of rows)
    if (current(row)) out.set(row.slug, { title: row.title, description: row.description });
  return out;
}

/** Each tag's word in `locale`, by the tag as Grabient's collections write it. */
export async function tagWords(
  env: DB,
  locale: TranslatedLocale | null,
  tags: readonly string[]
): Promise<Map<string, string>> {
  if (!locale || !tags.length) return new Map();
  const rows = await all<{ key: string; title: string }>(
    env.DB,
    "SELECT key, title FROM k_translations WHERE kind = 'tag' AND locale = ? AND key IN (SELECT value FROM json_each(?))",
    locale,
    JSON.stringify([...new Set(tags)])
  );
  return new Map(rows.map(row => [row.key, row.title]));
}

interface Collectionish {
  slug: string;
  title: string;
  description?: string;
  tags?: readonly string[];
  owner?: { kind: string };
}
const grabients = (c: Collectionish) => c.owner?.kind === "agent";

/** Collections as a page in `locale` shows them: Grabient's own in that language where they are translated, every
    other as written. Only Grabient's own have their tags translated: a reader's tags are the reader's words. */
export async function localizeCollections<T extends Collectionish>(
  env: DB,
  locale: TranslatedLocale | null,
  list: readonly T[]
): Promise<T[]> {
  if (!locale || !list.length) return [...list];
  const [words, tagged] = await Promise.all([
    collectionWords(
      env,
      locale,
      list.map(c => c.slug)
    ),
    tagWords(
      env,
      locale,
      list.filter(grabients).flatMap(c => c.tags ?? [])
    )
  ]);
  return list.map(c => {
    const said = words.get(c.slug);
    const tags =
      grabients(c) && c.tags?.some(tag => tagged.has(tag))
        ? c.tags.map(tag => tagged.get(tag) ?? tag)
        : null;
    if (!said && !tags) return c;
    return {
      ...c,
      ...(said
        ? {
            title: said.title,
            ...(c.description === undefined ? {} : { description: said.description })
          }
        : {}),
      ...(tags ? { tags } : {})
    };
  });
}

/** A collection page's document in `locale`, and every language its words are translated into: what its page is
    indexed in. */
export async function localizeDocument<T extends Collectionish>(
  env: DB,
  locale: TranslatedLocale | null,
  doc: T
): Promise<{ doc: T; languages: TranslatedLocale[] }> {
  if (!grabients(doc)) return { doc, languages: [] };
  const rows = (await all<WordRow>(env.DB, `${WORDS} WHERE c.slug = ?`, doc.slug)).filter(current);
  const languages = TRANSLATED_LOCALES.filter(l => rows.some(row => row.locale === l));
  if (!locale) return { doc, languages };
  const said = rows.find(row => row.locale === locale);
  const tagged = await tagWords(env, locale, doc.tags ?? []);
  return {
    doc: {
      ...doc,
      ...(said ? { title: said.title, description: said.description } : {}),
      ...(doc.tags ? { tags: doc.tags.map(tag => tagged.get(tag) ?? tag) } : {})
    },
    languages
  };
}

/** The collections that hold a palette, as its page names them: each title in `locale` where translated, the English
    kept as `english` for the palette's Markdown (files for agents stay in English). */
export async function localizeHeld<T extends { slug: string; title: string }>(
  env: DB,
  locale: TranslatedLocale | null,
  held: readonly T[]
): Promise<(T & { english?: string })[]> {
  const words = await collectionWords(
    env,
    locale,
    held.map(c => c.slug)
  );
  return held.map(c => {
    const said = words.get(c.slug);
    return said ? { ...c, title: said.title, english: c.title } : c;
  });
}

/** A row of tags as a page in `locale` shows it: a collection's tag says its translated title, a search's tag the word
    Grabient translated for those words; the addresses stay. */
export async function localizeTags<T extends { label: string; href: string; query?: string }>(
  env: DB,
  locale: TranslatedLocale | null,
  tags: readonly T[]
): Promise<T[]> {
  if (!locale || !tags.length) return [...tags];
  const slugOf = (tag: T) =>
    !tag.query && /^\/[^?/@]+$/.test(tag.href) ? decodeURIComponent(tag.href.slice(1)) : null;
  const [titles, tagged] = await Promise.all([
    collectionWords(
      env,
      locale,
      tags.map(slugOf).filter((slug): slug is string => !!slug)
    ),
    tagWords(
      env,
      locale,
      tags.flatMap(tag => (tag.query ? [tag.query] : []))
    )
  ]);
  return tags.map(tag => {
    const slug = slugOf(tag);
    const label = slug ? titles.get(slug)?.title : tag.query ? tagged.get(tag.query) : undefined;
    return label ? { ...tag, label } : tag;
  });
}

/* —— What the admins' apps read and keep —— */

/** The scripts a translation must be written in; the other languages are written in the Latin alphabet. */
const SCRIPTS: Partial<Record<TranslatedLocale, RegExp>> = {
  "zh-Hans": /\p{Script=Han}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  ko: /\p{Script=Hangul}/u,
  th: /\p{Script=Thai}/u,
  ar: /\p{Script=Arabic}/u,
  fa: /\p{Script=Arabic}/u,
  ru: /\p{Script=Cyrillic}/u,
  uk: /\p{Script=Cyrillic}/u
};
const NOT_LATIN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Devanagari}]/u;
const LATIN = /\p{Script=Latin}/u;
// the site's words never use one; built so no source line holds one
const EM_DASH = String.fromCharCode(0x2014);
const CONTROL = /\p{Cc}/u;
export const TITLE_LIMIT = 80;
export const DESCRIPTION_LIMIT = 500;
export const TAG_LIMIT = 32;
export const NOTE_LIMIT = 300;

/** What is wrong with a translation, or null. A tag may stay as written (a name, a format, a word the language uses
    as is); a title or a description is written in the language's own script. */
export function translationFault(
  locale: TranslatedLocale,
  text: string,
  english: string,
  kind: "title" | "description" | "tag"
): string | null {
  const max =
    kind === "title" ? TITLE_LIMIT : kind === "description" ? DESCRIPTION_LIMIT : TAG_LIMIT;
  if (!text) return "Empty.";
  if (text.length > max) return `Longer than ${max} characters.`;
  if (CONTROL.test(text)) return "It holds a line break.";
  if (text.includes(EM_DASH)) return "It holds an em dash.";
  if (kind === "tag" && text === english) return null;
  if (kind === "description" && text === english) return "It is the English.";
  const script = SCRIPTS[locale];
  const written = script ? script.test(text) : !NOT_LATIN.test(text) && LATIN.test(text);
  return written ? null : `It isn't written in ${LOCALE_INFO[locale].english}.`;
}

/* the words the search already reads in every language (public/search/lex.json): each spelling leads to a phrase of
   the vocabulary, so a phrase's spellings are the ways the languages say it */
type Lexicon = { index: Record<string, number>; spellings: Map<number, string[]> };
let lexicon: Promise<Lexicon | null> | undefined;
function readLexicon(env: Pick<Env, "ASSETS">): Promise<Lexicon | null> {
  lexicon ??= env.ASSETS.fetch("https://assets.local/search/lex.json")
    .then(response => (response.ok ? (response.json() as Promise<Record<string, number>>) : null))
    .then(index => {
      if (!index) return null;
      const spellings = new Map<number, string[]>();
      for (const [word, at] of Object.entries(index))
        spellings.set(at, [...(spellings.get(at) ?? []), word]);
      return { index, spellings };
    })
    .catch(() => {
      lexicon = undefined;
      return null;
    });
  return lexicon;
}
/** The spellings the search's lexicon reads as `tag`, in the script `locale` is written in. */
function knownWords(lex: Lexicon | null, tag: string, locale: TranslatedLocale): string[] {
  const at = lex?.index[tag];
  if (at === undefined || !lex) return [];
  const script = SCRIPTS[locale];
  return (lex.spellings.get(at) ?? [])
    .filter(word => word !== tag && (script ? script.test(word) : !NOT_LATIN.test(word)))
    .slice(0, 8);
}

interface SiteRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  tags: string;
  source: string | null;
}

/** Grabient's public collections with no translation into `locale` of the English they have now, oldest first, and
    how many there are in all. */
export async function missingCollections(env: DB, locale: TranslatedLocale, limit: number) {
  const rows = await all<SiteRow>(
    env.DB,
    `SELECT c.id, c.slug, c.title, c.description, c.tags, t.source FROM k_collections c
     LEFT JOIN k_translations t ON t.kind = 'collection' AND t.locale = ? AND t.key = c.id
     WHERE c.owner_kind = 'agent' AND c.visibility = 'public' ORDER BY c.created_at, c.id`,
    locale
  );
  const missing = rows.filter(row => row.source !== fingerprint(row.title, row.description));
  return {
    items: missing.slice(0, limit).map(row => ({
      slug: row.slug,
      title: row.title,
      description: row.description,
      tags: tagList(row.tags),
      source: fingerprint(row.title, row.description)
    })),
    missing: missing.length,
    total: rows.length
  };
}

/** Every tag a reader sees Grabient write: its public collections' tags, by how many carry each, and the words of the
    tags under the search (`searched`). */
async function siteTags(env: DB, searched: readonly string[]): Promise<Map<string, number>> {
  const rows = await all<{ tags: string }>(
    env.DB,
    "SELECT tags FROM k_collections WHERE owner_kind = 'agent' AND visibility = 'public'"
  );
  const count = new Map<string, number>();
  for (const row of rows)
    for (const tag of tagList(row.tags)) count.set(tag, (count.get(tag) ?? 0) + 1);
  for (const words of searched) if (words && !count.has(words)) count.set(words, 0);
  return count;
}

/** The tags with no word in `locale`, the ones most collections carry first, each with the spellings the search
    already reads it by in the language's script. */
export async function missingTags(
  env: Pick<Env, "DB" | "ASSETS">,
  locale: TranslatedLocale,
  limit: number,
  searched: readonly string[]
) {
  const [count, kept, lex] = await Promise.all([
    siteTags(env, searched),
    all<{ key: string }>(
      env.DB,
      "SELECT key FROM k_translations WHERE kind = 'tag' AND locale = ?",
      locale
    ),
    readLexicon(env)
  ]);
  const have = new Set(kept.map(row => row.key));
  const missing = [...count]
    .filter(([tag]) => !have.has(tag))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    items: missing
      .slice(0, limit)
      .map(([tag, collections]) => ({ tag, collections, known: knownWords(lex, tag, locale) })),
    missing: missing.length,
    total: count.size
  };
}

/** Kept translations beside their English: at random, or every one whose translator noted why a word or reference
    was adapted (`noted`), newest first. */
export async function sampleTranslations(
  env: DB,
  locale: TranslatedLocale,
  kind: "collections" | "tags",
  limit: number,
  noted: boolean
): Promise<unknown[]> {
  const which = noted ? "AND t.note != '' ORDER BY t.updated_at DESC" : "ORDER BY random()";
  if (kind === "tags") {
    const rows = await all<{ key: string; title: string; note: string }>(
      env.DB,
      `SELECT t.key, t.title, t.note FROM k_translations t WHERE t.kind = 'tag' AND t.locale = ? ${which} LIMIT ?`,
      locale,
      limit
    );
    return rows.map(row => ({
      tag: row.key,
      word: row.title,
      ...(row.note ? { note: row.note } : {})
    }));
  }
  const rows = await all<WordRow & { note: string }>(
    env.DB,
    `SELECT c.slug, c.title AS english, c.description AS english_description, t.locale, t.title, t.description, t.source,
       t.note FROM k_collections c JOIN k_translations t ON t.kind = 'collection' AND t.key = c.id AND t.locale = ?
     ${which} LIMIT ?`,
    locale,
    limit
  );
  return rows.map(row => ({
    slug: row.slug,
    english: { title: row.english, description: row.english_description },
    translation: { title: row.title, description: row.description },
    ...(row.note ? { note: row.note } : {}),
    ...(current(row) ? {} : { outdated: true })
  }));
}

export interface CollectionTranslation {
  slug: string;
  source: string;
  title: string;
  description: string;
  note: string;
}
export interface TagTranslation {
  tag: string;
  word: string;
  note: string;
}
export interface Refused {
  slug?: string;
  tag?: string;
  why: string;
}
/** What is wrong with a translator's note, or null: one plain line in English, or none. */
const noteFault = (note: string): string | null =>
  !note
    ? null
    : note.length > NOTE_LIMIT
      ? `Its note is longer than ${NOTE_LIMIT} characters.`
      : CONTROL.test(note)
        ? "Its note holds a line break."
        : null;

/** The translations that pass, ready to keep, and the rest with why. A collection is one of Grabient's public ones and
    its `source` is the fingerprint of the English it has now; a tag is one a reader sees Grabient write; no two of
    Grabient's collections share a title in a language, since search engines take two such pages for one. */
export async function checkTranslations(
  env: DB,
  locale: TranslatedLocale,
  collections: readonly CollectionTranslation[],
  tags: readonly TagTranslation[],
  searched: readonly string[]
) {
  const refused: Refused[] = [];
  const held: (CollectionTranslation & { id: string })[] = [];
  const words: TagTranslation[] = [];
  const english = new Map(
    (
      await all<{ id: string; slug: string; title: string; description: string }>(
        env.DB,
        `SELECT id, slug, title, description FROM k_collections
         WHERE owner_kind = 'agent' AND visibility = 'public' AND slug IN (SELECT value FROM json_each(?))`,
        JSON.stringify([...new Set(collections.map(c => c.slug))])
      )
    ).map(row => [row.slug, row])
  );
  const fold = (title: string) => title.toLocaleLowerCase(locale);
  const titled = new Map<string, string>();
  if (collections.length) {
    const rows = await all<{ key: string; title: string }>(
      env.DB,
      `SELECT t.key, t.title FROM k_translations t JOIN k_collections c ON c.id = t.key
       WHERE t.kind = 'collection' AND t.locale = ? AND c.visibility = 'public'`,
      locale
    );
    for (const row of rows) titled.set(fold(row.title), row.key);
  }
  for (const entry of collections) {
    const row = english.get(entry.slug);
    if (!row) {
      refused.push({ slug: entry.slug, why: "It isn't one of Grabient's public collections." });
      continue;
    }
    if (entry.source !== fingerprint(row.title, row.description)) {
      refused.push({
        slug: entry.slug,
        why: "Its English changed since it was read. Read it again."
      });
      continue;
    }
    const named = titled.get(fold(entry.title));
    const description = row.description
      ? translationFault(locale, entry.description, row.description, "description")
      : entry.description
        ? "Its English has no description."
        : null;
    const fault =
      translationFault(locale, entry.title, row.title, "title") ??
      description ??
      (named && named !== row.id
        ? `Another collection has this title in ${LOCALE_INFO[locale].english}.`
        : null) ??
      noteFault(entry.note);
    if (fault) {
      refused.push({ slug: entry.slug, why: fault });
      continue;
    }
    titled.set(fold(entry.title), row.id);
    held.push({ ...entry, id: row.id });
  }
  const known = tags.length ? await siteTags(env, searched) : new Map<string, number>();
  for (const entry of tags) {
    const fault = !known.has(entry.tag)
      ? "It isn't a tag Grabient writes."
      : (translationFault(locale, entry.word, entry.tag, "tag") ?? noteFault(entry.note));
    if (fault) refused.push({ tag: entry.tag, why: fault });
    else words.push(entry);
  }
  return { collections: held, tags: words, refused };
}

/** Keeps translations that passed checkTranslations, replacing what the language had for them. */
export async function keepTranslations(
  env: DB,
  locale: TranslatedLocale,
  collections: readonly (CollectionTranslation & { id: string })[],
  tags: readonly TagTranslation[]
): Promise<void> {
  const now = Date.now();
  const write = `INSERT INTO k_translations (kind, locale, key, title, description, source, note, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(kind, locale, key) DO UPDATE SET title = excluded.title,
    description = excluded.description, source = excluded.source, note = excluded.note, updated_at = excluded.updated_at`;
  const statements: Statement[] = [
    ...collections.map(
      (c): Statement => [
        write,
        "collection",
        locale,
        c.id,
        c.title,
        c.description,
        c.source,
        c.note,
        now
      ]
    ),
    ...tags.map((t): Statement => [write, "tag", locale, t.tag, t.word, "", "", t.note, now])
  ];
  for (let at = 0; at < statements.length; at += 50)
    await batch(env.DB, statements.slice(at, at + 50));
}
