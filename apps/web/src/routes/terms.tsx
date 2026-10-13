import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { Placeholder } from "../app/Placeholder.tsx";
import { PAGE } from "../lib/cache.ts";

export const Route = createFileRoute("/terms")({
  headers: () => PAGE,
  head: () => ({ meta: [{ title: t("Terms of service") }] }),
  component: () => <Placeholder title={t("Terms of service")} />
});
