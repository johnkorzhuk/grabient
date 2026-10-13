import { createFileRoute } from "@tanstack/solid-router";
import { BrandFrame } from "../app/Frames.tsx";
import { LegalPage } from "../features/legal/LegalPage.tsx";
import { PAGE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

export const Route = createFileRoute("/terms")({
  staticData: { frame: "brand" },
  headers: () => PAGE,
  head: () => pageHead({ kind: "terms" }),
  component: () => (
    <BrandFrame page="terms">
      <LegalPage document="terms" />
    </BrandFrame>
  )
});
