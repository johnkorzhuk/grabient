import { t } from "@grabient/i18n";
import { createFileRoute, notFound, redirect } from "@tanstack/solid-router";
import { Placeholder } from "../../app/Placeholder.tsx";
import { FRESH } from "../../lib/cache.ts";

/* Rising over the week is the list's own address; its longer frames are a last segment of their own. */
export const Route = createFileRoute("/palettes/rising/{-$frame}")({
  beforeLoad: ({ params, search }) => {
    if (params.frame === "1w") {
      throw redirect({
        to: "/palettes/rising/{-$frame}",
        params: { frame: undefined },
        search,
        statusCode: 301
      });
    }
    if (params.frame !== undefined && params.frame !== "3m" && params.frame !== "1y")
      throw notFound();
  },
  headers: () => FRESH,
  head: () => ({ meta: [{ title: t("Rising gradient palettes") }] }),
  component: () => <Placeholder title={t("Rising gradient palettes")} />
});
