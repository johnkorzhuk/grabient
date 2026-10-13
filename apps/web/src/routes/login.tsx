import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { LoginPage } from "../features/account/LoginPage.tsx";
import { NO_STORE } from "../lib/cache.ts";

/* Sign-in: the browser draws it, signed in or not, and the server sends the document alone. Its query keeps where it
   leads (`redirect`) and, back from Google, why that failed (`error`). */
export const Route = createFileRoute("/login")({
  ssr: false,
  staticData: { frame: "sheet", moving: true },
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    error: search.error === undefined ? undefined : String(search.error)
  }),
  headers: () => NO_STORE,
  head: () => ({
    meta: [{ title: t("Sign in") }, { name: "robots", content: "noindex,nofollow" }]
  }),
  component: Login
});

function Login() {
  const search = Route.useSearch();
  return <LoginPage redirect={search().redirect} error={search().error} />;
}
