import { t } from "@grabient/i18n";
import { createFileRoute, Link } from "@tanstack/solid-router";
import { PAGE } from "../lib/cache.ts";

export const Route = createFileRoute("/")({
  headers: () => PAGE,
  head: () => ({ meta: [{ title: t("Grabient — CSS Gradient Generator & Color Palettes") }] }),
  component: Home
});

/** The home's place: the Hot feed comes here. */
function Home() {
  return (
    <main id="main">
      <h1>Grabient</h1>
      <Link to="/palettes">{t("Browse palettes")}</Link>
    </main>
  );
}
