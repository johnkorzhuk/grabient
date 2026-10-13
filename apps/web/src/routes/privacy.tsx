import { createFileRoute } from "@tanstack/solid-router";
import { BrandFrame } from "../app/Frames.tsx";
import { LegalPage } from "../features/legal/LegalPage.tsx";
import { PAGE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

export const Route = createFileRoute("/privacy")({
  staticData: { frame: "brand" },
  headers: () => PAGE,
  head: () => pageHead({ kind: "privacy" }),
  component: () => (
    <BrandFrame page="privacy">
      <LegalPage document="privacy" />
    </BrandFrame>
  )
});
