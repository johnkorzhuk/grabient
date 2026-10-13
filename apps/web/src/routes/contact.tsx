import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { BrandFrame } from "../app/Frames.tsx";
import { ContactPage } from "../features/contact/ContactPage.tsx";
import { PAGE } from "../lib/cache.ts";

export const Route = createFileRoute("/contact")({
  staticData: { frame: "brand", still: true, translated: true },
  headers: () => PAGE,
  head: () => ({ meta: [{ title: t("Contact") }] }),
  component: () => (
    <BrandFrame page="contact">
      <ContactPage />
    </BrandFrame>
  )
});
