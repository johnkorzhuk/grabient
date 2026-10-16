import { env } from "cloudflare:workers";
import { locale } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { createFileRoute, notFound } from "@tanstack/solid-router";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { getRequest } from "@tanstack/solid-start/server";
import { BrandFrame } from "../app/Frames.tsx";
import { isAdmin } from "../features/account/session.ts";
import { NewsletterPage } from "../features/newsletter/NewsletterPage.tsx";
import { issuesQuery } from "../features/newsletter/queries.ts";
import { NO_STORE, PAGE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";
import type { NewsletterReader } from "../server/newsletter/access.ts";

/* How this visitor reads the newsletter (server/newsletter/access.ts): everyone once an admin has turned it on, and
   before then admins alone. The server knows the account from the request; the browser knows the site's facts, read
   with the document, and its own session. */
const readerOf = createIsomorphicFn()
  .server(async (_shown: boolean): Promise<NewsletterReader> => {
    const { newsletterReader } = await import("../server/newsletter/access.ts");
    return newsletterReader(env, getRequest());
  })
  .client(
    async (shown: boolean): Promise<NewsletterReader> =>
      shown ? "everyone" : isAdmin() ? "admin" : null
  );

/* The newsletter's issues, each its email's own sheet on the page. The server reads the newest into the query's cache,
   which the document carries, and a read that fails there fails the page. A page reached in the browser is drawn at
   once: its issues come as they are read, or the line that says they did not. Until the newsletter is on, it is no page
   to anyone but an admin, and an admin's is kept nowhere. */
export const Route = createFileRoute("/newsletter")({
  staticData: { frame: "brand", still: true },
  loader: async ({ context, parentMatchPromise }) => {
    const reader = await readerOf((await parentMatchPromise).loaderData?.newsletter ?? false);
    if (!reader) throw notFound();
    const issues = issuesQuery(locale());
    if (isServer) await context.queryClient.ensureInfiniteQueryData(issues);
    else void context.queryClient.prefetchInfiniteQuery(issues);
    return { hidden: reader === "admin" };
  },
  headers: ({ loaderData }) => (loaderData && !loaderData.hidden ? PAGE : NO_STORE),
  head: () => pageHead({ kind: "newsletter" }),
  component: Newsletter
});

function Newsletter() {
  const data = Route.useLoaderData();
  return (
    <BrandFrame page="newsletter" open>
      <NewsletterPage admin={isAdmin()} hidden={data().hidden} />
    </BrandFrame>
  );
}
