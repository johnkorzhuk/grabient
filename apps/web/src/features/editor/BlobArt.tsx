import { encodePalette } from "@grabient/engine/codec.ts";
import { blobStillKey, type EffectSettings } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import { blobStillBackground, loadBlob, serverBlobStill } from "./blob-draw.ts";
import styles from "./Editor.module.css";

/** How often the small picture is drawn while its palette, look or angle keeps changing: a drag changes them every
    frame, and each still is a new image to decode, which holds up the frame that shows it. A change after a rest is
    drawn at once; while the hand moves, at most once in this, and the last change once it rests. The big picture
    shows every change. */
const REST_MS = 250;

/** The blob's first frame as a small picture filling its box: the Appearance menu's tile and the header's swatch. It
    names the still it shows, so the server's still (server/blob-still.ts) paints it where it is that one, as it painted
    the first screen's swatch (EditorCorner.tsx): nothing changes as the editor takes the header over. Another still
    is drawn here once the blob's code has come, on the page's ground where the blob has none of its own. */
export function BlobArt(props: {
  palette: Palette;
  settings: EffectSettings;
  /** the view's angle, which lays the palette across the blobs */
  angle: number;
  /** no ground of the page's under a blob with none of its own: a card's picture, where the blob stands on the list */
  bare?: boolean;
}) {
  const keyOf = () => blobStillKey(encodePalette(props.palette), props.settings.look, props.angle);
  /* the still the box shows: its name, and its picture where the server's style does not paint that name. It starts
     by naming its own, alike on the server, which cannot tell whether its style paints that name, and in the browser,
     so the page's markup and the browser's agree; the browser draws the picture where no style does */
  const [shown, setShown] = createSignal<{ key: string; paint: string | null } | null>({
    key: untrack(keyOf),
    paint: null
  });
  const [ready, setReady] = createSignal(false);
  onSettled(() => {
    void loadBlob().then(() => setReady(true));
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  /* when the last still was drawn */
  let drawnAt = Number.NEGATIVE_INFINITY;
  createEffect(
    () => ({
      key: keyOf(),
      ready: ready(),
      P: props.palette,
      s: props.settings,
      angle: props.angle,
      bare: props.bare === true
    }),
    next => {
      clearTimeout(timer);
      const now = untrack(shown);
      if (now?.key === next.key && (now.paint !== null || serverBlobStill(next.key))) return;
      const draw = () => {
        if (serverBlobStill(next.key)) return setShown({ key: next.key, paint: null });
        const paint = blobStillBackground(
          next.P,
          next.s,
          next.angle,
          next.bare ? undefined : "var(--color-bg)"
        );
        if (paint) {
          drawnAt = performance.now();
          setShown({ key: next.key, paint });
        }
      };
      const wait = drawnAt + REST_MS - performance.now();
      if (!now || (next.ready && wait <= 0)) draw();
      else if (next.ready) timer = setTimeout(draw, wait);
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
