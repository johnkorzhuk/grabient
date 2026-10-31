import type { GlassView } from "@grabient/engine/glass.ts";
import { glassColors, glassStillKey } from "@grabient/engine/glass-colors.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { DEFAULT_ANGLE } from "@grabient/engine/view.ts";
import {
  createEffect,
  createSignal,
  Loading,
  lazy,
  onCleanup,
  onSettled,
  Show,
  untrack
} from "solid-js";
import styles from "./Editor.module.css";
import { loadStill, recolorStill, serverStill, stillSvg } from "./glass-draw.ts";

/* The fluted glass over the picture's gradient: its still at once, and the WebGL player over it once the page is live
   and the glass moves or its palette changes. The still is the server's where it shows this angle and these colors:
   the holder names them as the first screen's does (Boot.tsx), and the style in the head paints both
   (server/glass-still.ts), so the editor arriving changes no pixel. Otherwise it is drawn here as SVG markup
   (glass-draw.ts), from the one design every size shows. The player's first frame is the still's own, to about a
   level, and its canvas fades in over the still once that frame is drawn; at speed 0 it fades out again to the still,
   the first frame, which a copy takes too. A reader who asks for less motion keeps the still.
   A drag changes the palette every frame, and the still is a filter over the whole picture, drawn again whole for each
   change: while the palette changes the player shows it instead, at its first frame where the glass stands still, and
   the still catches up once the palette rests, under the canvas, which then fades back to it. Where the still is the
   picture meanwhile (no WebGL, or the player still starting) a change recolors its markup in place. */

/* the player is the browser's alone (the page stands live first): the server's build carries none of it */
const GlassStage = lazy(() =>
  (import.meta.env.SSR ? (new Promise(() => {}) as never) : import("./GlassStage.tsx")).then(m => ({
    default: m.GlassStage
  }))
);

/** How long the palette stands before the still is drawn for it under the player, which then lets it show. */
const REST_MS = 250;

export function GlassLayer(props: { palette: Palette; view: GlassView }) {
  /* the page is live: the player may load */
  const [live, setLive] = createSignal(false);
  /* the player's canvas is drawn over the still, which nobody sees from then on */
  const [covered, setCovered] = createSignal(false);
  /* a reader who asks for less motion keeps the still */
  const [reduced, setReduced] = createSignal(false);
  /* once the glass has moved, or its palette changed, its player stays, so speed 0 fades it out rather than cutting
     to the still, and the next change finds it ready */
  const [kept, setKept] = createSignal(false);
  /* the palette is changing: the player shows it, over a still glass too */
  const [held, setHeld] = createSignal(false);
  const moving = () => props.view.speed > 0 && !reduced();
  createEffect(moving, on => {
    if (on) setKept(true);
  });
  onSettled(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(motion.matches);
    read();
    motion.addEventListener("change", read);
    setLive(true);
    return () => motion.removeEventListener("change", read);
  });
  /* the glass's ribs run at the view's default angle as designed (engine/glass.ts's GLASS_ANGLE): no value of that
     module is read here, so the editor's first load carries none of it */
  const angle = () => props.view.angle ?? DEFAULT_ANGLE;
  const shape = () => props.view.shape ?? null;
  let holder!: HTMLDivElement;
  /* the still the holder shows, and the colors and angle it was drawn here with, which a recolor starts from; the
     still the page wants now */
  let shown = "";
  let here: { colors: readonly string[]; angle: number; shape: number | null } | null = null;
  let wanted = "";
  const fill = (colors: readonly string[], at: number, form: number | null) => {
    const key = glassStillKey(colors, at, form);
    if (key === shown) return;
    if (serverStill(key)) {
      here = null;
      holder.replaceChildren();
    } else {
      const svg = holder.firstElementChild;
      if (
        !svg ||
        here?.angle !== at ||
        here.shape !== form ||
        !recolorStill(svg, here.colors, colors, at, form)
      ) {
        const markup = stillSvg(colors, at, form);
        /* its code is on its way: the picture stays as it is until it comes */
        if (markup === null) {
          void loadStill().then(() => {
            if (wanted === key) fill(colors, at, form);
          });
          return;
        }
        holder.innerHTML = markup;
      }
      here = { colors, angle: at, shape: form };
    }
    shown = key;
    holder.dataset.glassStill = key;
  };
  /* A palette, an angle or a shape changed while the still is the picture (before the player's first frame, at speed 0 with no
     palette changing, or where WebGL is missing): drawn again, once a frame at most. A palette that changes holds the
     player over the still until it rests, and the still is drawn for the last one under it; another angle or shape
     shows the still, which turns at once, where the player bakes its ribs again over a few frames. */
  let pending = 0;
  let resting: ReturnType<typeof setTimeout> | undefined;
  let letting = 0;
  let last: { colors: string[]; at: number; form: number | null } | null = null;
  createEffect(
    () => ({ colors: glassColors(props.palette), at: angle(), form: shape() }),
    next => {
      const was = last;
      last = next;
      wanted = glassStillKey(next.colors, next.at, next.form);
      if (!was || glassStillKey(was.colors, was.at, was.form) === wanted) return;
      cancelAnimationFrame(letting);
      clearTimeout(resting);
      if (was.at !== next.at || was.form !== next.form) {
        setHeld(false);
        return;
      }
      setKept(true);
      setHeld(true);
      resting = setTimeout(() => {
        /* under a moving glass the still is never seen, and speed 0 draws it as the canvas fades */
        if (!untrack(moving)) fill(next.colors, next.at, next.form);
        /* the still drawn, the canvas lets it show a frame later */
        letting = requestAnimationFrame(() => {
          letting = requestAnimationFrame(() => setHeld(false));
        });
      }, REST_MS);
    }
  );
  createEffect(
    () => (covered() ? null : { colors: glassColors(props.palette), at: angle(), form: shape() }),
    next => {
      if (!next || glassStillKey(next.colors, next.at, next.form) === shown) return;
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => fill(next.colors, next.at, next.form));
    }
  );
  onCleanup(() => {
    cancelAnimationFrame(pending);
    cancelAnimationFrame(letting);
    clearTimeout(resting);
  });
  return (
    <div class={styles.glass} aria-hidden="true">
      <div
        ref={el => {
          holder = el;
          const colors = glassColors(untrack(() => props.palette));
          wanted = glassStillKey(colors, untrack(angle), untrack(shape));
          holder.dataset.glassStill = wanted;
          fill(colors, untrack(angle), untrack(shape));
        }}
        class={styles.glassStill}
      />
      <Show when={live() && kept()}>
        <Loading>
          <GlassStage
            palette={props.palette}
            view={props.view}
            still={!moving()}
            held={held()}
            onLive={setCovered}
          />
        </Loading>
      </Show>
    </div>
  );
}
