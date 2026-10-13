import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { BrandFrame } from "../app/Frames.tsx";
import { LegalPage } from "../features/legal/LegalPage.tsx";
import { PAGE } from "../lib/cache.ts";

export const Route = createFileRoute("/terms")({
  staticData: { frame: "brand" },
  headers: () => PAGE,
  head: () => ({ meta: [{ title: t("Terms of service") }] }),
  component: () => (
    <BrandFrame page="terms">
      <LegalPage document="terms" />
    </BrandFrame>
  )
});
