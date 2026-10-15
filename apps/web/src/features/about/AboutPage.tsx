import { canonical, encodePalette } from "@grabient/engine/codec.ts";
import { hexToSrgb, srgbToLch, toHex } from "@grabient/engine/color.ts";
import { luminance } from "@grabient/engine/contrast.ts";
import { gradientCss } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { K_MAX, K_MIN, type Palette } from "@grabient/engine/palette.ts";
import { STEPS_MAX, STEPS_MIN } from "@grabient/engine/view.ts";
import { dir, localHref, msg, rich, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { CodeTabs } from "@grabient/ui/CodeTabs.tsx";
import { FigurePane } from "@grabient/ui/FigurePane.tsx";
import { createFlashGuard } from "@grabient/ui/flash.ts";
import { Keyframes } from "@grabient/ui/Keyframes.tsx";
import { keyRow } from "@grabient/ui/keymap.ts";
import type { Binding } from "@grabient/ui/keys.ts";
import { reducedMotion } from "@grabient/ui/motion.ts";
import { Rule } from "@grabient/ui/Rule.tsx";
import { Scrub } from "@grabient/ui/Scrub.tsx";
import { StopStrip } from "@grabient/ui/StopStrip.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createEffect, createSignal, type Element, For, onSettled, useContext } from "solid-js";
import { ShellContext } from "../../app/shell.ts";
import { Actions, AxisRow } from "../editor/Controls.tsx";
import styles from "./About.module.css";
import { createFigure, type Figure } from "./figure.ts";

/* /about: the formula as an article, with figures drawn by the engine in the code block's frame (FigurePane), each
   saying what it shows in the line under it. The first is the editor's side over a palette of the page's own: its
   keyframes, each axis as its numbers over its plot, and its actions, with the editor's keys while the page is open.
   The steps figure draws that palette as the editor's strip does, and the gamut figure is the chroma row over a palette
   that asks for more than a screen shows. Code, formulas, numbers and the seed's layout read left to right in every
   language. The readers are designers and developers around the world: plain words come before notation, a term's
   meaning comes with it the first time, and the tools they already use are the reference. */

const hexesOf = (P: Palette, n: number) => sampleStops(P, n).map(stop => stop.hex);
/* the luminances a strip of colors flashes by, for the guard against a held key's flashing */
const lights = (hexes: readonly string[]) => hexes.map(luminance);

/** Code in the prose: a token or a formula, left to right in every language. */
const C = (props: { children: Element }) => (
  <code class={styles.code} dir="ltr">
    {props.children}
  </code>
);
/** The tag a paragraph's message marks its code with: `rich('… <c>L</c> …', CODE)`. */
const CODE = { c: (words: (string | Element)[]) => <C>{words}</C> };
/** The same for a seed, which may break anywhere: eight keyframes' seed is wider than a phone's line. */
const SEED = {
  c: (words: (string | Element)[]) => (
    <code class={styles.seed} dir="ltr">
      {words}
    </code>
  )
};

/** A palette's gradient, as the editor's picture draws it from its colors. */
const Band = (props: { hexes: readonly string[] }) => (
  <div class={styles.band} style={{ background: gradientCss(props.hexes) }} dir="ltr" />
);
/** A figure's Reset: laid out from the start and shown once the reader has changed the figure. */
const ResetPress = (props: { figure: Figure }) => (
  <span
    class={styles.wait}
    data-off={props.figure.dirty() ? undefined : ""}
    inert={!props.figure.dirty()}
  >
    <Button size="sm" onClick={() => props.figure.reset()}>
      {t("Reset")}
    </Button>
  </span>
);

/* cream to indigo, each hue about 40° from the last; the last two are written below zero to take the short way */
const DEMO: Palette = {
  anchors: [
    { l: 0.92, c: 0.06, h: 78 },
    { l: 0.74, c: 0.13, h: 42 },
    { l: 0.55, c: 0.16, h: 4 },
    { l: 0.38, c: 0.12, h: -38 },
    { l: 0.2, c: 0.08, h: -78 }
  ]
};
/** the editor's plots, in a figure as wide as the prose */
const PLOT_H = 120;

function KeyframesFigure(props: { figure: Figure; onPress: (e: PointerEvent) => void }) {
  const f = props.figure;
  const hexes = createFlashGuard(() => hexesOf(f.shown(), f.steps()), lights);
  return (
    <div onPointerDown={e => props.onPress(e)}>
      <FigurePane
        note={t(
          "The dots are keyframes. The graph shows lightness, chroma and hue along the gradient. Drag a dot to change a keyframe."
        )}
        act={<ResetPress figure={f} />}
      >
        <div class={styles.stack}>
          <Band hexes={hexes()} />
          <Keyframes
            stops={f.anchorStops()}
            selection={f.selection()}
            lead={f.lead() >= 0 ? f.lead() : undefined}
            onPick={f.pick}
            onSweep={f.sweep}
            onRestore={f.restore}
            min={K_MIN}
            max={K_MAX}
            onAdd={f.addKeyframe}
            onRemove={f.removeKeyframes}
            removeLabel={t(f.multi() ? msg("Remove keyframes") : msg("Remove keyframe"))}
          />
          <Rule />
          <AxisRow editor={f} axis="l" height={PLOT_H} />
          <Rule />
          <AxisRow editor={f} axis="c" height={PLOT_H} />
          <Rule />
          <AxisRow editor={f} axis="h" height={PLOT_H} />
          <Rule />
          <Actions editor={f} />
        </div>
      </FigurePane>
    </div>
  );
}

/** The same palette in steps, as the editor's strip draws them, its keyframes marked. */
function StepsFigure(props: { figure: Figure; onPress: (e: PointerEvent) => void }) {
  const f = props.figure;
  const marks = () =>
    f.anchorStops().map((stop, i) => ({ t: f.K() > 1 ? i / (f.K() - 1) : 0, paint: stop.hex }));
  return (
    <div onPointerDown={e => props.onPress(e)}>
      <FigurePane
        note={t(
          "The same palette in {count, plural, one {# step} other {# steps}}. Dots mark the keyframes.",
          {
            count: f.steps()
          }
        )}
        act={
          <Scrub
            label={t("Steps")}
            small
            min={Math.max(STEPS_MIN, f.K())}
            max={STEPS_MAX}
            step={1}
            grain={1}
            def={7}
            value={f.steps()}
            onInput={f.setSteps}
          />
        }
      >
        {/* the strip guards its own paint against flashing */}
        <StopStrip stops={hexesOf(f.palette(), f.steps()).map(hex => ({ hex }))} marks={marks()} />
      </FigurePane>
    </div>
  );
}

/* green and magenta mixed in RGB, channel by channel, and in OKLCH the short way round the wheel, nine steps each */
const MIX = 9;
const GREEN = hexToSrgb("#00ff00")!;
const MAGENTA = hexToSrgb("#ff00ff")!;
const RGB_MIX = Array.from({ length: MIX }, (_, i) => ({
  hex: toHex(GREEN.map((v, ch) => v + (MAGENTA[ch] - v) * (i / (MIX - 1))))
}));
const OK_MIX = (() => {
  const [l0, c0, h0] = srgbToLch(GREEN);
  const [l1, c1, h1] = srgbToLch(MAGENTA);
  const turn = ((((h1 - h0 + 180) % 360) + 360) % 360) - 180;
  return hexesOf(
    {
      anchors: [
        { l: l0, c: c0, h: h0 },
        { l: l1, c: c1, h: h0 + turn }
      ]
    },
    MIX
  ).map(hex => ({ hex }));
})();
const SHORT: Palette = {
  anchors: [
    { l: 0.68, c: 0.12, h: 210 },
    { l: 0.8, c: 0.1, h: 330 }
  ]
};
const LONG: Palette = {
  anchors: [
    { l: 0.68, c: 0.12, h: 210 },
    { l: 0.8, c: 0.1, h: 690 }
  ]
};
/* three keyframes asking for more chroma than a screen holds */
const HOT: Palette = {
  anchors: [
    { l: 0.62, c: 0.32, h: 20 },
    { l: 0.55, c: 0.34, h: 140 },
    { l: 0.5, c: 0.33, h: 260 }
  ]
};

/** The chroma row over a palette that asks for more than a screen shows: the plot's dotted line is what is asked for,
    and the number and the line ask for more or less. */
function GamutFigure() {
  const f = createFigure(HOT);
  return (
    <FigurePane
      note={t(
        "Dotted: the chroma asked for. Solid: what the screen shows. Drag the line to ask for more or less."
      )}
      act={<ResetPress figure={f} />}
    >
      <div class={styles.stack}>
        <Band hexes={hexesOf(f.shown(), 64)} />
        <AxisRow editor={f} axis="c" height={PLOT_H} locks={false} />
      </div>
    </FigurePane>
  );
}

/* each recipe's caption is a message, translated where the figure is drawn. Sunset's last hue is −10°, the short way
   from 20°; 350° would take the long way, through green and blue */
const RECIPES: readonly [Palette, string][] = [
  [
    canonical({
      anchors: [
        { l: 0.86, c: 0.08, h: 88 },
        { l: 0.68, c: 0.15, h: 52 },
        { l: 0.5, c: 0.19, h: 20 },
        { l: 0.32, c: 0.13, h: -10 }
      ]
    }),
    msg(
      "Sunset: lightness falls from 0.86 to 0.32, chroma peaks at 0.19, and hue turns from yellow to crimson."
    )
  ],
  [
    canonical({
      anchors: [
        { l: 0.66, c: 0.16, h: 10 },
        { l: 0.66, c: 0.16, h: 370 }
      ]
    }),
    msg("Spectrum: two keyframes with equal lightness and chroma, and hue that travels 360°.")
  ],
  [
    canonical({
      anchors: [
        { l: 0.92, c: 0.05, h: 195 },
        { l: 0.22, c: 0.11, h: 325 }
      ]
    }),
    msg("Duotone: two keyframes far apart in lightness (0.92 and 0.22) and 130° apart in hue.")
  ],
  [
    canonical({
      anchors: [
        { l: 0.91, c: 0.05, h: 150 },
        { l: 0.87, c: 0.06, h: 255 },
        { l: 0.93, c: 0.045, h: 345 }
      ]
    }),
    msg("Pastels: high lightness (0.87 and up) and low chroma (0.06 and below).")
  ],
  [
    canonical({
      anchors: [
        { l: 0.95, c: 0, h: 0 },
        { l: 0.14, c: 0, h: 0 }
      ]
    }),
    msg("Grays: chroma 0 at every keyframe.")
  ]
];

function SeedMap() {
  const cell = (label: string, bits: number, head = false) => (
    <span class={styles.cell} data-head={head ? "" : undefined} style={{ flex: `${bits} ${bits}` }}>
      {label}
      <span class={styles.bits}>{bits}</span>
    </span>
  );
  return (
    <div class={styles.map} dir="ltr" role="img" aria-label={t("The seed in bits")}>
      <div class={styles.mapRow}>
        {cell(t("version"), 2, true)}
        {cell("K − 2", 3, true)}
        {cell(t("spare"), 1, true)}
        <span class={styles.break} />
        {cell("L", 8)}
        {cell("C", 8)}
        {cell(t("hue"), 9)}
      </div>
      {/* the fields run left to right as the bits do; the note after them reads the reader's way */}
      <div class={styles.mapRow}>
        {cell("L", 8)}
        {cell("C", 8)}
        {cell(t("Δ hue"), 10)}
        <span class={styles.note}>
          <span dir={dir()}>{t("× each later keyframe")}</span>
        </span>
      </div>
    </div>
  );
}

/* the formula's code, run as written, in few enough lines that the code block shows it whole */
const SPLINE = `// one axis: a Catmull–Rom spline through K evenly spaced values
const { min, max, floor } = Math;
function spline(v, t) {
  const K = v.length, x = min(max(t, 0), 1) * (K - 1);
  const i = min(K - 2, floor(x)), u = x - i;
  const p0 = v[max(i - 1, 0)], p1 = v[i];
  const p2 = v[i + 1], p3 = v[min(i + 2, K - 1)];
  return p1 + 0.5 * u * (p2 - p0
    + u * (2*p0 - 5*p1 + 4*p2 - p3
    + u * (3*(p1 - p2) + p3 - p0)));
}
// the color at t from the keyframes' L, C and H. A spline can overshoot
// between keyframes, so L is kept in 0..1 and C at 0 or more. The
// browser fits an oklch() color to the screen (section 6).
function color(L, C, H, t) {
  const l = min(max(spline(L, t), 0), 1), c = max(spline(C, t), 0);
  return \`oklch(\${l} \${c} \${spline(H, t)})\`;
}`;

/* The water takes the live palette while the reader works the figures and goes back to its own colors after IDLE of
   rest. Work is a change to the keyframes, the hold or the steps, or a mouse or pen held down on a live figure until it
   lifts; a finger counts only once it changes something, since a finger on a figure is often scrolling the page. Under
   reduced motion the water keeps its own colors. */
const IDLE_MS = 6000;
function waterFollows(f: Figure) {
  const shell = useContext(ShellContext);
  const [working, setWorking] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pressed = false;
  let last = "";
  const rest = () => {
    clearTimeout(timer);
    timer = pressed ? undefined : setTimeout(() => setWorking(false), IDLE_MS);
  };
  const touch = () => {
    setWorking(true);
    rest();
  };
  const lift = () => {
    if (!pressed) return;
    pressed = false;
    rest();
  };
  createEffect(
    () => `${f.seed()}|${f.selection().join()}|${f.steps()}`,
    key => {
      if (last && key !== last) touch();
      last = key;
    }
  );
  shell?.paint(() =>
    working() && !reducedMotion()
      ? [{ seed: f.seed(), style: "linearGradient", steps: f.steps(), angle: 90 }]
      : null
  );
  onSettled(() => {
    /* a press let go outside the page, or a window that loses the focus mid-press, lets go too */
    const events = ["pointerup", "pointercancel", "blur"] as const;
    for (const name of events) window.addEventListener(name, lift);
    return () => {
      for (const name of events) window.removeEventListener(name, lift);
      clearTimeout(timer);
    };
  });
  return (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    pressed = true;
    touch();
  };
}

/* the editor's keys over the first figure while the page is open, the figure's own undo in the page's place. Select
   all stays the article's, the figure has no angle to rotate, and the keys that remove keyframes wait for a hold. */
function figureKeys(f: Figure): Binding[] {
  const row = (id: string, run: (i: number) => void, when?: () => boolean): Binding => {
    const r = keyRow(id)!;
    return { id, key: r.keys, label: r.label, scope: r.scope, run, when };
  };
  const held = () => f.selection().length > 0;
  return [
    row("random", f.random, f.canRandom),
    row("invert", f.invert),
    row("reverse", f.reverse, f.canReverse),
    row("remove", f.removeKeyframes, held),
    row("letGo", f.letGo, held),
    row("stops", i => f.setSteps(f.steps() + (i === 0 ? -1 : 1))),
    row("undo", i => (i === 0 ? f.undo() : f.redo()))
  ];
}

export function AboutPage() {
  const shell = useContext(ShellContext);
  /* one live palette for the first two figures, and the editor's keys on it while the page is open */
  const figure = createFigure(DEMO);
  shell?.keys(() => figureKeys(figure));
  const press = waterFollows(figure);
  return (
    <article class={styles.article}>
      <header class={styles.heading}>
        <Text variant="title" as="h1">
          {t("About Grabient")}
        </Text>
        <Text variant="lede">
          {t("Grabient makes gradients from keyframes: 2 to 8 colors joined by a smooth curve.")}
        </Text>
      </header>

      <section class={styles.section}>
        <Text variant="h2">{t("1 · Keyframes")}</Text>
        <Text variant="body">
          {t(
            "A keyframe is a color you choose. As in animation, you set a few and the colors between them are filled in. A palette has 2 to 8 keyframes, spaced evenly along the gradient, which passes through each one:"
          )}
        </Text>
        <KeyframesFigure figure={figure} onPress={press} />
        <Text variant="body">
          {rich(
            "Each keyframe is three numbers in OKLCH. Lightness <c>L</c> runs from 0 (black) to 1 (white). Chroma <c>C</c> is how colorful it is: 0 is gray, and the most vivid screen colors are around 0.3. Hue <c>H</c> is the angle on the color wheel, in degrees.",
            CODE
          )}
        </Text>
      </section>

      <section class={styles.section}>
        <Text variant="h2">{t("2 · The formula")}</Text>
        <Text variant="body">
          {t(
            "Lightness, chroma and hue each have their own curve, drawn in the graph above. Each curve passes through the keyframes and bends smoothly between them. The color at any point is the three curves read there."
          )}
        </Text>
        <Text variant="body">
          {t(
            "CSS and Figma gradients join their color stops with straight lines, so a faint edge can show where the blend changes pace."
          )}
        </Text>
        <Text variant="body">
          {rich(
            "In the formula, <c>t</c> runs from 0 at the start of the gradient to 1 at the end. With <c>K</c> keyframes, keyframe <c>i</c> sits at <c>t = i / (K − 1)</c>, counting from 0. Each curve is a Catmull–Rom spline, and <c>gamut()</c> fits the color to the screen (section 6):",
            CODE
          )}
        </Text>
        <p class={styles.math}>
          <C>color(t) = gamut( L(t), C(t), H(t) )</C>
        </p>
        {/* a language's name, the same in every language */}
        <CodeTabs aria-label={t("Format")} tabs={[{ label: "JavaScript", code: SPLINE }]} />
      </section>

      <section class={styles.section}>
        <Text variant="h2">{t("3 · Steps")}</Text>
        <Text variant="body">
          {t(
            "To draw the gradient, Grabient takes colors at evenly spaced points, called steps. The first and last steps are the first and last keyframes. Gradient styles use the steps as color stops. Band styles show each step as a band of flat color. There are never fewer steps than keyframes:"
          )}
        </Text>
        <StepsFigure figure={figure} onPress={press} />
      </section>

      <section class={styles.section}>
        <Text variant="h2">{t("4 · Why OKLCH")}</Text>
        <Text variant="body">
          {t(
            "RGB and HSL describe how a screen mixes light, and their numbers often don't match what we see. Pure yellow and pure blue both have an HSL lightness of 50%, yet the yellow looks far lighter. OKLCH gives them 0.97 and 0.45. It is Björn Ottosson's OKLab in polar form, built so equal changes in its numbers look equal. Two colors mixed both ways:"
          )}
        </Text>
        <FigurePane
          note={t(
            "Green and magenta mixed in RGB (top) and OKLCH (bottom). The RGB mix turns gray in the middle."
          )}
        >
          <div class={styles.pair}>
            <StopStrip stops={RGB_MIX} short />
            <StopStrip stops={OK_MIX} short />
          </div>
        </FigurePane>
        <Text variant="body">
          {t(
            "Since lightness, chroma and hue are separate, changing a keyframe's hue keeps its lightness."
          )}
        </Text>
      </section>

      <section class={styles.section}>
        <Text variant="h2">{t("5 · Hue beyond 360°")}</Text>
        <Text variant="body">
          {t(
            "Between two hues, a gradient can go either way around the color wheel, and most tools take the shorter way. Grabient lets hue count past 360°: 690° is the same color as 330°, one lap later. The gradient goes the whole way:"
          )}
        </Text>
        <FigurePane
          note={t(
            "Both strips end on the same color. Top: hue 210° to 330°. Bottom: 210° to 690°, one more lap."
          )}
        >
          <div class={styles.pair}>
            <Band hexes={hexesOf(SHORT, 64)} />
            <Band hexes={hexesOf(LONG, 64)} />
          </div>
        </FigurePane>
        <Text variant="body">
          {t(
            "A palette's travel is its last hue minus its first, laps included, so a full rainbow travels 360°. Neighboring keyframes can be up to 540° apart."
          )}
        </Text>
      </section>

      <section class={styles.section}>
        <Text variant="h2">{t("6 · Colors a screen can't show")}</Text>
        <Text variant="body">
          {rich(
            "OKLCH can describe colors more vivid than a screen can show. For those, Grabient keeps the lightness and hue and lowers the chroma until the color fits: sRGB on a standard screen, Display P3 on a wide-gamut one. CSS Color 4 does the same for <c>oklch()</c> colors:",
            CODE
          )}
        </Text>
        <GamutFigure />
      </section>

      <section class={styles.section}>
        <Text variant="h2">{t("7 · Recipes")}</Text>
        <Text variant="body">{t("Some palettes and the curves that make them:")}</Text>
        <For each={RECIPES} keyed={false}>
          {recipe => (
            <FigurePane
              note={t(recipe()[1])}
              act={
                <Button size="sm" href={localHref(`/${encodePalette(recipe()[0])}`)}>
                  {t("Edit")}
                </Button>
              }
            >
              <Band hexes={hexesOf(recipe()[0], 64)} />
            </FigurePane>
          )}
        </For>
        <Text variant="body">
          {rich(
            "Reverse puts the keyframes in the opposite order. Invert makes a negative: each lightness <c>L</c> becomes <c>1 − L</c>, and each hue turns 180°.",
            CODE
          )}
        </Text>
      </section>

      <section class={styles.section}>
        <Text variant="h2">{t("8 · The seed")}</Text>
        {/* the first figure's palette by its seed, which follows the figure as it changes */}
        <Text variant="body">
          {rich(
            "Every palette's address holds its seed, a short code for its keyframes. The first figure's seed is <c>{seed}</c>.",
            SEED,
            { seed: figure.seed() }
          )}
        </Text>
        <Text variant="body">
          {rich(
            "A seed is <c>k</c> followed by the keyframes packed into bits: 8 for lightness, 8 for chroma, 9 for the first hue, then 10 for each later hue, stored as the change from the one before:",
            CODE
          )}
        </Text>
        <FigurePane>
          <SeedMap />
        </FigurePane>
        <Text variant="body">
          {t(
            "Two keyframes make a seed of 11 characters, and eight make one of 37. Each palette has exactly one seed."
          )}
        </Text>
        <Text variant="body">
          {t(
            "A keyframe set from a hex color keeps that exact color, in 24 bits. Such a seed runs from 9 to 50 characters."
          )}
        </Text>
      </section>
    </article>
  );
}
