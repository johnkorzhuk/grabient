import { createFileRoute } from "@tanstack/solid-router";
import { Languages } from "../app/Frames.tsx";
import { ConnectPage } from "../features/connect/Connect.tsx";
import { readConsent } from "../features/connect/queries.ts";
import { NO_STORE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

/* The consent page: the Worker reads the app's request before the page draws (a session that ended goes to sign-in on
   the way) and draws the sheet with what it read, as sign-in's sheet is drawn: the answer is private and never kept. */
export const Route = createFileRoute("/connect")({
  staticData: { frame: "sheet", still: true },
  headers: () => NO_STORE,
  loader: () => readConsent(),
  head: () => pageHead({ kind: "connect" }),
  component: Connect
});

function Connect() {
  const page = Route.useLoaderData();
  return <ConnectPage page={page()} languages={<Languages />} />;
}
