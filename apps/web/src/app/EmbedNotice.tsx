import { t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { createSignal, onSettled, Show } from "solid-js";
import styles from "./EmbedNotice.module.css";
import { framed } from "./framed.ts";

/** Inside another site's frame: some features are limited here, and the page opens whole in a tab of its own. Found
    once the page is live, so the server draws the same empty place for every reader. */
export function EmbedNotice(props: {
  /** the page pins its stops along the foot of the screen: the note stands over the artwork's top corner */
  strip: boolean;
}) {
  const [shown, setShown] = createSignal(false);
  onSettled(() => {
    setShown(framed());
  });
  return (
    <Show when={shown()}>
      <aside
        class={styles.note}
        data-strip={props.strip ? "" : undefined}
        aria-label={t("Embedded view")}
      >
        <p class={styles.words}>{t("Some features are limited here.")}</p>
        <span class={styles.actions}>
          {/* the page's address at the press: the editor rewrites it in place */}
          <Button
            variant="ghost"
            size="sm"
            href={location.href}
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
            onClick={() => setShown(false)}
          >
            <Icon name="close" size={14} />
          </Button>
        </span>
      </aside>
    </Show>
  );
}
