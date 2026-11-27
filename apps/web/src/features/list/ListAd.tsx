import { t } from "@grabient/i18n";
import hidden from "@grabient/ui/hidden.module.css";
import { Label } from "@grabient/ui/Label.tsx";
import { reducesNow } from "@grabient/ui/motion.ts";
import { createUniqueId, onCleanup } from "solid-js";
import styles from "./ListAd.module.css";
import tiles from "./pixeleye/tiles.svg?url";
import words from "./pixeleye/words.svg?url";

/* The ad in a palette list's first cell and before the editor's similar palettes: Pixeleye's, as its maker drew it
   (377 by 216 units), on a palette card's footprint, its line saying where it leads and that it is an ad. The drawing
   is its pictures over its own pink, so it keeps its shape at every card's width (ListAd.module.css): the words in
   three bands of one picture, the logo at the top, the press at the foot and the headline between, and the tiles in
   the top corner. The pixel eye is drawn here over the logo: while the pointer or a finger is on the picture, its iris
   glides toward it and shows at whole pixels, and a moment after the pointer leaves it looks ahead again. The link
   names Grabient as the visit's source and the ad's place as its content, which Pixeleye's analytics read, and keeps
   the referrer the site sends (grabient.com) where other links to other sites drop it. */

/** Where the ad stands, which its link tells Pixeleye: the page, and whether it shows a search. */
export type AdPlace =
  | "home"
  | "home-search"
  | "palettes"
  | "palette-search"
  | "saved-palettes"
  | "collections"
  | "collection-search"
  | "saved-collections"
  | "collection"
  | "editor";

/** The ad's address from its place: Grabient as the visit's source, the place as its content. */
export const adHref = (place: AdPlace): string =>
  `https://pixeleye.app/?utm_source=grabient&utm_content=${place}`;

/* The eye on its grid of 17 by 9 pixels, a unit a pixel: the outline's whole shape, the white over it, the iris with
   its pupil and glint, and the scan lines over them. Each is drawn whole over the one before, so no seam shows where
   two meet. It stands where the drawing has it: 24 by 24.12 units in, its pixels 1.9355 units. */
const OUTLINE =
  "M5 0h7v1h2v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-2v1h-7v-1h-2v-1h-1v-1h-1v-1h-1v-1h1v-1h1v-1h1v-1h2z";
const WHITE = "M5 1h7v1h2v1h1v1h1v1h-1v1h-1v1h-2v1h-7v-1h-2v-1h-1v-1h-1v-1h1v-1h1v-1h2z";
const IRIS = "M7 2h3v1h1v3h-1v1h-3v-1h-1v-3h1z";
const PUPIL = "M7 3h3v3h-3z";
const GLINT = "M7 3h1v1h-1z";
const LINES = "M3 2h11v1h-11zM1 4h15v1h-15zM3 6h11v1h-11z";
/** How far the iris turns, in pixels either way: across the white's widest rows, and a row up or down. */
const WIDE = 4;
const TALL = 1;
/** How far off the eye looks all the way, in the eye's own widths. */
const REACH = 3;
/** The seconds the iris takes to close most of the way to where it looks. */
const GLIDE = 0.08;
/** How far past halfway to the next pixel the iris goes before it shows there, in pixels: one that rests near the line
    between two never flickers from one to the other. */
const EDGE = 0.2;
/** The milliseconds the eye keeps looking after the pointer leaves, and after a finger lifts: a pointer that comes
    straight back finds it looking still, so quick moves in and out never send it to and fro. */
const REST = 450;
const HOLD = 1200;

/** Where the iris looks for a point `dx`, `dy` CSS px from the eye's middle, in pixels: toward it, as far as its
    distance over `reach` allows, alike either way until the lids stop it. */
export function irisToward(dx: number, dy: number, reach: number): readonly [number, number] {
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0 && reach > 0)) return [0, 0];
  const k = (Math.min(1, distance / reach) / distance) * WIDE;
  return [dx * k, Math.max(-TALL, Math.min(TALL, dy * k))];
}

/** The pixel the iris shows at `value`, from the one it shows: that one, until `value` is past halfway to another by
    EDGE. */
export function irisPixel(shown: number, value: number): number {
  // || 0: a turn of none is 0, never -0
  return Math.abs(value - shown) > 0.5 + EDGE ? Math.round(value) || 0 : shown;
}

/** One frame of the iris's glide, a critically damped follow (Game Programming Gems 4, 8.1), exact at any frame rate:
    where it is and how fast it moves after `dt` seconds on its way from `at` to `to`. */
export function glide(
  at: number,
  speed: number,
  to: number,
  dt: number
): readonly [number, number] {
  const w = 2 / GLIDE;
  const x = w * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = at - to;
  const temp = (speed + w * change) * dt;
  return [to + (change + temp) * e, (speed - w * temp) * e];
}

/** A list's lead (PaletteFeed's, its placeholder's, a group's): the ad in its first cell, saying where it stands. */
export const adLead = (place: () => AdPlace) => () => <ListAd place={place()} />;

export function ListAd(props: { place: AdPlace }) {
  const clip = createUniqueId();
  let eye: SVGGElement | undefined;
  let iris: SVGGElement | undefined;
  /* where the iris looks, where it is on its way there and how fast it moves, in pixels across and down, and the
     pixel it shows */
  const goal = [0, 0];
  const at = [0, 0];
  const speed = [0, 0];
  const shown = [0, 0];
  let frame = 0;
  let last = 0;
  let resting: ReturnType<typeof setTimeout> | undefined;
  const show = () => {
    const x = irisPixel(shown[0]!, at[0]!);
    const y = irisPixel(shown[1]!, at[1]!);
    if (x === shown[0] && y === shown[1]) return;
    shown[0] = x;
    shown[1] = y;
    iris?.setAttribute("transform", `translate(${x} ${y})`);
  };
  /* a frame of the glide, at the display's rate, until the iris is where it looks */
  const tick = (now: number) => {
    frame = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;
    let moving = false;
    for (const i of [0, 1]) {
      const [next, fast] = glide(at[i]!, speed[i]!, goal[i]!, dt);
      const there = Math.abs(next - goal[i]!) < 1e-3 && Math.abs(fast) < 1e-3;
      at[i] = there ? goal[i]! : next;
      speed[i] = there ? 0 : fast;
      moving ||= !there;
    }
    show();
    if (moving) frame = requestAnimationFrame(tick);
    else last = 0;
  };
  /* the glide stops where it is; a frame is asked for in the browser alone, so the server, which ends the component
     too, has none to cancel */
  const halt = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };
  /* under reduced motion the iris is where it looks at once */
  const look = (to: readonly [number, number]) => {
    clearTimeout(resting);
    goal[0] = to[0];
    goal[1] = to[1];
    if (!reducesNow()) {
      frame ||= requestAnimationFrame(tick);
      return;
    }
    halt();
    at[0] = to[0];
    at[1] = to[1];
    speed[0] = speed[1] = 0;
    show();
  };
  const follow = (e: PointerEvent) => {
    const box = eye?.getBoundingClientRect();
    if (!box?.width) return;
    const dx = e.clientX - box.left - box.width / 2;
    const dy = e.clientY - box.top - box.height / 2;
    look(irisToward(dx, dy, box.width * REACH));
  };
  /* the pointer left, or a finger lifted: the eye looks ahead again a moment later, unless the pointer comes back */
  const leave = (e: PointerEvent) => {
    clearTimeout(resting);
    resting = setTimeout(() => look([0, 0]), e.pointerType === "touch" ? HOLD : REST);
  };
  onCleanup(() => {
    halt();
    clearTimeout(resting);
  });
  return (
    <a class={styles.ad} href={adHref(props.place)} target="_blank" rel="sponsored noopener">
      <span class={styles.art} onPointerDown={follow} onPointerMove={follow} onPointerLeave={leave}>
        <span class={styles.glow} aria-hidden="true" />
        <span class={styles.ground} aria-hidden="true">
          {/* the words in three bands of the one picture, each a window on its part of it */}
          <span class={styles.band} data-band="head">
            <img
              src={words}
              alt=""
              width="282"
              height="216"
              decoding="async"
              loading={props.place === "editor" ? "lazy" : undefined}
            />
            <svg viewBox="0 0 282 216" aria-hidden="true">
              <defs>
                <clipPath id={clip}>
                  <path d={WHITE} />
                </clipPath>
              </defs>
              <g ref={eye} transform="translate(24 24.1216) scale(1.93552)">
                <path fill="#000" d={OUTLINE} />
                <path fill="#e8edff" d={WHITE} />
                <g clip-path={`url(#${clip})`}>
                  <g ref={iris}>
                    <path fill="#3f6fdc" d={IRIS} />
                    <path fill="#0b1030" d={PUPIL} />
                    <path fill="#fff" d={GLINT} />
                  </g>
                </g>
                <path fill="#04081a" fill-opacity="0.2" d={LINES} />
              </g>
            </svg>
          </span>
          <span class={styles.band} data-band="body">
            <img
              src={words}
              alt=""
              width="282"
              height="216"
              decoding="async"
              loading={props.place === "editor" ? "lazy" : undefined}
            />
          </span>
          <span class={styles.band} data-band="foot">
            <img
              src={words}
              alt=""
              width="282"
              height="216"
              decoding="async"
              loading={props.place === "editor" ? "lazy" : undefined}
            />
          </span>
          <span class={styles.tiles}>
            <img
              src={tiles}
              alt=""
              width="158"
              height="181"
              decoding="async"
              loading={props.place === "editor" ? "lazy" : undefined}
            />
          </span>
        </span>
        {/* the drawing's words, in the drawing's language */}
        <span class={hidden.text} lang="en">
          Pixeleye: How good is your eye, really? 5 daily design puzzles to test your eye. Play
          today’s 5 puzzles.
        </span>
      </span>
      <span class={styles.line}>
        <span class={styles.site}>pixeleye.app</span>
        <Label>{t("Ad")}</Label>
      </span>
      <span class={hidden.text}>{t("(opens in a new tab)")}</span>
    </a>
  );
}
