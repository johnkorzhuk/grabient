import { t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { getRequestEvent, isServer } from "@solidjs/web";
import type { ErrorComponentProps } from "@tanstack/solid-router";
import { useContext } from "solid-js";
import { reportCaught } from "./error-report.ts";
import { AppPage } from "./Frames.tsx";
import styles from "./Lost.module.css";
import { ShellContext } from "./shell.ts";

/** A page whose code failed, in its place: the frame around it and every other page go on, and Retry loads the page
    whole, with the build that serves it now. Where the frame itself failed, it stands alone in the document, which
    keeps its head and styles. On the server it marks the request, so the Worker answers 500 and no cache keeps the
    page; in the browser the failure is reported, since the window never hears of one a boundary took. */
export function ErrorPage(props: ErrorComponentProps) {
  if (isServer) {
    console.error("Page failed", props.error);
    const event = getRequestEvent();
    if (event) event.locals.renderFailed = true;
  } else reportCaught(props.error);
  return (
    <AppPage bare={!useContext(ShellContext)}>
      <main id="main" class={styles.main}>
        <div class={styles.words}>
          <Text variant="title" as="h1">
            {t("Something went wrong. Try again.")}
          </Text>
        </div>
        <Button size="lg" variant="primary" onClick={() => location.reload()}>
          {t("Retry")}
        </Button>
      </main>
    </AppPage>
  );
}
