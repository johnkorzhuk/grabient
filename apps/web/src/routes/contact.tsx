import { createFileRoute } from "@tanstack/solid-router";
import { BrandFrame } from "../app/Frames.tsx";
import { ContactPage } from "../features/contact/ContactPage.tsx";
import { PAGE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

export const Route = createFileRoute("/contact")({
  staticData: { frame: "brand", still: true },
  headers: () => PAGE,
  head: () => pageHead({ kind: "contact" }),
  component: () => (
    <BrandFrame page="contact">
      <ContactPage />
    </BrandFrame>
  )
});
