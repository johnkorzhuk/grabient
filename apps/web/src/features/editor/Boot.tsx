import { lchToP3, toCssP3 } from "@grabient/engine/color.ts";
import { gradientCss } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import {
  blobStillKey,
  fxStillKey,
  groundParts,
  isVectorKind,
  type VectorKind
} from "@grabient/engine/effect.ts";
import { glassColors, glassStillKey } from "@grabient/engine/glass-colors.ts";
import { effectSoftShare, GRAIN_MAX, isFixedSize } from "@grabient/engine/view.ts";
import { t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Like } from "@grabient/ui/Like.tsx";
import sheet from "@grabient/ui/PaletteSheet.module.css";
import { StillStrip } from "@grabient/ui/StopStrip.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createMemo, Show } from "solid-js";
import { GRAIN_IMAGE, pictureCss, pictureOf } from "../../lib/picture.ts";
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
  /* the stage's picture as the editor paints it, its soft and its grain too (lib/picture.ts) */
  const art = (wide: boolean) =>
    view().soft
      ? pictureCss(
          pictureOf(sampleStops(props.page.palette, view().steps), view(), wide),
          view().angle
        )
      : gradientCss(
          stops().map(s => (wide ? s.paint : s.hex)),
          view().style,
          view().angle
        );
  /* a soft blob with no ground of its own, or one that lets the page through, stands on the page, as the editor lays
     it (Editor.tsx under): its edges go to the page's ground, not the gradient */
  const under = (wide: boolean) => {
    const effect = props.page.effect;
    const bg = effect?.kind === "blob" ? effect.look.bg : undefined;
    return effect?.kind === "blob" && view().soft && (!bg || groundParts(bg).alpha < 1)
      ? "var(--color-bg)"
      : art(wide);
  };
  /* the fluted glass's still over the gradient, where the glass may play: an address that names it, or one that names
     no style, which takes the reader's own choice (effects.ts: the glass, unless this browser chose otherwise, when
     effectScript hides it before the first paint). The holder names the still (its ribs' angle and the palette's
     colors), which the server's style in the head paints (server/glass-still.ts), and the editor's holder names it
     too (GlassLayer.tsx) */
  const glassMay = () => props.page.effect?.kind === "glass" || !props.page.styled;
  const glass = () => (
    <Show when={glassMay()}>
      <div class={styles.glass}>
        <div
          class={styles.glassStill}
          data-glass-still={glassStillKey(
            glassColors(props.page.palette),
            props.page.view.angle,
            props.page.effect?.kind === "glass" ? props.page.effect.look.shape : null
          )}
        />
      </div>
    </Show>
  );
  /* the blob's still, where the address names the blob: the holder names it (its palette and its look), which the
     server's style in the head paints (server/blob-still.ts), as the editor's holder does (BlobLayer.tsx), on the
     page's own ground where the blob has none of its own */
  const blob = () => (
    <Show when={props.page.effect?.kind === "blob" ? props.page.effect.look : null}>
      {look => (
        <div class={styles.blob}>
          <div class={styles.glassStill} data-blob-still={blobStillKey(props.page.seed, look())} />
        </div>
      )}
    </Show>
  );
  /* a vector effect's still (silk, rosette, papercut), where the address names one: the holder names it (its kind,
     palette, angle and shape), which the server's style in the head paints (server/fx-still.ts), as the editor's holder
     does (FxLayer.tsx) */
  const fx = () => (
    <Show when={isVectorKind(props.page.effect?.kind) ? props.page.effect : null}>
      {effect => (
        <div class={styles.fx}>
          <div
            class={styles.glassStill}
            data-fx-still={fxStillKey(effect().kind as VectorKind, props.page.seed, {
              angle: props.page.view.angle,
              shape: effect().look.shape
            })}
          />
        </div>
      )}
    </Show>
  );
  /* an effect's soft, as the editor blurs it (Editor.tsx fxBlur) */
  const fxBlur = () =>
    props.page.effect && view().soft
      ? `blur(${(effectSoftShare(view().soft ?? 0) * 100).toFixed(3)}cqmax)`
      : undefined;
  /* the grain over the picture, as the editor lays it (Editor.tsx): the tile at full strength at the grain's opacity */
  const grain = () => (
    <Show when={view().grain}>
      <span
        class={styles.grain}
        style={{
          "background-image": GRAIN_IMAGE,
          opacity: String((view().grain ?? 0) / GRAIN_MAX)
        }}
        aria-hidden="true"
      />
    </Show>
  );
  /* a size with an auto side is the stage's own shape, which only the editor measures: its stage stands empty */
  const fixed = () => {
    const size = view().size;
    return isFixedSize(size) ? size : null;
  };
  return (
    <div
      class={[styles.page, styles.boot]}
      style={{ "--art": under(false), "--art-p3": under(true) }}
      /* inert: no key or pointer reaches it and no assistive technology reads it, the editor it stands for read once it
         comes. Not aria-hidden too, which inert makes needless: Chrome leaves what aria-hidden covers out of the largest
         contentful paint, and counted the editor drawing this same picture again, later, as the page's largest */
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
              <div class={styles.paint} style={{ "--fx-blur": fxBlur() }}>
                {glass()}
                {blob()}
                {fx()}
                {grain()}
              </div>
            </Show>
            <Show when={fixed()}>
              {size => (
                <div
                  class={styles.fitted}
                  style={{
                    "--ar": String(size().width / size().height),
                    "--w": `${size().width}px`,
                    "--fx-blur": fxBlur()
                  }}
                >
                  {glass()}
                  {blob()}
                  {fx()}
                  {grain()}
                </div>
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
