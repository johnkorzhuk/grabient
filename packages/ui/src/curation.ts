import { msg } from "./i18n.ts";

/* The faults an admin can name when taking a palette out of one of Grabient's collections or drawing it another way:
   a word for a chip and the line its tooltip shows. The seeding agents count them, so each is a fault the pipeline can
   measure or a judge can be told to mark down. The record keeps only these keys, beside a free comment. The words stay
   English here for the agents and the record; the sheet translates them. */

export interface CurationReason {
  key: string;
  label: string;
  /** what the word means, one line, for the tooltip and the agents */
  hint: string;
}

export const CURATION_REASONS: readonly CurationReason[] = [
  { key: "muddy", label: msg("Muddy"), hint: msg("Gray or brown through the middle") },
  { key: "banding", label: msg("Banding"), hint: msg("Hard steps where a blend was meant") },
  { key: "dull", label: msg("Dull"), hint: msg("Flat, with little color or change") },
  { key: "harsh", label: msg("Harsh"), hint: msg("Glaring, clipped or too neon") },
  { key: "dark", label: msg("Too dark"), hint: msg("Mostly near black") },
  { key: "light", label: msg("Too light"), hint: msg("Mostly near white") },
  { key: "ugly", label: msg("Ugly turn"), hint: msg("Passes through a color that spoils it") },
  { key: "alike", label: msg("Looks alike"), hint: msg("Too close to another palette here") },
  { key: "off", label: msg("Off title"), hint: msg("Doesn't fit the collection") },
  { key: "form", label: msg("Wrong form"), hint: msg("Wrong style, steps or angle") }
];

export const CURATION_COMMENT_MAX = 500;

/** The reasons sent, kept to the list and in its order, each once. */
export const curationReasons = (value: unknown): string[] =>
  Array.isArray(value)
    ? CURATION_REASONS.map(reason => reason.key).filter(key => value.includes(key))
    : [];
