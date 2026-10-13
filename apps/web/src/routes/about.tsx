import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { BrandFrame } from "../app/Frames.tsx";
import { AboutPage } from "../features/about/AboutPage.tsx";
import { PAGE } from "../lib/cache.ts";

export const Route = createFileRoute("/about")({
  staticData: { frame: "brand", still: true, translated: true },
  headers: () => PAGE,
  head: () => ({ meta: [{ title: t("About Grabient") }] }),
  component: () => (
    <BrandFrame page="about">
      <AboutPage />
    </BrandFrame>
  )
});
