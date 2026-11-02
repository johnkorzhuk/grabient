import { encodePalette } from "@grabient/engine/codec.ts";
import { blobStillKey, type EffectSettings } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { createEffect, createMemo, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import { blobStillBackground, loadBlob, serverBlobStill } from "./blob-draw.ts";
import styles from "./Editor.module.css";

/** How often the small picture is drawn while its palette or look keeps changing: a drag changes them every
    frame, and each still is a new image to decode, which holds up the frame that shows it. A change after a rest is
    drawn in the picture's turn; while the hand moves, at most once in this, and the last change once it rests. The big
    picture shows every change. */
const REST_MS = 250;
/** How long a picture out of the window waits for its palette or look to rest before its still is drawn. */
const AWAY_MS = 300;

/* A still is a new SVG image the browser reads, lays out and paints before the frame that shows it, some milliseconds
   each, and a page of them changing together (a list's cards as a field is stepped) drew them all before one frame:
   a frame draws one now, each picture in its turn with its latest still. A picture's first still is drawn at once. */
const waiting = new Map<object, () => void>();
let ticking = false;
const drawNext = () => {
  const next = waiting.entries().next();
  if (!next.done) {
    const [who, draw] = next.value;
    waiting.delete(who);
    draw();
  }
  ticking = waiting.size > 0;
  if (ticking) requestAnimationFrame(drawNext);
};
/** Draws in a frame of its own after those asked for before; asked again while it waits, it goes to the back with its
    latest draw. The way out takes it back. */
function inTurn(who: object, draw: () => void): () => void {
  waiting.set(who, draw);
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(drawNext);
  }
  return () => waiting.delete(who);
}

/** The blob's first frame as a small picture filling its box: the Appearance menu's tile and the header's swatch. It
    names the still it shows, so the server's still (server/blob-still.ts) paints it where it is that one, as it painted
    the first screen's swatch (EditorCorner.tsx): nothing changes as the editor takes the header over. Another still
    is drawn here once the blob's code has come, on the page's ground where the blob has none of its own. */
export function BlobArt(props: {
  palette: Palette;
  settings: EffectSettings;
  /** no ground of the page's under a blob with none of its own: a card's picture, where the blob stands on the list */
  bare?: boolean;
}) {
  let el!: HTMLSpanElement;
  /* the palette's code once a palette: the still's name reads it with every change of the look */
  const code = createMemo(() => encodePalette(props.palette));
  const keyOf = () => blobStillKey(code(), props.settings.look);
  /* the still the box shows: its name, and its picture where the server's style does not paint that name. It starts
     by naming its own, alike on the server, which cannot tell whether its style paints that name, and in the browser,
     so the page's markup and the browser's agree; the browser draws the picture where no style does */
  const [shown, setShown] = createSignal<{ key: string; paint: string | null } | null>({
    key: untrack(keyOf),
    paint: null
  });
  const [ready, setReady] = createSignal(false);
  /* in the window: one out of it keeps its still while a change goes on, and takes the last once it rests */
  const [inView, setInView] = createSignal(true);
  onSettled(() => {
    void loadBlob().then(() => setReady(true));
    const view = new IntersectionObserver(entries =>
      setInView(entries[entries.length - 1].isIntersecting)
    );
    view.observe(el);
    return () => view.disconnect();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const self = {};
  /* when the last still was drawn */
  let drawnAt = Number.NEGATIVE_INFINITY;
  createEffect(
    () => ({
      key: keyOf(),
      ready: ready(),
      P: props.palette,
      s: props.settings,
      bare: props.bare === true,
      seen: inView()
    }),
    next => {
      clearTimeout(timer);
      cancel?.();
      const now = untrack(shown);
      if (now?.key === next.key && (now.paint !== null || serverBlobStill(next.key))) return;
      const draw = () => {
        if (serverBlobStill(next.key)) {
          setShown({ key: next.key, paint: null });
          return;
        }
        const paint = blobStillBackground(
          next.P,
          next.s,
          next.bare ? undefined : "var(--color-bg)"
        );
        if (paint) {
          drawnAt = performance.now();
          setShown({ key: next.key, paint });
        }
      };
      if (!next.ready) return;
      /* the first still at once; a picture showing one draws the next in its turn */
      if (!now || (now.paint === null && !serverBlobStill(now.key))) {
        draw();
        return;
      }
      const turn = () => {
        cancel = inTurn(self, draw);
      };
      const wait = drawnAt + REST_MS - performance.now();
      if (!next.seen) timer = setTimeout(turn, AWAY_MS);
      else if (wait <= 0) turn();
      else timer = setTimeout(turn, wait);
    }
  );
  onCleanup(() => {
    clearTimeout(timer);
    cancel?.();
  });
  return (
    <span
      ref={el}
      class={styles.blobArt}
      data-bare={props.bare ? "" : undefined}
      data-blob-still={shown()?.key}
      style={{ background: shown()?.paint ?? undefined }}
    />
  );
}
