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
   is two pictures over its own pink, so it keeps its shape at every card's width (ListAd.module.css), and the pixel eye
   is drawn here over the words: while the pointer or a finger is on the picture, its iris turns toward it a whole
   pixel at a time. The link names Grabient as the visit's source and the ad's place as its content, which Pixeleye's
   analytics read, and keeps the referrer the site sends (grabient.com) where other links to other sites drop it. */

/** Where the ad stands, which its link tells Pixeleye: a palette list's first cell, or the editor's similar palettes. */
export type AdPlace = "palette-list" | "similar-palettes";

/** The ad's address from its place: Grabient as the visit's source, the place as its content. */
export const adHref = (place: AdPlace): string =>
  `https://pixeleye.app/?utm_source=grabient&utm_medium=display&utm_campaign=grabient-ad&utm_content=${place}`;

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
/** The milliseconds a step of one pixel takes as the iris turns. */
const STEP = 32;
/** The milliseconds the eye keeps looking where a finger lifted. */
const HOLD = 1200;

/** Where the iris looks for a point `dx`, `dy` CSS px from the eye's middle: toward it, as far as its distance over
    `reach` allows, in whole pixels, alike either way until the lids stop it. */
export function irisToward(dx: number, dy: number, reach: number): readonly [number, number] {
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0 && reach > 0)) return [0, 0];
  const k = (Math.min(1, distance / reach) / distance) * WIDE;
  const down = Math.max(-TALL, Math.min(TALL, Math.round(dy * k)));
  // || 0: a turn of none is 0, never -0
  return [Math.round(dx * k) || 0, down || 0];
}

/** A palette list's lead (PaletteFeed's and its placeholder's): the ad in its first cell. */
export const listLead = () => <ListAd place="palette-list" />;

export function ListAd(props: { place: AdPlace }) {
  const clip = createUniqueId();
  let eye: SVGGElement | undefined;
  let iris: SVGGElement | undefined;
  /* where the iris is and where it is turning, kept plain: each step reads the last at once */
  let at: readonly [number, number] = [0, 0];
  let aim: readonly [number, number] = [0, 0];
  let stepping: ReturnType<typeof setTimeout> | undefined;
  let resting: ReturnType<typeof setTimeout> | undefined;
  const step = () => {
    stepping = undefined;
    if (at[0] === aim[0] && at[1] === aim[1]) return;
    at = [at[0] + Math.sign(aim[0] - at[0]), at[1] + Math.sign(aim[1] - at[1])];
    iris?.setAttribute("transform", `translate(${at[0]} ${at[1]})`);
    stepping = setTimeout(step, STEP);
  };
  /* under reduced motion the iris is where it looks at once */
  const turn = (to: readonly [number, number]) => {
    clearTimeout(resting);
    aim = to;
    if (!reducesNow()) {
      if (!stepping) step();
      return;
    }
    clearTimeout(stepping);
    stepping = undefined;
    at = to;
    iris?.setAttribute("transform", `translate(${at[0]} ${at[1]})`);
  };
  const follow = (e: PointerEvent) => {
    const box = eye?.getBoundingClientRect();
    if (!box?.width) return;
    const dx = e.clientX - box.left - box.width / 2;
    const dy = e.clientY - box.top - box.height / 2;
    turn(irisToward(dx, dy, box.width * REACH));
  };
  /* a finger leaves as it lifts: the eye keeps looking there a moment */
  const leave = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return turn([0, 0]);
    clearTimeout(resting);
    resting = setTimeout(() => turn([0, 0]), HOLD);
  };
  onCleanup(() => {
    clearTimeout(stepping);
    clearTimeout(resting);
  });
  return (
    <a class={styles.ad} href={adHref(props.place)} target="_blank" rel="sponsored noopener">
      <span class={styles.art} onPointerDown={follow} onPointerMove={follow} onPointerLeave={leave}>
        <span class={styles.glow} aria-hidden="true" />
        <span class={styles.ground} aria-hidden="true">
          <span class={styles.words}>
            <img
              src={words}
              alt=""
              width="282"
              height="216"
              decoding="async"
              loading={props.place === "similar-palettes" ? "lazy" : undefined}
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
          <span class={styles.tiles}>
            <img
              src={tiles}
              alt=""
              width="158"
              height="181"
              decoding="async"
              loading={props.place === "similar-palettes" ? "lazy" : undefined}
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
