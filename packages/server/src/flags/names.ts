/* The features an admin can turn off for the whole site from Settings: work that costs money by the request and that
   the site can do without for a while, and a few free choices that can be taken back without a deploy. Every flag is
   on until an admin turns it off, but for the ones in STARTS_OFF, which wait for an admin to turn them on, and `all`
   turns every one off at once. A new paid feature adds its name here, answers before any paid call when its flag is
   off (flagOff), and still serves a good page then. The server package's README says what each one stops and what
   stands in.

   - model-search: Workers AI reading unknown search words, vector search, index writes, the sync's collection texts
   - share-images: drawing share cards and PNG downloads
   - mcp: the MCP server and connecting new apps
   - mcp-view: the palette view AI apps draw, free, but drawn by other apps
   - search-rebuild: the ten-minute job's search snapshot
   - palette-use: counting public palettes used
   - client-documents: advertising client metadata documents to new apps; connected apps keep refreshing
   - rising-3m, rising-1y: Rising's longer time frames, whose scores are kept either way
   - newsletter: the newsletter for readers: its page, its link, its issues; it starts off, and until an admin turns it
     on only admins read it and send themselves a test. An account's switch and unsubscribing always work
   - saving: accounts' and apps' writes (likes, collections, votes); reads keep working
   - email: sign-in links and codes and the contact form; deletion emails and owner alerts still go

   No imports: the Settings page reads this list too. */

export const FLAG_NAMES = [
  "all",
  "model-search",
  "share-images",
  "mcp",
  "mcp-view",
  "search-rebuild",
  "palette-use",
  "client-documents",
  "rising-3m",
  "rising-1y",
  "newsletter",
  "saving",
  "email"
] as const;

export type FlagName = (typeof FLAG_NAMES)[number];

/** The flags off until an admin turns them on: the newsletter, until its first issue goes out. */
export const STARTS_OFF: readonly FlagName[] = ["newsletter"];

export const isFlagName = (value: unknown): value is FlagName =>
  typeof value === "string" && (FLAG_NAMES as readonly string[]).includes(value);
