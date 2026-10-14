import { decodePalette } from "@grabient/engine/codec.ts";
import { titleFaults } from "@grabient/engine/name.ts";
import { batch, type Statement } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { collectionItem } from "../../../features/collections/schema.ts";
import { likeTitle } from "../../gallery/likes.ts";
import { SITE_AGENT } from "./personas.ts";

/* The words written for a palette (k_palette_texts), as the admins' tools and the seeding queue write them: a title
   its page and the search read, and a description. A text is written only where the palette's colors bear its words
   out, so no title says a color the palette lacks. The pages read them back under the same check
   (collections/files.ts heldWords). */

export const PALETTE_EMBED_MAX = 1200;

export interface PaletteTextInput {
  seed: string;
  title: string;
  /** the description, or none: one sent empty keeps what the palette has */
  embed: string;
}

/** A description as sent: one line of at most PALETTE_EMBED_MAX characters, composed and never folded; empty for none,
    null past the length or for anything but text. */
function embedInput(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > PALETTE_EMBED_MAX * 4) return null;
  const clean = value
    .normalize("NFC")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return clean.length > PALETTE_EMBED_MAX ? null : clean;
}

/** One text as a call sends it: a palette's seed made canonical, a title read as an account's own title of a palette
    is (one line of 1 to 80 characters) and a description within its length; null for anything else. */
export function paletteTextInput(value: unknown): PaletteTextInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const item = collectionItem({ seed: input.seed });
  const title = likeTitle(input.title);
  const embed = embedInput(input.embed);
  return item && title && embed !== null ? { seed: item.seed, title, embed } : null;
}

/** Texts sorted by whether the palettes' colors bear their words out. A text is kept whole or not at all, so a
    description never outlives its title's check. */
export function checkTexts(texts: readonly PaletteTextInput[]) {
  const held: PaletteTextInput[] = [];
  const refused: { seed: string; words: string[] }[] = [];
  for (const text of texts) {
    const palette = decodePalette(text.seed);
    const words = palette
      ? [...new Set([...titleFaults(text.title, palette), ...titleFaults(text.embed, palette)])]
      : [];
    if (words.length) refused.push({ seed: text.seed, words });
    else held.push(text);
  }
  return { held, refused };
}

/** What an answer says of a text it did not write, the same from every tool. */
export const REFUSED_TEXT = "Not written: the palette shows nothing these words name.";

/** Writes or replaces texts as Grabient's. An entry without a description keeps the one the palette has, and a text
    sent again as it stands writes nothing, so the search's snapshot sees no change. How many were sent. */
export async function upsertPaletteTexts(
  env: Pick<Env, "DB">,
  texts: readonly PaletteTextInput[]
): Promise<number> {
  if (!texts.length) return 0;
  const now = Date.now();
  await batch(
    env.DB,
    texts.map(
      (text): Statement => [
        `INSERT INTO k_palette_texts (seed, title, embed, agent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(seed) DO UPDATE SET title = excluded.title, agent = excluded.agent, updated_at = excluded.updated_at,
           embed = CASE WHEN excluded.embed = '' THEN k_palette_texts.embed ELSE excluded.embed END
         WHERE k_palette_texts.title IS NOT excluded.title OR k_palette_texts.agent IS NOT excluded.agent
           OR (excluded.embed <> '' AND k_palette_texts.embed IS NOT excluded.embed)`,
        text.seed,
        text.title,
        text.embed,
        SITE_AGENT,
        now,
        now
      ]
    )
  );
  return texts.length;
}
