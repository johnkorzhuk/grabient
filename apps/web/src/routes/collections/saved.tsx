import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { Placeholder } from "../../app/Placeholder.tsx";
import { NO_STORE } from "../../lib/cache.ts";

export const Route = createFileRoute("/collections/saved")({
  headers: () => NO_STORE,
  head: () => ({ meta: [{ title: t("Your collections") }] }),
  component: () => <Placeholder title={t("Your collections")} />
});
