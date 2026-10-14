import { createFileRoute } from "@tanstack/solid-router";
import { SettingsPage } from "../features/account/SettingsPage.tsx";
import { keptAccountScript } from "../features/account/session.ts";
import { NO_STORE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

/* Settings. The server draws the page as it stands for anyone, with no account and none of the browser's choices: it
   never reads the session, and the browser fills in the rest once the page has started. A deletion email leads here
   with its `token`. */
export const Route = createFileRoute("/settings")({
  staticData: { frame: "brand", translated: true },
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined
  }),
  headers: () => NO_STORE,
  head: () => ({ ...pageHead({ kind: "settings" }), scripts: [{ children: keptAccountScript }] }),
  component: Settings
});

function Settings() {
  const search = Route.useSearch();
  return <SettingsPage token={search().token} />;
}
