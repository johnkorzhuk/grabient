import { lchToP3, toCssP3 } from "@grabient/engine/color.ts";
import { gradientCss } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { isFixedSize } from "@grabient/engine/view.ts";
import { t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Like } from "@grabient/ui/Like.tsx";
import sheet from "@grabient/ui/PaletteSheet.module.css";
import { StillStrip } from "@grabient/ui/StopStrip.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createMemo, Show } from "solid-js";
import type { SeedPage } from "./address.ts";
import styles from "./Editor.module.css";
import { FilePicture } from "./FilePicture.tsx";

/** What the editor draws first, where it draws it, from the address alone: shown while the page boots (boot.ts), so
    the editor arriving changes nothing in the picture or the strip. The parts are the editor's own, with its classes:
    the picture in its stage, the rail while the side is away, the strip, and the sheet's name row under them with the
    palette's presses hidden at its end, as at rest; the side's place stands empty until its controls come. */
export function Boot(props: { page: SeedPage; title: string; likes: number; alt: string }) {
  const view = () => props.page.view;
  const stops = createMemo(() =>
    sampleStops(props.page.palette, view().steps).map(s => ({
      hex: s.hex,
      paint: toCssP3(lchToP3(...s.lch))
    }))
  );
  const art = (wide: boolean) =>
    gradientCss(
      stops().map(s => (wide ? s.paint : s.hex)),
      view().style,
      view().angle
    );
  /* a size with an auto side is the stage's own shape, which only the editor measures: its stage stands empty */
  const fixed = () => {
    const size = view().size;
    return isFixedSize(size) ? size : null;
  };
  return (
    <div
      class={[styles.page, styles.boot]}
      style={{ "--art": art(false), "--art-p3": art(true) }}
      aria-hidden="true"
      inert
      data-beside-scrollbar=""
    >
      <aside class={styles.side} />
      <div class={styles.scrolled}>
        <div class={styles.first}>
          <div class={styles.stage}>
            <Show when={!view().size}>
              <FilePicture
                class={styles.under}
                seed={props.page.seed}
                view={view()}
                alt={props.alt}
              />
              <div class={styles.paint} />
            </Show>
            <Show when={fixed()}>
              {size => (
                <div
                  class={styles.fitted}
                  style={{
                    "--ar": String(size().width / size().height),
                    "--w": `${size().width}px`
                  }}
                />
              )}
            </Show>
            <p class={styles.caption} dir="auto">
              {props.title}
            </p>
          </div>
          <div class={styles.railDock}>
            <div class={styles.rail}>
              <i class={styles.railLine} />
            </div>
          </div>
          <div class={styles.bar}>
            <StillStrip stops={stops()} />
          </div>
          <div class={[sheet.sheet, styles.named]}>
            <div class={[sheet.bleed, sheet.top]}>
              <div class={sheet.head}>
                <div class={sheet.name}>
                  <Text variant="title" as="div" dir="auto">
                    {props.title}
                  </Text>
                </div>
                <div class={sheet.takes} data-away="">
                  <div class={sheet.actions}>
                    <span class={styles.hung}>
                      <Like variant="plain" count={props.likes} />
                    </span>
                    <span class={styles.stack} data-flat="">
                      <Button variant="secondary" icon size="lg" aria-label={t("Add to selection")}>
                        <Icon name="plus" size={15} />
                      </Button>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class={styles.more} />
      </div>
    </div>
  );
}
