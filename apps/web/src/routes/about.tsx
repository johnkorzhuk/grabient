import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { Placeholder } from "../app/Placeholder.tsx";
import { PAGE } from "../lib/cache.ts";

export const Route = createFileRoute("/about")({
  headers: () => PAGE,
  head: () => ({ meta: [{ title: t("About Grabient") }] }),
  component: () => <Placeholder title={t("About Grabient")} />
});
