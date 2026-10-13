import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { BrandFrame } from "../app/Frames.tsx";
import { BindingsPage } from "../features/bindings/BindingsPage.tsx";
import { PAGE } from "../lib/cache.ts";

export const Route = createFileRoute("/bindings")({
  staticData: { frame: "brand", still: true, translated: true },
  headers: () => PAGE,
  head: () => ({ meta: [{ title: t("Keyboard shortcuts") }] }),
  component: () => (
    <BrandFrame page="bindings">
      <BindingsPage />
    </BrandFrame>
  )
});
