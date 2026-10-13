import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { Placeholder } from "../app/Placeholder.tsx";
import { PAGE } from "../lib/cache.ts";

export const Route = createFileRoute("/contact")({
  headers: () => PAGE,
  head: () => ({ meta: [{ title: t("Contact") }] }),
  component: () => <Placeholder title={t("Contact")} />
});
