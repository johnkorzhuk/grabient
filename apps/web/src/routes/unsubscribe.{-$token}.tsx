import { t } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { Placeholder } from "../app/Placeholder.tsx";
import { NO_STORE } from "../lib/cache.ts";

/* The newsletter's way out: /unsubscribe, or /unsubscribe/{token} from an issue. The address names an account, so the
   page is never framed, kept or named in a Referer (server/paths.ts). */
export const Route = createFileRoute("/unsubscribe/{-$token}")({
  ssr: false,
  headers: () => NO_STORE,
  head: () => ({ meta: [{ title: t("Unsubscribe") }] }),
  component: () => <Placeholder title={t("Unsubscribe")} />
});
