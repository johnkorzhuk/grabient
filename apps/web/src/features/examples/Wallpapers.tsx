import { contrastOf, hexBytes, luminance, toHex } from "@grabient/engine/color.ts";
import { sampleSrgb } from "@grabient/engine/curve.ts";
import { groundParts } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import type { Size } from "@grabient/engine/view.ts";
import { dir, formatDate, msg, rich, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import type { CodeTab } from "@grabient/ui/CodeTabs.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { createSignal, createUniqueId, type Element, Show } from "solid-js";
import { EffectArt } from "../editor/EffectArt.tsx";
import { Chip, contrastWords, Example, type ExampleProps } from "./Example.tsx";
import { LARGE } from "./fit.ts";
import { colorsUnder, contrastLevel, inkOn, mirrored, type Part, type Shown } from "./paint.ts";
import { drawnWords, gradientOf, levelWords, pictureAddress } from "./shared.ts";
import styles from "./Wallpapers.module.css";

/** The tag a message marks a hex with: `rich("… <c>{color}</c>", HEX)`. */
const HEX = { c: (words: (string | Element)[]) => <span dir="ltr">{words}</span> };

/* The palette as a phone's lock screen and a desktop's wallpaper, each the palette's own file at the screen's size in
   the address's style: the gradient's PNG, or the effect's first frame, whose still the screen shows and plays under
   the pointer, and its moving SVG for any size. Each screen has its clock in white or black, standing where that ink
   reads on every color under it: of the places a clock stands on such a screen, the first that reaches the best level
   the palette allows, which a chip under the stage gives for each. A screen where no place lets an ink read as a lock
   screen's large figures must (fit.ts's LARGE) shows no clock, as a palette that would hide it is no lock screen's. A
   blob with no solid ground stands on the one its PNG lays it on, since a screen can't be clear: the tag says the
   screens show it otherwise, and a chip names it. */

type Device = "phone" | "desktop";
const DEVICES: readonly Device[] = ["phone", "desktop"];

/** Each screen's pixels: a common phone's, standing, and a common desktop's, both within a PNG's bounds (2400 a side,
    3 million in all). */
const SCREENS: Readonly<Record<Device, Size>> = {
  phone: { width: 1080, height: 2340 },
  desktop: { width: 1920, height: 1080 }
};
const aspectOf = (d: Device) => SCREENS[d].width / SCREENS[d].height;

/** Where a clock may stand on a screen (data-at), and the part of the screen it covers at most, as the stylesheet sets
    it: its words never wider than that, a long date taking a second line. */
interface Place {
  at: string;
  part: Part;
}
const places = (
  rows: Readonly<Record<string, readonly [number, number]>>,
  columns: Readonly<Record<string, readonly [number, number]>>
): Place[] =>
  Object.entries(rows).flatMap(([row, [y0, y1]]) =>
    Object.entries(columns).map(([column, [x0, x1]]) => ({
      at: `${row}-${column}`,
      part: { x0, y0, x1, y1 }
    }))
  );
/* the phone's big clock, hours over minutes and the date under them, at the top or the middle, from its start, its
   middle or its end, the middle first on rings, which center on the screen; the desktop's widget in a corner, the
   top's start first as the phone's, so both keep one side where the colors let them, else in the middle as a
   desktop's lock screen has it, where a corner's colors are too many (rings, a cone's turn) */
const PHONE_ROWS = { top: [0.1, 0.42], middle: [0.36, 0.68] } as const;
const START = [0.08, 0.44] as const;
const CENTER = [0.32, 0.68] as const;
const END = [0.56, 0.92] as const;
const PHONE_PLACES = places(PHONE_ROWS, { start: START, center: CENTER, end: END });
const PHONE_RINGS = places(PHONE_ROWS, { center: CENTER, start: START, end: END });
const DESKTOP_PLACES = [
  ...places(
    { top: [0.07, 0.37], bottom: [0.63, 0.93] },
    { start: [0.04, 0.48], end: [0.52, 0.96] }
  ),
  { at: "middle-center", part: { x0: 0.28, y0: 0.35, x1: 0.72, y1: 0.68 } }
];

const LEVELS = [null, "AA Large", "AA", "AAA"] as const;
/** The place whose ink reads best: the first to reach the highest level, or where none reads at 3:1, the one that
    comes closest. */
function standing(s: Shown, list: readonly Place[], aspect: number, rtl: boolean) {
  let best: { at: string; ink: string; ratio: number } | null = null;
  for (const { at, part } of list) {
    const read = inkOn(colorsUnder(s, rtl ? mirrored(part) : part, aspect));
    const level = LEVELS.indexOf(contrastLevel(read.ratio));
    const was = best ? LEVELS.indexOf(contrastLevel(best.ratio)) : -1;
    if (!best || level > was || (level === 0 && was === 0 && read.ratio > best.ratio))
      best = { at, ...read };
  }
  return best as NonNullable<typeof best>;
}

/* What a PNG lays a blob on where it has no ground: near black, or near white for a palette whose colors stand out
   more there (engine/blob.ts's blobBackdrop, which the page reads here so as not to load the blob's code). */
const DARK = [14, 14, 16];
const LIGHT = [243, 241, 238];
const lum = (bytes: readonly number[]) => luminance(bytes.map(v => v / 255));
function backdropOf(P: Palette): number[] {
  const light =
    Array.from({ length: 9 }, (_, i) => luminance(sampleSrgb(P, i / 8))).reduce((a, b) => a + b) /
    9;
  return contrastOf(light, lum(DARK)) >= contrastOf(light, lum(LIGHT)) ? DARK : LIGHT;
}
/** The palette as the screens wear it: a blob with no solid ground stands on what its PNG lays it on, its own ground
    over that where it lets it through, so the screens, the files and the code show one picture. */
function wallOf(s: Shown): Shown {
  const effect = s.effect;
  const bg = effect?.look.bg ?? null;
  if (effect?.kind !== "blob" || bg?.length === 7) return s;
  const back = backdropOf(s.palette);
  const { hex, alpha } = bg ? groundParts(bg) : { hex: "#000000", alpha: 0 };
  const solid = hexBytes(hex).map((v, i) => Math.round(v * alpha + back[i] * (1 - alpha)) / 255);
  return { ...s, effect: { ...effect, look: { ...effect.look, bg: toHex(solid) } } };
}

/** The moment both clocks show, the same on the server and in the browser. Past ten, its hours read alike on a 12-hour
    and a 24-hour clock, so a lock screen's time needs no AM or PM. */
const MOMENT = Date.UTC(2026, 10, 12, 10, 24);

/** Each device's name on its chip. */
const NAMES: Readonly<Record<Device, string>> = { phone: msg("Phone"), desktop: msg("Desktop") };

/** Whether the palette suits this example (fit.ts): where it does not, the page leaves the example out. */
export const wallpapersFits = (_s: ExampleProps["s"]): boolean => true;

export function WallpapersExample(props: ExampleProps) {
  const wall = () => wallOf(props.s);
  /* the blob is shown on a ground its address doesn't name */
  const filled = () => wall() !== props.s;
  const rtl = () => dir() === "rtl";
  const rings = () => !wall().effect && wall().view.style.startsWith("radial");
  const read = (d: Device) =>
    d === "phone"
      ? standing(wall(), rings() ? PHONE_RINGS : PHONE_PLACES, aspectOf("phone"), rtl())
      : standing(wall(), DESKTOP_PLACES, aspectOf("desktop"), rtl());
  /* a screen shows its clock where an ink reads there as large figures must */
  const clocked = (d: Device) => read(d).ratio >= LARGE;
  const time = () =>
    formatDate(MOMENT, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
  /* the phone's hours over its minutes, in the reader's digits */
  const lines = () => /(\p{Nd}+)\P{Nd}+(\p{Nd}+)/u.exec(time())?.slice(1) ?? [time()];
  const shortDay = () =>
    formatDate(MOMENT, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const longDay = () =>
    formatDate(MOMENT, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  /* a screen is lit while the pointer or the focus is on it, and its effect plays; a plain copy, since a signal read
     right after a write in the same task gives the old value */
  const [lit, setLit] = createSignal<Device | null>(null);
  let litNow: Device | null = null;
  const light = (d: Device) => {
    litNow = d;
    setLit(d);
  };
  const dim = (d: Device) => {
    if (litNow !== d) return;
    litNow = null;
    setLit(null);
  };
  const png = (d: Device) => pictureAddress(wall(), props.origin, "png", SCREENS[d]);
  const svg = (d: Device) => pictureAddress(wall(), props.origin, "svg", SCREENS[d]);
  const sizeText = (d: Device) => `${SCREENS[d].width}×${SCREENS[d].height}`;
  const fileName = (d: Device) =>
    `grabient-${props.s.seed}${props.s.effect ? `-${props.s.effect.kind}` : ""}-${SCREENS[d].width}x${SCREENS[d].height}.png`;
  const label = (d: Device) => (d === "phone" ? t("Phone wallpaper") : t("Desktop wallpaper"));
  const html = () =>
    DEVICES.map(
      d => `<a href="${png(d).replaceAll("&", "&amp;")}" download="${fileName(d)}">${label(d)}</a>`
    ).join("\n");
  /* the code names no more than it must: what an effect's PNG is, and what its SVG gives over the PNG */
  const code = (): CodeTab[] => [
    {
      label: "PNG",
      code: DEVICES.map(png).join("\n"),
      ...(props.s.effect ? { where: { text: t("The first frame") } } : {})
    },
    { label: "HTML", code: html() },
    {
      label: "SVG",
      code: DEVICES.map(svg).join("\n"),
      where: { text: t(props.s.effect ? msg("Moving, at any size") : msg("Sharp at any size")) }
    }
  ];
  const wallpaper = (d: Device) => (
    <Show
      when={wall().effect}
      fallback={<span class={styles.paint} style={{ background: gradientOf(wall()) }} />}
    >
      {effect => (
        <EffectArt
          kind={effect().kind}
          palette={wall().palette}
          settings={effect()}
          angle={wall().view.angle}
          active={lit() === d}
        />
      )}
    </Show>
  );
  /* a device and its download: the picture of its screen names what it shows, and the press names the picture and its
     size as what it saves */
  const device = (d: Device) => {
    const picture = createUniqueId();
    const size = createUniqueId();
    const screen = (
      <div
        id={picture}
        class={styles.frame}
        role="img"
        aria-label={t(
          d === "phone"
            ? msg("A phone's lock screen with the palette as its wallpaper")
            : msg("A desktop screen with the palette as its wallpaper")
        )}
      >
        <div
          class={styles.screen}
          style={{ "background-color": wall().effect?.look.bg ?? undefined }}
        >
          {wallpaper(d)}
          <Show when={clocked(d)}>
            <div class={styles.clock} data-at={read(d).at} style={{ color: read(d).ink }}>
              {d === "phone" ? (
                <>
                  <span class={styles.digits}>{lines()[0]}</span>
                  <Show when={lines()[1]}>
                    {line => <span class={styles.digits}>{line()}</span>}
                  </Show>
                  <span class={styles.day}>{shortDay()}</span>
                </>
              ) : (
                <>
                  <span class={styles.time}>{time()}</span>
                  <span class={styles.day}>{longDay()}</span>
                </>
              )}
            </div>
          </Show>
          <Show when={d === "phone"}>
            <span class={styles.camera} />
          </Show>
        </div>
      </div>
    );
    return (
      <div
        class={styles.device}
        data-device={d}
        onPointerEnter={() => light(d)}
        onPointerLeave={() => dim(d)}
        onFocusIn={() => light(d)}
        onFocusOut={() => dim(d)}
      >
        {d === "desktop" ? <div class={styles.monitor}>{screen}</div> : screen}
        <div class={styles.take}>
          <Button
            size="sm"
            href={png(d)}
            download={fileName(d)}
            aria-describedby={`${picture} ${size}`}
          >
            <Icon name="download" size={14} />
            {t("Download PNG")}
          </Button>
          {/* pixels read left to right in every language: in a right-to-left line 1080×2340 would show as 2340×1080 */}
          <span id={size} class={styles.size} dir="ltr">
            {sizeText(d)}
          </span>
        </div>
      </div>
    );
  };
  /* under the stage, chips and no sentences: the ground the screens give a blob that has no solid one, then what each
     clock reaches, its level where it reaches one (the blob's colors move under both alike, so its two read the same) */
  const ground = () => (filled() ? wall().effect?.look.bg : undefined);
  const chips = (
    <>
      <Show when={ground()}>
        {bg => (
          <Chip color={bg()}>
            <span>{rich("Background <c>{color}</c>", HEX, { color: bg() })}</span>
          </Chip>
        )}
      </Show>
      {DEVICES.map(d => (
        <Show when={clocked(d)}>
          <Chip color={read(d).ink}>
            {t(NAMES[d])}
            <span class={styles.value} dir="ltr">
              {contrastWords(read(d).ratio)}
            </span>
            <Show when={levelWords(read(d).ratio)}>{level => <span>{level()}</span>}</Show>
          </Chip>
        </Show>
      ))}
    </>
  );
  return (
    <Example
      id="wallpapers"
      n={props.n}
      title={t("Wallpapers")}
      about={t("For phones and desktops, sized to each screen.")}
      drawn={drawnWords(props.s)}
      differs={filled()}
      notes={chips}
      code={code()}
      codeLabel={t("The wallpapers' code")}
    >
      <div class={styles.stage}>
        {device("phone")}
        {device("desktop")}
      </div>
    </Example>
  );
}
