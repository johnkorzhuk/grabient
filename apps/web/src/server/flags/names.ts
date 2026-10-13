/* The features an admin can turn off for the whole site from Settings: work that costs money by the request and that
   the site can do without for a while, and a few free choices that can be taken back without a deploy. Every flag is
   on until an admin turns it off, and `all` turns every one off at once. A feature the daily ceilings already bound
   (sign-in email, likes, collection edits) has no flag. A new paid feature adds its name here, answers before any paid
   call when its flag is off (flagOff), and still serves a good page then.

   - model-search: Workers AI reading unknown search words, vector search, index writes
   - share-images: drawing share cards and PNG downloads
   - mcp: the MCP server and connecting new apps
   - mcp-view: the palette view AI apps draw, free, but drawn by other apps
   - search-rebuild: the ten-minute job's search snapshot
   - session-replay: the analytics proxy
   - palette-use: counting public palettes used
   - client-documents: advertising client metadata documents to new apps; connected apps keep refreshing
   - rising-3m, rising-1y: Rising's longer time frames, whose scores are kept either way
   - newsletter: the newsletter's issues; an account's switch and unsubscribing keep working

   No imports: the Settings page reads this list too. */

export const FLAG_NAMES = [
  "all",
  "model-search",
  "share-images",
  "mcp",
  "mcp-view",
  "search-rebuild",
  "session-replay",
  "palette-use",
  "client-documents",
  "rising-3m",
  "rising-1y",
  "newsletter"
] as const;

export type FlagName = (typeof FLAG_NAMES)[number];

export const isFlagName = (value: unknown): value is FlagName =>
  typeof value === "string" && (FLAG_NAMES as readonly string[]).includes(value);
