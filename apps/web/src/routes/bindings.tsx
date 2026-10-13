import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { Placeholder } from "../app/Placeholder.tsx";
import { PAGE } from "../lib/cache.ts";

export const Route = createFileRoute("/bindings")({
  headers: () => PAGE,
  head: () => ({ meta: [{ title: t("Keyboard shortcuts") }] }),
  component: () => <Placeholder title={t("Keyboard shortcuts")} />
});
