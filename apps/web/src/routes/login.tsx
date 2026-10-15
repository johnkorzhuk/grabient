import { createFileRoute } from "@tanstack/solid-router";
import { LoginPage } from "../features/account/LoginPage.tsx";
import { connectingScript } from "../features/account/return.ts";
import { NO_STORE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

/* Sign-in. The server draws the sheet as it stands for anyone and never reads the session: a reader already signed
   in is sent on by the browser. Its query keeps where it leads (`redirect`) and, back from Google, why that failed
   (`error`). */
export const Route = createFileRoute("/login")({
  staticData: { frame: "sheet", moving: true },
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    error: search.error === undefined ? undefined : String(search.error)
  }),
  headers: () => NO_STORE,
  head: () => ({ ...pageHead({ kind: "login" }), scripts: [{ children: connectingScript }] }),
  component: Login
});

function Login() {
  const search = Route.useSearch();
  return <LoginPage redirect={search().redirect} error={search().error} />;
}
