import { locale } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { createFileRoute } from "@tanstack/solid-router";
import { BrandFrame } from "../app/Frames.tsx";
import { isAdmin } from "../features/account/session.ts";
import { NewsletterPage } from "../features/newsletter/NewsletterPage.tsx";
import { issuesQuery } from "../features/newsletter/queries.ts";
import { PAGE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

/* The newsletter's issues, each its email's own sheet on the page. The server reads the newest into the query's cache,
   which the document carries, and a read that fails there fails the page. A page reached in the browser is drawn at
   once: its issues come as they are read, or the line that says they did not. */
export const Route = createFileRoute("/newsletter")({
  staticData: { frame: "brand", still: true },
  headers: () => PAGE,
  loader: async ({ context }) => {
    const issues = issuesQuery(locale());
    if (isServer) await context.queryClient.ensureInfiniteQueryData(issues);
    else void context.queryClient.prefetchInfiniteQuery(issues);
  },
  head: () => pageHead({ kind: "newsletter" }),
  component: () => (
    <BrandFrame page="newsletter" open>
      <NewsletterPage admin={isAdmin()} />
    </BrandFrame>
  )
});
