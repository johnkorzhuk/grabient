import { t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { useLocation } from "@tanstack/solid-router";
import { createSignal, onSettled, Show } from "solid-js";
import styles from "./EmbedNotice.module.css";
import { framed } from "./framed.ts";

/* dismissed once for the visit, in whichever place it stood: the header's and the editor's are two notes */
const [dismissed, setDismissed] = createSignal(false);

/** Inside another site's frame: some features are limited here, and the page opens whole in a tab of its own. Found
    once the page is live, so the server draws the same empty place for every reader. It stands in the header, since
    the site that frames the page keeps the foot of the frame for its own (its ads); the editor, whose header holds its
    tools, keeps it over its artwork. */
export function EmbedNotice(props: {
  /** `header`: in the header's corner, and on a phone hung just under the header. `strip`: the editor, which pins its
      stops along the foot of the screen, over the artwork's top corner */
  place: "header" | "strip";
}) {
  const [shown, setShown] = createSignal(false);
  const here = useLocation();
  onSettled(() => {
    setShown(framed());
  });
  /* the page's address, read again as the page changes under the note */
  const whole = () => {
    here();
    return location.href;
  };
  return (
    <Show when={shown() && !dismissed()}>
      <aside class={styles.note} data-place={props.place} aria-label={t("Embedded view")}>
        <p class={styles.words}>{t("Some features are limited here.")}</p>
        <span class={styles.actions}>
          {/* and its address at the press: the editor rewrites it in place */}
          <Button
            variant="ghost"
            size="sm"
            href={whole()}
            external
            onClick={e => {
              (e.currentTarget as HTMLAnchorElement).href = location.href;
            }}
          >
            {t("Open Grabient")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon
            aria-label={t("Dismiss")}
            onClick={() => setDismissed(true)}
          >
            <Icon name="close" size={14} />
          </Button>
        </span>
      </aside>
    </Show>
  );
}
