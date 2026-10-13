/* @grabient/email: the emails Grabient sends, as HTML and plain text. Pure strings: no Solid, no DOM, no Cloudflare
   types. The parts list and the samples are their own modules (`@grabient/email/spec.ts`, `@grabient/email/sample.ts`). */
export { insetStyles, type Letter, type SheetColors, specimen } from "./document.ts";
export { pickHead } from "./head.ts";
export {
  type Issue,
  type IssueContent,
  issuePage,
  LEDE,
  type NewsletterOptions,
  newsletter,
  pick,
  rising,
  type Shelf,
  shelf,
  view,
  ways
} from "./issue.ts";
export { confirmDeletion, signInCode, signInLink } from "./letters.ts";
export {
  type CollectionOptions,
  collection,
  collections,
  type PaletteOptions,
  type PaletteView,
  palette,
  palettes,
  type Style,
  VIEW
} from "./palette.ts";
export { blurb, mentions, promo } from "./partner.ts";
export {
  type ButtonOptions,
  button,
  code,
  eyebrow,
  heading,
  type ImageOptions,
  type Inline,
  image,
  link,
  links,
  list,
  mono,
  note,
  type Part,
  rule,
  section,
  snippet,
  stack,
  strong,
  subheading,
  text,
  title
} from "./parts.ts";
export { BRAND, HEAD_CID, HEAD_FILES, SCHEMES, SIZE } from "./theme.ts";
