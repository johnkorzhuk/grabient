import { t } from "@grabient/i18n";
import { useHead } from "@solidjs/web";
import { Link } from "@tanstack/solid-router";

/** An address the site does not know, answered 404. */
export function NotFound() {
  useHead([
    { tag: "title", props: { children: `${t("Page not found")} | Grabient` } },
    { tag: "meta", props: { name: "robots", content: "noindex,follow" } }
  ]);
  return (
    <main id="main">
      <h1>{t("Page not found")}</h1>
      <p>{t("This address isn't a palette or a page.")}</p>
      <Link to="/palettes" activeOptions={{ exact: true }}>
        {t("Browse palettes")}
      </Link>
    </main>
  );
}
