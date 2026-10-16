import { createFileRoute } from "@tanstack/solid-router";
import { BrandFrame } from "../app/Frames.tsx";
import { AboutPage } from "../features/about/AboutPage.tsx";
import { PAGE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

export const Route = createFileRoute("/about")({
  staticData: { frame: "brand", still: true },
  headers: () => PAGE,
  head: () => pageHead({ kind: "about" }),
  component: () => (
    <BrandFrame page="about">
      <AboutPage />
    </BrandFrame>
  )
});
