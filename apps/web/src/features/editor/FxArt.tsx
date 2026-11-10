import { encodePalette } from "@grabient/engine/codec.ts";
import { type FxLook, fxStillKey, type VectorKind } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { createEffect, createMemo, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import styles from "./Editor.module.css";
import { fxPlacedBackground, fxStillSteps, loadFx, serverFxStill } from "./fx-draw.ts";

/** How often the small picture is drawn while its palette or look keeps changing (BlobArt.tsx): a change after a rest
    is drawn in the picture's turn; while the hand moves, at most once in this, and the last change once it rests. */
const REST_MS = 250;
/** How long a picture out of the window waits for its palette or look to rest before its still is drawn. */
const AWAY_MS = 300;
/** The milliseconds of a task the first stills shown in it are drawn in at once, and of a frame the stills in turn:
    a list's cards come in a task, every one at a view a still has shown in a few tenths of a millisecond each (the
    papercut keeps its cuts by the view, engine/papercut-svg.ts), the silk's and the rosette's too, so they show from
    the frame they come in. A papercut's still at a new view takes some 10 ms on a desktop and 4 times that at
    Lighthouse's phone, its cuts traced from its field: it is drawn in steps of under a millisecond on a desktop
    (engine/fx-still.ts fxStillSteps), a frame's share at a time, so no task holds the page. */
const SHARE_MS = 6;

/* A drawing of a still, a step a call: true once it is drawn. */
type Steps = () => boolean;

/* the stills in turn, each picture with its latest, drawn for a frame's share at a time; one not done by then goes on
   first in the next frame */
const waiting = new Map<object, Steps>();
let ticking = false;
const drawSome = () => {
  const end = performance.now() + SHARE_MS;
  for (let next = waiting.entries().next(); !next.done; next = waiting.entries().next()) {
    const [who, step] = next.value;
    if (!until(step, end)) break;
    waiting.delete(who);
  }
  ticking = waiting.size > 0;
  if (ticking) requestAnimationFrame(drawSome);
};
function inTurn(who: object, steps: Steps): () => void {
  waiting.set(who, steps);
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(drawSome);
  }
  return () => waiting.delete(who);
}
/* steps taken until done, or until `end` once one is taken: true once done */
function until(step: Steps, end: number): boolean {
  do {
    if (step()) return true;
  } while (performance.now() < end);
  return false;
}
/* the end of the share of the task now running that first stills take at once, until the next task */
let taskEnd = -1;
function inTask(step: Steps): boolean {
  if (taskEnd < 0) {
    taskEnd = performance.now() + SHARE_MS;
    setTimeout(() => {
      taskEnd = -1;
    });
  }
  return performance.now() < taskEnd && until(step, taskEnd);
}

/** A vector effect's first frame (EFFECT_KINDS) as a small picture filling its box: the Appearance menu's
    tile, the header's swatch and a list's card. It names the still it shows, so the server's still (server/fx-still.ts)
    paints it where it is that one, as it painted the first screen: nothing changes as the page comes live. Another
    still is drawn here once the stills' code has come. */
export function FxArt(props: {
  kind: VectorKind;
  palette: Palette;
  angle: number;
  shape: number | null;
  /** the look's steps, where the effect takes them (engine/effect.ts EffectLook): null as designed */
  steps: number | null;
  /** the look's ground, where the effect takes one (engine/effect.ts EffectLook): null as designed */
  bg: string | null;
  /** where the pointer left an effect it moves (the dimple's hollow), in this box 0 to 1 each way: the picture
      drawn that way in its still's place, so a card whose player has gone holds it (John, 10 Nov 2026: "just have it
      hold its last posisiion instead of resetting to the center"); none, its still */
  at?: readonly [number, number] | null;
}) {
  let el!: HTMLSpanElement;
  const code = createMemo(() => encodePalette(props.palette));
  const look = (): FxLook => ({
    angle: props.angle,
    shape: props.shape,
    steps: props.steps,
    bg: props.bg
  });
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
      if (!next.ready) return;
      let steps: Iterator<void, string> | null = null;
      const step: Steps = () => {
        if (serverFxStill(next.key)) {
          setShown({ key: next.key, paint: null });
          return true;
        }
        steps ??= fxStillSteps(next.kind, next.P, next.look);
        const drawn = steps?.next();
        if (drawn && !drawn.done) return false;
        if (drawn) {
          drawnAt = performance.now();
          setShown({ key: next.key, paint: drawn.value });
        }
        return true;
      };
      const turn = () => {
        cancel = inTurn(self, step);
      };
      /* the first still: at once while the task has time for it, else in turn, one out of the window once it has
         been away a while */
      if (!now || (now.paint === null && !serverFxStill(now.key))) {
        if (!next.seen) timer = setTimeout(turn, AWAY_MS);
        else if (!inTask(step)) turn();
        return;
      }
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
  /* the picture as the pointer left it: the design is a square laid over the box as cover lays it, so a place in the
     box is one in the square's middle band */
  const [placed, setPlaced] = createSignal<string | null>(null);
  createEffect(
    () => ({
      at: props.at ?? null,
      ready: ready(),
      kind: props.kind,
      P: props.palette,
      look: look()
    }),
    next => {
      if (!next.at || !next.ready) {
        setPlaced(null);
        return;
      }
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      const side = Math.max(w, h);
      setPlaced(
        fxPlacedBackground(next.kind, next.P, next.look, [
          0.5 + ((next.at[0] - 0.5) * w) / side,
          0.5 + ((next.at[1] - 0.5) * h) / side
        ])
      );
    }
  );
  return (
    <span
      ref={el}
      class={styles.glassArt}
      data-fx-still={placed() ? undefined : shown()?.key}
      style={{ background: placed() ?? shown()?.paint ?? undefined }}
    />
  );
}
