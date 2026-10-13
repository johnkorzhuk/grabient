import { msg } from "@grabient/i18n";
import type { FlagState } from "@grabient/server/flags/flags.ts";
import { FLAG_NAMES, type FlagName } from "@grabient/server/flags/names.ts";
import { api } from "../session.ts";

/* The features an admin turns off for every visitor from Settings, each with its name and one line saying what it does
   while on, and what still works when off where that is not plain. The Worker decides what off stops; a flag without
   its words here does not compile. */
export const FLAGS: Readonly<Record<FlagName, { label: string; line: string }>> = {
  all: { label: msg("All features"), line: msg("When off, every feature below is off.") },
  "model-search": {
    label: msg("Search by meaning"),
    line: msg("Uses Workers AI for words the search doesn't know.")
  },
  "share-images": {
    label: msg("Share images"),
    line: msg("Draw share cards and PNG files on the server. When off, links show the site's card.")
  },
  mcp: {
    label: msg("MCP server"),
    line: msg("Let AI apps connect to accounts and use Grabient's tools over MCP.")
  },
  "mcp-view": {
    label: msg("Palette view in AI apps"),
    line: msg("Show palettes as cards inside AI apps. When off, apps get a link to each picture.")
  },
  "search-rebuild": {
    label: msg("Search index updates"),
    line: msg("Rebuild the search index as the site changes. When off, search keeps the last one.")
  },
  "session-replay": {
    label: msg("Session replay"),
    line: msg("Send the session recordings readers allow to PostHog.")
  },
  "palette-use": {
    label: msg("Palette use counts"),
    line: msg(
      "Count the palettes people open, copy and download, for the seeding agents. No address, account or cookie is kept."
    )
  },
  "client-documents": {
    label: msg("Client documents"),
    line: msg(
      "Let new apps sign in with the identity document their maker publishes. When off, new apps register themselves, and apps already connected keep working."
    )
  },
  "rising-3m": {
    label: msg("Rising over 3 months"),
    line: msg("Offer 3 months when a reader presses Rising again. When off, Rising skips it.")
  },
  "rising-1y": {
    label: msg("Rising over 1 year"),
    line: msg("Offer 1 year when a reader presses Rising again. When off, Rising skips it.")
  },
  newsletter: {
    label: msg("Newsletter"),
    line: msg(
      "Send issues of the newsletter. When off, none goes out, and unsubscribing still works."
    )
  },
  saving: {
    label: msg("Saving"),
    line: msg(
      "Save likes, collections and votes from accounts and their apps. When off, pages keep each change until saving is back, and reading still works."
    )
  },
  email: {
    label: msg("Email"),
    line: msg(
      "Send sign-in links and codes and contact messages. When off, sign-in offers Google, and deletion emails and owner alerts still go."
    )
  }
};

export { FLAG_NAMES, type FlagName, type FlagState };

/** Every flag as the server holds it, with who changed it last and when. An admin's alone. */
export const readFlags = async () => (await api<{ flags: FlagState[] }>("/api/me/flags")).flags;
/** One feature on or off for every visitor; every flag as the server holds it after. */
export const writeFlag = async (name: FlagName, on: boolean) =>
  (await api<{ flags: FlagState[] }>("/api/me/flags", { name, on }, "PUT")).flags;
