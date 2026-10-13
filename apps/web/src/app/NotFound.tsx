import { canonical, encodePalette } from "@grabient/engine/codec.ts";
import { localHref, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useHead } from "@solidjs/web";
import { inView, newPaletteHref } from "../features/list/appearance.ts";
import { AppPage } from "./Frames.tsx";
import styles from "./Lost.module.css";

/** The palette the editor opens on from here: a warm ramp of three keyframes. */
const EDITOR_SEED = encodePalette(
  canonical({
    anchors: [
      { l: 0.93, c: 0.05, h: 78 },
      { l: 0.66, c: 0.16, h: 32 },
      { l: 0.34, c: 0.13, h: 336 }
    ]
  })
);

/** An address the site does not know, answered 404 inside the frame, so the header and the water stay. The ways out
    take the reader's view: the palettes, and the editor on a palette of its own. */
export function NotFound() {
  useHead([
    { tag: "title", props: { children: `${t("Page not found")} | Grabient` } },
    { tag: "meta", props: { name: "robots", content: "noindex,follow" } }
  ]);
  return (
    <AppPage>
      <main id="main" class={styles.main}>
        <div class={styles.words}>
          <Text variant="micro" as="p">
            404
          </Text>
          <Text variant="title" as="h1">
            {t("Page not found")}
          </Text>
          <Text variant="lede">{t("This address isn't a palette or a page.")}</Text>
        </div>
        <div class={styles.actions}>
          <Button size="lg" href={localHref(inView("/palettes"))}>
            {t("Browse palettes")}
          </Button>
          <Button size="lg" variant="primary" href={localHref(newPaletteHref(EDITOR_SEED))}>
            {t("Open editor")}
          </Button>
        </div>
      </main>
    </AppPage>
  );
}
