import { t } from "@grabient/i18n";
import { getRequestEvent, isServer } from "@solidjs/web";
import type { ErrorComponentProps } from "@tanstack/solid-router";

/** A page that failed, in place of the page: the site around it goes on. On the server it marks the request, so the
    Worker answers 500 and no cache keeps the page. Retry loads the page again, with the build that serves it now. */
export function ErrorPage(props: ErrorComponentProps) {
  if (isServer) {
    console.error("Page failed", props.error);
    const event = getRequestEvent();
    if (event) event.locals.renderFailed = true;
  }
  return (
    <main id="main">
      <h1>{t("Something went wrong. Try again.")}</h1>
      <button type="button" onClick={() => location.reload()}>
        {t("Retry")}
      </button>
    </main>
  );
}
