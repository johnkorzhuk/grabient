import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { Placeholder } from "../../app/Placeholder.tsx";
import { PAGE } from "../../lib/cache.ts";

export const Route = createFileRoute("/palettes/")({
  headers: () => PAGE,
  head: () => ({ meta: [{ title: t("Popular gradient palettes") }] }),
  component: () => <Placeholder title={t("Popular gradient palettes")} />
});
