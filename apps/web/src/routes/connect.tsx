import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { ConnectPage } from "../features/connect/Connect.tsx";
import { readConsent } from "../features/connect/queries.ts";
import { NO_STORE } from "../lib/cache.ts";

/* The consent page: the Worker reads the app's request before the page draws (a session that ended goes to sign-in on
   the way), and the browser draws it alone. */
export const Route = createFileRoute("/connect")({
  ssr: "data-only",
  headers: () => NO_STORE,
  loader: () => readConsent(),
  head: () => ({
    meta: [
      { title: t("Connect an app") },
      { name: "description", content: t("Allow an app to use your Grabient account.") },
      { name: "robots", content: "noindex,nofollow" }
    ]
  }),
  component: Connect
});

function Connect() {
  const page = Route.useLoaderData();
  return <ConnectPage page={page()} />;
}
