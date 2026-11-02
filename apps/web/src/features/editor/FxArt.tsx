import { encodePalette } from "@grabient/engine/codec.ts";
import { fxStillKey, type VectorKind } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { createEffect, createMemo, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import styles from "./Editor.module.css";
import { fxStillBackground, loadFx, serverFxStill } from "./fx-draw.ts";

/** How often the small picture is drawn while its palette or look keeps changing (BlobArt.tsx): a change after a rest
    is drawn in the picture's turn; while the hand moves, at most once in this, and the last change once it rests. */
const REST_MS = 250;
/** How long a picture out of the window waits for its palette or look to rest before its still is drawn. */
const AWAY_MS = 300;

/* a frame draws one still, each picture in its turn with its latest (BlobArt.tsx) */
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
function inTurn(who: object, draw: () => void): () => void {
  waiting.set(who, draw);
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(drawNext);
  }
  return () => waiting.delete(who);
}

/** A vector effect's first frame (silk, rosette) as a small picture filling its box: the Appearance menu's tile, the
    header's swatch and a list's card. It names the still it shows, so the server's still (server/fx-still.ts) paints
    it where it is that one, as it painted the first screen: nothing changes as the page comes live. Another still is
    drawn here once the stills' code has come. */
export function FxArt(props: {
  kind: VectorKind;
  palette: Palette;
  angle: number;
  shape: number | null;
}) {
  let el!: HTMLSpanElement;
  const code = createMemo(() => encodePalette(props.palette));
  const look = () => ({ angle: props.angle, shape: props.shape });
  const keyOf = () => fxStillKey(props.kind, code(), look());
  const [shown, setShown] = createSignal<{ key: string; paint: string | null } | null>({
    key: untrack(keyOf),
    paint: null
  });
  const [ready, setReady] = createSignal(false);
  const [inView, setInView] = createSignal(true);
  onSettled(() => {
    void loadFx().then(() => setReady(true));
    const view = new IntersectionObserver(entries =>
      setInView(entries[entries.length - 1].isIntersecting)
    );
    view.observe(el);
    return () => view.disconnect();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const self = {};
  let drawnAt = Number.NEGATIVE_INFINITY;
  createEffect(
    () => ({
      key: keyOf(),
      ready: ready(),
      kind: props.kind,
      P: props.palette,
      look: look(),
      seen: inView()
    }),
    next => {
      clearTimeout(timer);
      cancel?.();
      const now = untrack(shown);
      if (now?.key === next.key && (now.paint !== null || serverFxStill(next.key))) return;
      const draw = () => {
        if (serverFxStill(next.key)) {
          setShown({ key: next.key, paint: null });
          return;
        }
        const paint = fxStillBackground(next.kind, next.P, next.look);
        if (paint) {
          drawnAt = performance.now();
          setShown({ key: next.key, paint });
        }
      };
      if (!next.ready) return;
      if (!now || (now.paint === null && !serverFxStill(now.key))) {
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
      class={styles.glassArt}
      data-fx-still={shown()?.key}
      style={{ background: shown()?.paint ?? undefined }}
    />
  );
}
