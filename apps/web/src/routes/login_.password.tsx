import { createFileRoute } from "@tanstack/solid-router";
import { PasswordPage } from "../features/account/PasswordPage.tsx";
import { NO_STORE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

/* The reviewers' password sign-in, at an address no page links to and no search engine keeps or follows. */
export const Route = createFileRoute("/login_/password")({
  staticData: { frame: "sheet" },
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined
  }),
  headers: () => NO_STORE,
  head: () => pageHead({ kind: "login", robots: "noindex,nofollow" }),
  component: Password
});

function Password() {
  const search = Route.useSearch();
  return <PasswordPage redirect={search().redirect} />;
}
