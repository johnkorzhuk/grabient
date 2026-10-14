/* An issue of the newsletter, as its email and as a page of the site, and what an issue is written with. An issue opens
   the same way each time: palettes an admin picked from the Rising list, each once and in its own view. The first is
   the sheet's head as its whole preview, with its colors as chips under it; the rest stand under the title. What the
   issue promotes comes after them, and the foot says why it came and how to end it, in the reader's language.

   An issue is written once, in English unless it says otherwise, and runs that language's way for every reader. */
import { STYLE_LABELS, type Style } from "@grabient/engine/view.ts";
import { DEFAULT_LOCALE, type Locale } from "@grabient/i18n";
import { type EmailOptions, email, inset, type Letter } from "./document.ts";
import { home } from "./letters.ts";
import {
  type CollectionOptions,
  type PaletteOptions,
  type PaletteView,
  palettes
} from "./palette.ts";
import {
  button,
  eyebrow,
  link,
  links,
  named,
  type Parts,
  readers,
  stack,
  text,
  title
} from "./parts.ts";

/** What an issue says, whoever reads it. */
export interface IssueContent {
  /** the language it is written in: English unless it says so */
  written?: Locale;
  subject: string;
  /** the inbox's preview line: the lede without one */
  preheader?: string;
  /** the quiet line over the title: its number and month */
  issue?: string;
  title: string;
  lede?: string;
  /** one short line on what stands further down */
  ahead?: string;
  /** the palettes the admins liked, each in its view: the issue draws no other */
  liked: readonly PaletteView[];
  /** the palettes it opens with, each once. The first leads */
  picks?: readonly PaletteOptions[];
  /** the way on from the picks, to the list they came from */
  more?: { label: string; href: string };
  body: Parts;
  /** the ways back to the site at the foot; the home page without them */
  links?: readonly { label: string; href: string }[];
}

export interface NewsletterOptions extends IssueContent {
  origin: string;
  /** the reader's language: the foot's line is in it, and the links the email writes lead to the site in it */
  locale?: Locale;
  /** the head without picks: a palette, else the brand */
  palette?: PaletteView;
  scheme?: "auto" | "light" | "dark";
  /** why the reader gets it */
  reason: string;
  /** where one press ends it */
  unsubscribe: { label: string; href: string };
  /** the sender's postal address, which some readers' laws ask a newsletter to carry */
  postal?: string;
}

function issueEmail(options: NewsletterOptions): EmailOptions {
  const picks = options.picks ?? [];
  if (new Set(picks.map(pick => pick.seed)).size !== picks.length) {
    throw new Error("An issue shows each of its picked palettes once");
  }
  const [lead, ...others] = picks;
  const opening = stack(
    "s6",
    stack(
      "s3",
      options.issue ? named("issue", eyebrow(options.issue)) : null,
      title(options.title, { large: true }),
      options.lede ? text(options.lede, { role: "lede" }) : null,
      options.ahead ? text(options.ahead, { role: "small" }) : null
    ),
    others.length > 0 && palettes(others),
    options.more && button({ ...options.more, quiet: true })
  );
  return {
    origin: options.origin,
    locale: options.locale,
    written: options.written ?? DEFAULT_LOCALE,
    scheme: options.scheme,
    subject: options.subject,
    preheader: options.preheader ?? options.lede,
    width: "letter",
    gap: "s8",
    ...(lead ? { lead: { chips: true, ...lead } } : { palette: options.palette }),
    liked: options.liked,
    body: [opening, ...options.body],
    foot: [
      options.links?.length ? links(...options.links) : home,
      readers(
        text([options.reason, " ", link(options.unsubscribe.label, options.unsubscribe.href)], {
          role: "small"
        })
      ),
      options.postal ? text(options.postal, { role: "small" }) : null
    ]
  };
}

/** An issue of the newsletter. Every palette in it is one an admin liked, in the view liked: any other stops it being
    made. */
export const newsletter = (options: NewsletterOptions): Letter => email(issueEmail(options));
/** The same issue as a page of the site shows it: its email's own sheet, head and foot and all, without the wash. */
export const issuePage = (options: NewsletterOptions): { html: string; text: string } =>
  inset(issueEmail(options));

/** An issue as the site keeps it: written in the repository, a module each. One with no `published` day is a draft. */
export interface Issue {
  number: number;
  /** the month it is for: 2026-10 */
  month: string;
  /** the day it was published: 2026-10-08 */
  published?: string;
  /** what it says, with the site's address for its links */
  write(origin: string): IssueContent;
}

/** A palette in the view an admin liked it in. */
export const view = (
  seed: string,
  style: Style,
  steps: number,
  angle: number
): Required<PaletteView> => ({
  seed,
  style,
  steps,
  angle
});
/** A pick: a liked palette under a name written for the issue, its style's name at the end of the row. */
export const pick = (
  seed: string,
  style: Style,
  steps: number,
  angle: number,
  name: string
): PaletteOptions => ({
  ...view(seed, style, steps, angle),
  name,
  note: STYLE_LABELS[style]
});
/** A collection as an issue shows one: its title, its address, what it holds, and five of its palettes as tiles or its
    card: palettes it holds, each in a view of the card's own design. */
export interface Shelf {
  title: string;
  slug: string;
  note: string;
  about: string;
  tiles?: readonly PaletteView[];
  card?: readonly PaletteView[];
}
export const shelf =
  (origin: string) =>
  (of: Shelf): CollectionOptions => ({
    title: of.title,
    href: `${origin}/${of.slug}`,
    ...(of.card ? { card: { slug: of.slug, palettes: of.card } } : { tiles: of.tiles }),
    note: of.note,
    about: of.about
  });
/** The way on from the picks. */
export const rising = (origin: string) => ({
  label: "See all rising palettes",
  href: `${origin}/palettes/rising`
});
/** The line under every issue's title. */
export const LEDE = "Five palettes from the Rising list, picked by hand.";
/** The ways back to the site at the foot, the last one the issue's own. */
export const ways = (origin: string, last: { label: string; href: string }) => [
  { label: "Palettes", href: `${origin}/palettes` },
  { label: "Collections", href: `${origin}/collections` },
  last
];
