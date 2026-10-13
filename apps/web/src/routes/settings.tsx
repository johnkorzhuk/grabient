import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { SettingsPage } from "../features/account/SettingsPage.tsx";
import { NO_STORE } from "../lib/cache.ts";

/* Settings: the browser draws it, signed in or not, and the server sends the document alone. A deletion email leads
   here with its `token`. */
export const Route = createFileRoute("/settings")({
  ssr: false,
  staticData: { frame: "brand", translated: true },
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined
  }),
  headers: () => NO_STORE,
  head: () => ({
    meta: [{ title: t("Settings") }, { name: "robots", content: "noindex,nofollow" }]
  }),
  component: Settings
});

function Settings() {
  const search = Route.useSearch();
  return <SettingsPage token={search().token} />;
}
