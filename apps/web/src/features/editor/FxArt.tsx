import { encodePalette } from "@grabient/engine/codec.ts";
import { type FxLook, fxStillKey, type VectorKind } from "@grabient/engine/effect.ts";
import { fxPictureOf } from "@grabient/engine/fx-picture.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { createEffect, createMemo, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import styles from "./Editor.module.css";
import { fxPlacedBackground, fxStillSteps, fxTraceAway, loadFx, serverFxStill } from "./fx-draw.ts";

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
    (engine/fx-still.ts fxStillSteps), a frame's share at a time, so no task holds the page. The strings' threads at a
    new view, some 85 to 150 ms, whose last step fits every curve at once, are traced in a worker (fx-trace.ts), and
    the still waits out of turn until they are kept. */
const SHARE_MS = 6;

/* A drawing of a still, a step a call: true once it is drawn. */
type Steps = () => boolean;
/* The still a picture shows: its name, the background it paints (none where the head's style paints it), and the
   address of the server's picture where it is one. */
type Shown = { key: string; paint: string | null; address?: string };

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
    still is drawn here once the stills' code has come, or, on a list's card of a kind whose still the server draws as
    a picture (EFFECT_KINDS' picture: the aurora's), is that picture, with no code of its own. */
export function FxArt(props: {
  kind: VectorKind;
  palette: Palette;
  angle: number;
  shape: number | null;
  /** the look's steps, where the effect takes them (engine/effect.ts EffectLook): null as designed */
  steps: number | null;
  /** the look's zoom, where the effect takes one (engine/effect.ts EffectLook): null as designed */
  zoom: number | null;
  /** the look's path, where the effect takes one (engine/effect.ts EffectLook): null as designed */
  path: string | null;
  /** the look's ground, where the effect takes one (engine/effect.ts EffectLook): null as designed */
  bg: string | null;
  /** where the pointer left an effect it moves (the dimple's hollow), in this box 0 to 1 each way: the picture
      drawn that way in its still's place, so a card whose player has gone holds it (John, 10 Nov 2026: "just have it
      hold its last posisiion instead of resetting to the center"); none, its still */
  at?: readonly [number, number] | null;
  /** its palette stands, as a list's card's does: its still is the server's picture where its kind has one
      (EFFECT_KINDS' picture: the aurora's, sharp where its vector still is a stand-in under a blur), drawn once a
      palette and look and kept, so a picture whose palette an edit changes (the editor's own) keeps its vector still */
  picture?: boolean;
}) {
  let el!: HTMLSpanElement;
  const code = createMemo(() => encodePalette(props.palette));
  const look = (): FxLook => ({
    angle: props.angle,
    shape: props.shape,
    steps: props.steps,
    zoom: props.zoom,
    path: props.path,
    bg: props.bg
  });
  const keyOf = () => fxStillKey(props.kind, code(), look());
  /* the still shown: its name, the background this picture paints (none where the head's style does), and the address
     of the server's picture it shows, where it is one */
  const [shown, setShown] = createSignal<Shown | null>({ key: untrack(keyOf), paint: null });
  const [ready, setReady] = createSignal(false);
  const [inView, setInView] = createSignal(true);
  /* the server's picture of its still, where its palette stands and its look is one drawn as a picture
     (engine/fx-picture.ts fxPictureOf): shown in place of the vector still once it has loaded, the vector still first,
     the head's or drawn here, so the card is never empty while it comes (John, 14 Nov 2026: "The idea a user using the
     effect would get a vector to load first, so that something is visible as soon as the page loads"); one that does
     not load (drawing paused, or the day's pictures spent) leaves the vector still */
  const pictureNow = () => (props.picture ? fxPictureOf(props.kind, code(), look()) : null);
  const load = () => void loadFx().then(() => setReady(true));
  onSettled(() => {
    if (!untrack(pictureNow)) load();
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
      seen: inView(),
      picture: pictureNow()
    }),
    next => {
      clearTimeout(timer);
      cancel?.();
      const now = untrack(shown);
      /* its picture shows already */
      if (now?.key === next.key && now.address) return;
      let gone = false;
      let unturn: (() => void) | undefined;
      let away: (() => void) | null = null;
      let image: HTMLImageElement | null = null;
      cancel = () => {
        gone = true;
        unturn?.();
        away?.();
        if (image) image.onload = null;
      };
      /* the picture, once loaded, in place of whatever still shows, its drawing here stopped */
      const drawn = next.picture;
      if (drawn) {
        image = new Image();
        image.onload = () => {
          if (gone) return;
          cancel?.();
          setShown({ key: next.key, paint: drawn.paint, address: drawn.address });
        };
        image.src = drawn.address;
      }
      if (now?.key === next.key && (now.paint !== null || serverFxStill(next.key))) return;
      /* the stills' code, asked for once a still is drawn here */
      if (!next.ready) {
        load();
        return;
      }
      let steps: Iterator<void, string> | null = null;
      /* the part of its drawing a worker takes, asked for once before its steps (the strings' threads at a view none
         has traced: fx-trace.ts): the still waits out of turn until it is kept, then is drawn in turn */
      let asked = false;
      const step: Steps = () => {
        if (gone) return true;
        if (serverFxStill(next.key)) {
          setShown({ key: next.key, paint: null });
          return true;
        }
        if (!asked) {
          asked = true;
          away = fxTraceAway(next.kind, next.P, next.look, () => {
            away = null;
            if (!gone) turn();
          });
          if (away) return true;
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
        unturn = inTurn(self, step);
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
