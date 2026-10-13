import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { Placeholder } from "../../app/Placeholder.tsx";
import { PAGE } from "../../lib/cache.ts";

export const Route = createFileRoute("/collections/")({
  headers: () => PAGE,
  head: () => ({ meta: [{ title: t("Gradient and color palette collections") }] }),
  component: () => <Placeholder title={t("Gradient and color palette collections")} />
});
