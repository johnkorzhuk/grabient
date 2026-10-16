// The collections promo, v3: one loop whose first frame is the end card. A frame is one view, or two during the morph:
// a camera over the page's 1600x900 space, which shows, bottom to top, the water (the harness's w frames: the site's
// flow.ts, its source the wordmark's bar, drawn over a larger extent with the page set in it at the timeline's offset),
// the page (the capture's transparent frames of the real site), the wordmark (the harness's m frames: Logo.tsx, the water
// in its open bar), and the pointer with its presses. So the smoke off the bar always stands behind the cards and the
// letters. In the morph the close view, with the card's picture cut out of it, fades over the end card's view, while the
// picture becomes the bar where it is; then the words fade in on the end card's own water. As the loop opens and the bar
// starts to turn to the list's first palette, what stands under the wordmark slides to the left as one surface: the
// words leave the frame and the list slides in to its place.
// The plan of every frame is data/timeline.json, the same file the harness drew from. The water's last `fade` frames
// dissolve into its frames from before the first one, so the loop comes round with no seam: the tweet's water is drawn
// on the loop's frames, the newsletter's on its own shorter loop (water-<theme>-email).
import { loadFont } from "@remotion/fonts";
import type React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { OPTIONS } from "./copy";
import { Cursor, Ripple } from "./Cursor";
import timeline from "./data/timeline.json";
import uiDark from "./data/ui-dark.json";
import uiLight from "./data/ui-light.json";
import waterDark from "./data/water-dark.json";
import waterDarkEmail from "./data/water-dark-email.json";
import waterLight from "./data/water-light.json";
import waterLightEmail from "./data/water-light-email.json";

/* the site's own faces: Poppins at 500 and 700, the only ones its pages load */
for (const weight of ["500", "700"] as const) {
  void loadFont({ family: "Poppins", url: staticFile(`fonts/poppins-latin-${weight}-normal.woff2`), weight });
}

export type Theme = "dark" | "light";
export type Variant = "tweet" | "email";
export type PromoProps = { theme: Theme; variant: Variant; option: number };

type Box = { x: number; y: number; w: number; h: number };
type Cam = { left: number; top: number; w: number; h: number };
type Pointer = { x: number; y: number; opacity: number; hand: number; pressed: number };
type ViewSpec = { cam: Cam; alpha: number; grid: number; shift: number; letters: number; bar: number; hole: number; cursor: Pointer | null };
type Frame = {
  f: number;
  ui: number;
  views: ViewSpec[];
  picture: (Box & { r: number; alpha: number }) | null;
  copy: { eyebrow: number; headline: number; away: number };
};
const T = timeline as unknown as {
  length: number;
  /* the newsletter's loop: the loop frame each of its frames shows */
  email: { length: number; map: number[] };
  page: { w: number; h: number };
  offset: { x: number; y: number };
  extent: { w: number; h: number };
  logo: { x: number; y: number; h: number };
  /* how far the words slide, in a 1280 frame's pixels */
  slide: number;
  parts: { fade: number };
  presses: { f: number; x: number; y: number; name: string }[];
  frames: Frame[];
};
/* each water run: how many frames its seam dissolves over, and each frame's wordmark picture, in the extent's pixels */
type Water = { fade: number; frames: { k: number; clip: Box }[] };
const WATER = {
  tweet: { dark: waterDark, light: waterLight },
  email: { dark: waterDarkEmail, light: waterLightEmail }
} as unknown as Record<Variant, Record<Theme, Water>>;
type Ui = { painted: { css: string; radius: number }[]; rects: { art: Box } };
const UI = { dark: uiDark, light: uiLight } as unknown as Record<Theme, Ui>;
const HERO = 3;
/* the picture's rim, which the page draws just outside it: the hole takes it too */
const RIM = 2;

export const promoLength = (variant: Variant) => (variant === "email" ? T.email.length : T.length);

const ink = {
  dark: { ground: "#0c0c0e", text: "#ececea", quiet: "rgba(236,236,234,0.64)", ring: "255,255,255" },
  light: { ground: "#f3f2ee", text: "#17171b", quiet: "rgba(23,23,27,0.66)", ring: "24,24,28" }
};
/* the words' sizes and place, in pixels of the design (the tweet's 1280x720, the newsletter's 534 pixel column, which
   is drawn at twice that): under the wordmark, in the water the current leaves clear */
const TYPE = {
  tweet: { top: 458, eyebrow: 23, gap: 16, headline: 50 },
  email: { top: 193, eyebrow: 9.5, gap: 5.5, headline: 20 }
};

const pad = (n: number) => String(n).padStart(5, "0");

/** A line of the words, as much of it as has faded in. */
const Line: React.FC<{ shown: number; style: React.CSSProperties; children: React.ReactNode }> = ({ shown, style, children }) => (
  <div style={{ ...style, opacity: shown }}>{children}</div>
);

/** A rounded rectangle as a path, for the hole the card's picture leaves in the close view. */
const roundRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} ` +
  `H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;

const View: React.FC<{
  spec: ViewSpec;
  theme: Theme;
  variant: Variant;
  uiFrame: number;
  waterSrc: string;
  markSrc: string;
  clip: Box;
  at: number;
}> = ({ spec, theme, variant, uiFrame, waterSrc, markSrc, clip, at }) => {
  const { width } = useVideoConfig();
  const cam = spec.cam;
  const s = width / cam.w; // frame pixels per page pixel
  const X = (x: number) => (x - cam.left) * s;
  const Y = (y: number) => (y - cam.top) * s;
  const unit = width / (variant === "tweet" ? 1280 : 534);
  const pageBox: React.CSSProperties = {
    position: "absolute",
    left: X(0),
    top: Y(0),
    width: T.page.w * s,
    height: T.page.h * s,
    maxWidth: "none"
  };
  const art = UI[theme].rects.art;
  const radius = UI[theme].painted[HERO].radius;
  const hole = spec.hole
    ? `path(evenodd, "M0,0 H${T.page.w * s} V${T.page.h * s} H0 Z ${roundRect((art.x - RIM) * s, (art.y - RIM) * s, (art.w + 2 * RIM) * s, (art.h + 2 * RIM) * s, (radius + RIM) * s)}")`
    : undefined;
  /* the page, as far to the right as the slide has yet to carry it */
  const ui: React.CSSProperties = { ...pageBox, left: X(spec.shift), clipPath: hole };
  /* the wordmark's picture: its letters and its bar shown each as much as the plan says, split between the letters'
     foot (38 of the box's 50) and the bar's top (43) */
  const box = { y: T.logo.y + T.offset.y, h: T.logo.h };
  const split = ((box.y + (box.h * 40.5) / 50 - clip.y) / clip.h) * 100;
  const L = spec.letters.toFixed(3);
  const B = spec.bar.toFixed(3);
  const mask = `linear-gradient(to bottom, rgba(0,0,0,${L}) 0%, rgba(0,0,0,${L}) ${split.toFixed(2)}%, rgba(0,0,0,${B}) ${split.toFixed(2)}%, rgba(0,0,0,${B}) 100%)`;
  const c = spec.cursor;
  const cursorSize = Math.max((variant === "tweet" ? 15 : 13) * unit, 24 * s);
  return (
    <AbsoluteFill style={{ opacity: spec.alpha }}>
      <Img
        src={staticFile(waterSrc)}
        style={{ position: "absolute", left: X(-T.offset.x), top: Y(-T.offset.y), width: T.extent.w * s, height: T.extent.h * s, maxWidth: "none" }}
      />
      {spec.grid > 0 ? <Img src={staticFile(`frames/ui-${theme}/f${pad(uiFrame)}.png`)} style={ui} /> : null}
      {spec.letters > 0 || spec.bar > 0 ? (
        <Img
          src={staticFile(markSrc)}
          style={{
            position: "absolute",
            left: X(clip.x - T.offset.x),
            top: Y(clip.y - T.offset.y),
            width: clip.w * s,
            height: clip.h * s,
            maxWidth: "none",
            maskImage: mask,
            WebkitMaskImage: mask
          }}
        />
      ) : null}
      {c
        ? T.presses.map(p => (
            <Ripple
              key={p.f}
              x={X(p.x)}
              y={Y(p.y)}
              age={at - p.f}
              radius={(p.name === "page" ? 0.65 : 1) * Math.max(18 * unit, 26 * s)}
              ink={ink[theme].ring}
            />
          ))
        : null}
      {c && c.opacity > 0 ? (
        <div style={{ opacity: c.opacity }}>
          <Cursor x={X(c.x)} y={Y(c.y)} size={cursorSize} hand={c.hand > 0} pressed={c.pressed} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const Promo: React.FC<PromoProps> = ({ theme, variant, option }) => {
  const i = useCurrentFrame();
  const { width } = useVideoConfig();
  /* the loop frame shown: the tweet plays the loop as it is, the newsletter by its own map (a faster pull back and
     morph, a shorter hold) */
  const length = promoLength(variant);
  const at = variant === "email" ? T.email.map[i] : i;
  const fr = T.frames[at];
  const unit = width / (variant === "tweet" ? 1280 : 534);
  const wide = width / 1280;
  const water = WATER[variant][theme];
  const F = water.fade;
  /* the water of this variant's own run, whose frame i is this frame; its last F frames dissolve into the F frames it
     drew before the first, blended once outside the browser (tools/dissolve.py), where it is exact */
  const run = `frames/water-${theme}${variant === "email" ? "-email" : ""}`;
  const k = i + F;
  const dissolving = i >= length - F;
  const waterSrc = dissolving ? `${run}/dissolve/w${pad(i)}.png` : `${run}/w${pad(k)}.png`;
  const markSrc = dissolving ? `${run}/dissolve/m${pad(i)}.png` : `${run}/m${pad(k)}.png`;
  const clip = (water.frames[k]?.k === k ? water.frames[k] : (water.frames.find(w => w.k === k) ?? water.frames[0])).clip;
  const colors = ink[theme];
  const type = TYPE[variant];
  const words = OPTIONS[(option - 1 + OPTIONS.length) % OPTIONS.length];
  const pic = fr.picture;
  return (
    <AbsoluteFill style={{ backgroundColor: colors.ground, overflow: "hidden" }}>
      {fr.views.map((spec, n) => (
        <View
          key={n}
          spec={spec}
          theme={theme}
          variant={variant}
          uiFrame={fr.ui}
          waterSrc={waterSrc}
          markSrc={markSrc}
          clip={clip}
          at={at}
        />
      ))}
      {pic && pic.alpha > 0 ? (
        <div
          style={{
            position: "absolute",
            left: pic.x * wide,
            top: pic.y * wide,
            width: pic.w * wide,
            height: pic.h * wide,
            borderRadius: pic.r * wide,
            opacity: pic.alpha,
            background: UI[theme].painted[HERO].css
          }}
        />
      ) : null}
      {fr.copy.eyebrow > 0 || fr.copy.headline > 0 ? (
        <AbsoluteFill>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: type.top * unit,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: type.gap * unit,
              textAlign: "center",
              fontFamily: "Poppins",
              translate: `${fr.copy.away * wide}px 0`
            }}
          >
            <Line
              shown={fr.copy.eyebrow}
              style={{
                fontSize: type.eyebrow * unit,
                fontWeight: 700,
                letterSpacing: "0.16em",
                lineHeight: 1,
                textTransform: "uppercase",
                color: colors.quiet
              }}
            >
              {words.eyebrow}
            </Line>
            <Line
              shown={fr.copy.headline}
              style={{
                fontSize: type.headline * unit,
                fontWeight: 500,
                letterSpacing: "-0.025em",
                lineHeight: 1.15,
                color: colors.text
              }}
            >
              {words.headline}
            </Line>
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
