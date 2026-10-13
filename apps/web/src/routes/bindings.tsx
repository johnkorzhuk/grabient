import { createFileRoute } from "@tanstack/solid-router";
import { BrandFrame } from "../app/Frames.tsx";
import { BindingsPage } from "../features/bindings/BindingsPage.tsx";
import { PAGE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

export const Route = createFileRoute("/bindings")({
  staticData: { frame: "brand", still: true, translated: true },
  headers: () => PAGE,
  head: () => pageHead({ kind: "bindings" }),
  component: () => (
    <BrandFrame page="bindings">
      <BindingsPage />
    </BrandFrame>
  )
});
