import { createBarCycle } from "@grabient/ui/barcycle.ts";
import { barGradient, MOVES, type Move } from "@grabient/ui/bartween.ts";
import { Logo as Wordmark } from "@grabient/ui/Logo.tsx";
import { LOGO_BAR, LOGO_GLYPH, LOGO_PATH, LOGO_VIEWBOX } from "@grabient/ui/logo.data.ts";
import {
  MARK_FIXED,
  type MarkFill,
  type MarkScheme,
  markSvg,
  markTileSvg,
  markWeek,
  svgDataUrl,
  weekMark
} from "@grabient/ui/mark.ts";
import { Text } from "@grabient/ui/Text.tsx";
import { color, size } from "@grabient/ui/tokens.ts";
import { For, untrack } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Cell, Cells, Verdict, Verdicts } from "../../doc/Specimen.tsx";
import { Tokens } from "../../doc/Tokens.tsx";
import { art, hexes, POPULAR } from "../../samples.ts";
import styles from "./Logo.module.css";

/* The wordmark's construction and sizes, its bar filled, open and lit, the bar's four moves, the bar alone as the mark
   on browsers' tab strips and in the weeks ahead, and the four ways never to treat it. */
const STOPS = hexes(POPULAR[0].seed);

/* the browsers' tab strips the mark stands on and the ink of their tabs' titles (Chrome's), at a tab's 16px, a dense
   tab's 32 and a bookmark's 64 */
const STRIP: Record<MarkScheme, { "background-color": string; color: string }> = {
  light: { "background-color": "#d3e3fd", color: "#1f1f1f" },
  dark: { "background-color": "#3c3c3c", color: "#e3e3e3" }
};
const SCHEMES: readonly MarkScheme[] = ["light", "dark"];
const SIZES = [16, 32, 64];
const WEEK = 7 * 86_400_000;
const drawn = (fill: MarkFill) => (scheme: MarkScheme) => svgDataUrl(markSvg(fill, scheme));
const grounded = (form: "tile" | "square") => () =>
  svgDataUrl(markTileSvg(color.dark.bg, MARK_FIXED, form));
const MARKS = [
  { label: "this week", src: drawn(weekMark(markWeek(Date.now()))) },
  { label: "a palette", src: drawn(STOPS) },
  { label: "a pale palette", src: drawn(["#fdfcfb", "#f3e7e9", "#e2d1c3", "#fbe9d7"]) },
  { label: "a near-black palette", src: drawn(["#0c0c0e", "#141e30", "#243b55", "#1f1c2c"]) },
  { label: "favicon-tile.ico", src: grounded("tile") },
  { label: "home screen", src: grounded("square") }
];
const WEEKS = Array.from({ length: 10 }, (_, i) => markWeek(Date.now() + i * WEEK));
const MOVED: Record<Move, string> = {
  sweep: "stops roll in turn",
  channels: "lightness, chroma, hue",
  lap: "hue the long way",
  wipe: "a soft edge crosses"
};

function Construction() {
  const [, , w, h] = LOGO_VIEWBOX.split(" ").map(Number);
  const clear = LOGO_BAR.h;
  return (
    <svg
      class={styles.construction}
      viewBox={`-20 -18 ${w + 40} ${h + 36}`}
      role="img"
      aria-label="The wordmark's construction: its glyph box, its bar and the space kept clear around it"
    >
      <path fill="currentColor" d={LOGO_PATH} opacity="0.35" />
      <rect
        x={LOGO_BAR.x}
        y={LOGO_BAR.y}
        width={LOGO_BAR.w}
        height={LOGO_BAR.h}
        fill="currentColor"
      />
      <rect
        class={styles.red}
        x="0"
        y="0"
        width={LOGO_GLYPH.w}
        height={LOGO_GLYPH.h}
        stroke-dasharray="2 2"
      />
      <rect
        class={styles.red}
        x={LOGO_BAR.x}
        y={LOGO_BAR.y}
        width={LOGO_BAR.w}
        height={LOGO_BAR.h}
      />
      <rect
        class={styles.red}
        x={-clear}
        y={-clear}
        width={LOGO_GLYPH.w + 2 * clear}
        height={h + 2 * clear}
        stroke-dasharray="1 2"
      />
      <text class={styles.redText} x="0" y="-9">
        {`glyph box ${LOGO_GLYPH.w} × ${LOGO_GLYPH.h}`}
      </text>
      <text class={styles.redText} x={LOGO_BAR.x + LOGO_BAR.w + 3} y={LOGO_BAR.y + 6}>
        {`bar ${LOGO_BAR.w} × ${LOGO_BAR.h} at ${LOGO_BAR.x}, ${LOGO_BAR.y}`}
      </text>
      <text class={styles.redText} x={LOGO_GLYPH.w - 60} y={h + clear + 5}>
        clear space = bar height
      </text>
    </svg>
  );
}

/* the outline misuse: the letterforms stroked, the bar as it is */
function Outlined() {
  return (
    <svg class={styles.outlined} viewBox={LOGO_VIEWBOX} aria-hidden="true">
      <path class={styles.stroked} d={LOGO_PATH} />
      <rect
        x={LOGO_BAR.x}
        y={LOGO_BAR.y}
        width={LOGO_BAR.w}
        height={LOGO_BAR.h}
        fill="currentColor"
      />
    </svg>
  );
}

/* a move's own cycle: the bar dwells on a palette, then turns to the next by this move alone */
function MoveCard(props: { move: Move }) {
  const palettes = POPULAR.slice(3, 9).map(s => hexes(s.seed));
  const bar = createBarCycle(() => palettes, {
    moves: [untrack(() => props.move)],
    dwell: 2.5,
    tween: 2.2
  });
  return (
    <div class={styles.move}>
      <Wordmark stops={bar.stops()} height={40} />
      <span class={styles.strip} style={{ "background-image": barGradient(bar.stops(), 1) }} />
      <Text variant="h3">{props.move}</Text>
      <Text variant="small">{MOVED[props.move]}</Text>
    </div>
  );
}

export function Logo() {
  return (
    <Section
      id="logo"
      summary="The wordmark: one path in the current ink over a bar filled with the palette in view."
    >
      <div class={styles.stage}>
        <Construction />
        <div class={styles.sizes}>
          <figure class={styles.size}>
            <span class={styles.onPaper}>
              <Wordmark stops={STOPS} height={size.logo} />
            </span>
            <Text variant="mono">{`header · ${size.logo}`}</Text>
          </figure>
          <figure class={styles.size}>
            <span class={styles.onInk}>
              <Wordmark stops={STOPS} height={size.logoPhone} />
            </span>
            <Text variant="mono">{`phone · on ink · ${size.logoPhone}`}</Text>
          </figure>
          <figure class={styles.size}>
            <span class={styles.onPaper}>
              <Wordmark stops={STOPS} height={24} />
            </span>
            <Text variant="mono">minimum · 24</Text>
          </figure>
        </div>
      </div>
      <Block title="The bar">
        <Cells min={240}>
          <Cell caption="filled · the palette in view">
            <Wordmark stops={STOPS} height={40} />
          </Cell>
          <Cell caption="open · the water through it" art={art(4)}>
            <span class={styles.overArt}>
              <Wordmark stops={STOPS} height={40} mode="window" />
            </span>
          </Cell>
          <Cell caption="lit · under the pointer">
            <Wordmark stops={STOPS} height={40} glow />
          </Cell>
        </Cells>
        <div class={styles.moves}>
          <For each={MOVES}>{move => <MoveCard move={move} />}</For>
        </div>
      </Block>
      <Block title="The mark">
        <div class={styles.marks}>
          <For each={MARKS}>
            {mark => (
              <figure class={styles.mark}>
                <For each={SCHEMES}>
                  {scheme => (
                    <span class={styles.tabs} style={STRIP[scheme]}>
                      <For each={SIZES}>
                        {px => <img src={mark.src(scheme)} width={px} height={px} alt="" />}
                      </For>
                    </span>
                  )}
                </For>
                <Text variant="mono">{mark.label}</Text>
              </figure>
            )}
          </For>
        </div>
        <figure class={styles.mark}>
          <For each={SCHEMES}>
            {scheme => (
              <span class={styles.tabs} style={STRIP[scheme]}>
                <For each={WEEKS}>
                  {week => (
                    <img
                      src={svgDataUrl(markSvg(weekMark(week), scheme))}
                      width={32}
                      height={32}
                      alt=""
                    />
                  )}
                </For>
              </span>
            )}
          </For>
          <Text variant="mono">{`the weeks ahead · ${WEEKS[0]} to ${WEEKS[WEEKS.length - 1]}`}</Text>
        </figure>
      </Block>
      <Block title="Tokens">
        <Tokens paths={["size.logo", "size.logoPhone", "color.holeRim", "motion.slow"]} />
      </Block>
      <Block title="Rules">
        <Verdicts>
          <Verdict caption="Recolored.">
            <span class={styles.recolored}>
              <Wordmark stops={STOPS} height={32} />
            </span>
          </Verdict>
          <Verdict caption="Outlined.">
            <Outlined />
          </Verdict>
          <Verdict caption="Rotated.">
            <span class={styles.rotated}>
              <Wordmark stops={STOPS} height={32} />
            </span>
          </Verdict>
          <Verdict caption="Stretched.">
            <span class={styles.stretched}>
              <Wordmark stops={STOPS} height={24} />
            </span>
          </Verdict>
        </Verdicts>
        <Rules
          rules={[
            "The letterforms are the current ink, never a color or a gradient.",
            "The bar shows the palette in view, or a random one on a page with none.",
            "The mark is the bar alone, as wide as its square: the palette's on its page, the week's elsewhere."
          ]}
        />
      </Block>
    </Section>
  );
}
