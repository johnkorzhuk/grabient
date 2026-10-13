import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { Placeholder } from "../../app/Placeholder.tsx";
import { NO_STORE } from "../../lib/cache.ts";

/* An account's page: the browser draws it, signed in or not, and the server sends the document alone. */
export const Route = createFileRoute("/palettes/saved")({
  ssr: false,
  headers: () => NO_STORE,
  head: () => ({ meta: [{ title: t("Saved palettes") }] }),
  component: () => <Placeholder title={t("Saved palettes")} />
});
