import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { BrandFrame } from "../app/Frames.tsx";
import { LegalPage } from "../features/legal/LegalPage.tsx";
import { PAGE } from "../lib/cache.ts";

export const Route = createFileRoute("/privacy")({
  staticData: { frame: "brand" },
  headers: () => PAGE,
  head: () => ({ meta: [{ title: t("Privacy policy") }] }),
  component: () => (
    <BrandFrame page="privacy">
      <LegalPage document="privacy" />
    </BrandFrame>
  )
});
