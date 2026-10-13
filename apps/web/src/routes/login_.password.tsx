import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { PasswordPage } from "../features/account/PasswordPage.tsx";
import { NO_STORE } from "../lib/cache.ts";

/* The reviewers' password sign-in, at an address no page links to. */
export const Route = createFileRoute("/login_/password")({
  ssr: false,
  staticData: { frame: "sheet" },
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined
  }),
  headers: () => NO_STORE,
  head: () => ({
    meta: [{ title: t("Sign in") }, { name: "robots", content: "noindex,nofollow" }]
  }),
  component: Password
});

function Password() {
  const search = Route.useSearch();
  return <PasswordPage redirect={search().redirect} />;
}
