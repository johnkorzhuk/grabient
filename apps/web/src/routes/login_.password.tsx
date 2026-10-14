import { env } from "cloudflare:workers";
import { createFileRoute, notFound } from "@tanstack/solid-router";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { PasswordPage } from "../features/account/PasswordPage.tsx";
import { NO_STORE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

/* The reviewers' password sign-in, at an address no page links to and no search engine keeps or follows. It stands
   only on a deploy that names the reviewers' address: elsewhere every press of its form would end in Not found. */
const reviewing = createIsomorphicFn()
  .server(() => Boolean(env.REVIEWER_EMAIL))
  .client(() => true);

export const Route = createFileRoute("/login_/password")({
  staticData: { frame: "sheet" },
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined
  }),
  beforeLoad: () => {
    if (!reviewing()) throw notFound();
  },
  headers: () => NO_STORE,
  head: () => pageHead({ kind: "login", robots: "noindex,nofollow" }),
  component: Password
});

function Password() {
  const search = Route.useSearch();
  return <PasswordPage redirect={search().redirect} />;
}
