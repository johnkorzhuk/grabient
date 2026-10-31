import { encodePalette } from "@grabient/engine/codec.ts";
import { blobStillKey, type EffectSettings } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import { blobStillBackground, loadBlob, serverBlobStill } from "./blob-draw.ts";
import styles from "./Editor.module.css";

/** How long a palette or a look stands before the small picture is drawn for it: a drag changes the palette every
    frame, and each still is a new image to decode, which holds up the frame that shows it. The big picture shows
    every change; this one catches up once the hand rests. */
const REST_MS = 250;

/** The blob's first frame as a small picture filling its box: the Appearance menu's tile and the header's swatch. It
    names the still it shows, so the server's still (server/blob-still.ts) paints it where it is that one, as it painted
    the first screen's swatch (EditorCorner.tsx): nothing changes as the editor takes the header over. Another still
    is drawn here once the blob's code has come, at once the first time and after that once the palette or the look
    rests, on the page's ground where the blob has none of its own. */
export function BlobArt(props: {
  palette: Palette;
  settings: EffectSettings;
  /** no ground of the page's under a blob with none of its own: a card's picture, where the blob stands on the list */
  bare?: boolean;
}) {
  const keyOf = () => blobStillKey(encodePalette(props.palette), props.settings.look);
  const first = untrack(keyOf);
  /* the still the box shows: its name, and its picture where the server's style does not paint that name */
  const [shown, setShown] = createSignal<{ key: string; paint: string | null } | null>(
    serverBlobStill(first) ? { key: first, paint: null } : null
  );
  const [ready, setReady] = createSignal(false);
  onSettled(() => {
    void loadBlob().then(() => setReady(true));
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(
    () => ({ key: keyOf(), ready: ready(), P: props.palette, s: props.settings }),
    next => {
      clearTimeout(timer);
      const now = untrack(shown);
      if (now?.key === next.key) return;
      const draw = () => {
        if (serverBlobStill(next.key)) return setShown({ key: next.key, paint: null });
        const paint = blobStillBackground(
          next.P,
          next.s,
          props.bare ? undefined : "var(--color-bg)"
        );
        if (paint) setShown({ key: next.key, paint });
      };
      if (!now) draw();
      else if (next.ready) timer = setTimeout(draw, REST_MS);
    }
  );
  onCleanup(() => clearTimeout(timer));
  return (
    <span
      class={styles.blobArt}
      data-bare={props.bare ? "" : undefined}
      data-blob-still={shown()?.key}
      style={{ background: shown()?.paint ?? undefined }}
    />
  );
}
