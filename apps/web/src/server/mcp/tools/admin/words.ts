import { logContribution } from "../../admin/reviews.ts";
import {
  type CollectionTranslation,
  checkTranslations,
  DESCRIPTION_LIMIT,
  keepTranslations,
  missingCollections,
  missingTags,
  NOTE_LIMIT,
  sampleTranslations,
  TAG_LIMIT,
  type TagTranslation,
  TITLE_LIMIT,
  TRANSLATED_LOCALES,
  translatedLocale
} from "../../admin/translations.ts";
import {
  answer,
  items,
  list,
  num,
  READS,
  refuse,
  shape,
  str,
  type Tool,
  text,
  whole
} from "../../tool.ts";
import { CHANGES_SITE, carried, searchedWords, who } from "./common.ts";

/* Grabient's own words in the site's other languages: what is missing, what is kept, and keeping more. */

/** A translator's note on an entry adapted for the language: why, as admins read it back. */
const NOTE = text(
  `Why a word or reference was adapted for this language, where it was: a meaning, a connotation or a name it has there that the English does not. One line in English, up to ${NOTE_LIMIT} characters.`,
  { maxLength: NOTE_LIMIT }
);
const LANGUAGE = {
  type: "string",
  enum: TRANSLATED_LOCALES,
  description: "The language, by its tag."
};
const NO_LANGUAGE = `Name one of the site's other languages: ${TRANSLATED_LOCALES.join(", ")}.`;
/** The objects of a list; anything else in it is no entry. */
const objects = (value: unknown, max: number) =>
  items(value, max).filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  );

export const wordTools: readonly Tool[] = [
  {
    name: "translations",
    title: "Grabient's words in other languages",
    hints: READS,
    description:
      "What Grabient's public collections and their tags still lack in one of the site's languages, with the English to translate from; or translations kept, beside their English: a random sample, or every one whose translator noted why a word or reference was adapted for the language. A collection whose English changed after it was translated is missing again. A tag lists the spellings the search already reads it by in that language's script.",
    inputSchema: shape(
      {
        language: LANGUAGE,
        kind: {
          type: "string",
          enum: ["collections", "tags"],
          description: "Collections (titles and descriptions) or tags. Default collections."
        },
        show: {
          type: "string",
          enum: ["missing", "sample", "noted"],
          description:
            "What is missing (the default), a sample of what is kept, or the kept translations with a note."
        },
        limit: whole("How many, default 50.", 1, 100)
      },
      ["language"]
    ),
    async run(args, c) {
      const language = translatedLocale(args.language);
      if (!language) return refuse(NO_LANGUAGE);
      const kind = args.kind === "tags" ? "tags" : "collections";
      const limit = num(args.limit, 50, 1, 100);
      if (args.show === "sample" || args.show === "noted") {
        return answer({
          language,
          kind,
          [args.show]: await sampleTranslations(c.env, language, kind, limit, args.show === "noted")
        });
      }
      const found =
        kind === "tags"
          ? await missingTags(c.env, language, limit, await searchedWords(c))
          : await missingCollections(c.env, language, limit);
      return answer({ language, kind, ...found });
    }
  },
  {
    name: "translations_save",
    title: "Keep translations of Grabient's words",
    hints: CHANGES_SITE,
    description:
      "Keep translations of Grabient's public collections and their tags in one of the site's languages, replacing what that language had for them. A collection's entry carries the `source` translations gave with its English, so a translation of English that has changed since is refused. Each entry is checked: written in the language's script (a tag may stay as written), within the lengths, no line breaks and no em dash. The answer lists what was kept and what was refused, with why.",
    inputSchema: shape(
      {
        language: LANGUAGE,
        collections: list(
          shape(
            {
              slug: text("The collection."),
              source: text("The `source` translations gave with its English."),
              title: text(`Its title, 1 to ${TITLE_LIMIT} characters.`, { maxLength: TITLE_LIMIT }),
              description: text(`Its description, up to ${DESCRIPTION_LIMIT} characters.`, {
                maxLength: DESCRIPTION_LIMIT
              }),
              note: NOTE
            },
            ["slug", "source", "title"]
          ),
          "Collections.",
          0,
          100
        ),
        tags: list(
          shape(
            {
              tag: text("The tag, as Grabient writes it."),
              word: text(`Its word, 1 to ${TAG_LIMIT} characters.`, { maxLength: TAG_LIMIT }),
              note: NOTE
            },
            ["tag", "word"]
          ),
          "Tags.",
          0,
          300
        )
      },
      ["language"]
    ),
    async run(args, c) {
      const language = translatedLocale(args.language);
      if (!language) return refuse(NO_LANGUAGE);
      const collections: CollectionTranslation[] = objects(args.collections, 100).map(entry => ({
        slug: str(entry.slug, 120),
        source: str(entry.source, 40),
        title: str(entry.title, TITLE_LIMIT + 1),
        description: str(entry.description, DESCRIPTION_LIMIT + 1),
        note: str(entry.note, NOTE_LIMIT + 1)
      }));
      const tags: TagTranslation[] = objects(args.tags, 300).map(entry => ({
        tag: str(entry.tag, 64),
        word: str(entry.word, TAG_LIMIT + 1),
        note: str(entry.note, NOTE_LIMIT + 1)
      }));
      if (!collections.length && !tags.length)
        return refuse("Send at least one collection or tag.");
      const checked = await checkTranslations(
        c.env,
        language,
        collections,
        tags,
        tags.length ? await searchedWords(c) : []
      );
      const kept = checked.collections.length + checked.tags.length;
      if (kept) {
        const stopped = await carried(c, kept);
        if (stopped) return stopped;
        await keepTranslations(c.env, language, checked.collections, checked.tags);
        await logContribution(c.env, who(c), "translations_save", language, {
          collections: checked.collections.length,
          tags: checked.tags.length
        });
      }
      return answer({
        language,
        kept: {
          collections: checked.collections.map(entry => entry.slug),
          tags: checked.tags.map(entry => entry.tag)
        },
        ...(checked.refused.length ? { refused: checked.refused } : {})
      });
    }
  }
];
