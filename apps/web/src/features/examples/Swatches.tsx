import { gradientCss, spell } from "@grabient/engine/css.ts";
import { type Stop, sampleStops } from "@grabient/engine/curve.ts";
import { SWATCH_FILES, type SwatchFormat } from "@grabient/engine/swatches.ts";
import { type View, viewSearch } from "@grabient/engine/view.ts";
import { t } from "@grabient/i18n";
import { announce } from "@grabient/ui/announce.ts";
import { copyText, downloadFile } from "@grabient/ui/copy.ts";
import { createDone } from "@grabient/ui/done.ts";
import { type Format, FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import hidden from "@grabient/ui/hidden.module.css";
import { Icon } from "@grabient/ui/Icon.tsx";
import { tooltip } from "@grabient/ui/Tooltip.tsx";
import { createSignal, For, Show } from "solid-js";
import { toast } from "../../app/toast.ts";
import { colorFormat } from "../../lib/color-format.ts";
import { fileAddress, writeText } from "../../lib/files.ts";
import { copyFormat, copyLink, saveFormat } from "../editor/formats.ts";
import { Chip, ContrastChip, contrastWords, Example, type ExampleProps } from "./Example.tsx";
import { drawnColors, type Shown, worstContrast } from "./paint.ts";
import styles from "./Swatches.module.css";
import { drawnWords, effectColorsWords, gradientOf, takenOf } from "./shared.ts";

/* The palette's colors as the tokens a design system takes, almost without words. A chip a color, each a press that
   copies its hex: the color with its hex in the ink that reads on it and two samples of text, white and black, on it;
   under it the token's name and what its ink reaches there, each line level with its neighbors'. A gradient or bands
   stand over their chips as the token that draws them, in the page's style, and the chips are its stops at the page's
   steps, as the editor's strip has them: the palette as its address names it. An effect has no such token, and its
   chips are the colors it is drawn from, the glass's six or the blob's along its palette, which the tag says. Up to
   nine colors stand as roomy chips; more stand in a grid of small ones, number and hex alone, none left out. Under
   them the app's own strip takes the chips' colors away: the palette's CSS, JSON and Markdown, the swatch files behind
   its book, each copied, saved or its address copied as its mode press turns. The chip under the stage is the least
   contrast any hex has on its color. Then the code: CSS custom properties, each color beside its text color, a
   Tailwind theme, Grabient's JSON fetched at run time and the files' addresses, all of the colors the chips show. */

/** As many colors as stand as roomy chips; more stand in a grid of small ones, and past `MANY` those are hex alone. */
const ROOMY = 9;
const MANY = 40;
/** The most columns of small chips on a wide page, on a phone, and on a phone too narrow for five hexes a row. */
const COLUMNS = { wide: 10, narrow: 5, tight: 4 } as const;
const WHITE = "#ffffff";
const BLACK = "#000000";

/** The strip's formats in every mode: the palette's CSS, its JSON, and its Markdown, whose table holds each color with
    the text color that reads on it; the swatch files behind its book (SWATCH_CHIPS). */
const FORMATS: readonly Format[] = ["css", "json", "md"];
/** The swatch files in the order the code lists their addresses. */
const SWATCHES: readonly SwatchFormat[] = ["tokens", "ase", "gpl", "grd"];

/* a token's ink on its color, said to a reader who listens as the contrast grid says it: the better of white and black
   reads on any color, at 4.58:1 at the least */
const said = (ink: string, ground: string, ratio: number) =>
  t("{text} on {ground}: {ratio}, enough for text", {
    text: ink,
    ground,
    ratio: Math.floor(ratio * 100) / 100
  });

interface Token {
  stop: Stop;
  /** the contrast white text has on its color, and black text */
  white: number;
  black: number;
}
/** The ink that reads better on a token's color: white where it has as much contrast as black, as the JSON's
    contrast.text has it. */
const inkOf = (k: Token) => (k.white >= k.black ? WHITE : BLACK);
const inkWord = (k: Token) => (inkOf(k) === WHITE ? "white" : "black");
/** The contrast a token's ink has on its color: never under 4.58, so AA at least. */
const bestOf = (k: Token) => Math.max(k.white, k.black);

/** Columns for `n` small chips, at most `most` a row: of the counts from `most` down to three fifths of it, the one
    whose last row is fullest, the most where two tie. */
function columns(n: number, most: number): number {
  if (n <= most) return n;
  let best = most;
  let fullest = 0;
  for (let c = most; c >= Math.ceil(most * 0.6); c--) {
    const last = (n % c || c) / c;
    if (last > fullest) {
      best = c;
      fullest = last;
    }
  }
  return best;
}

/** The view Grabient's files are read in for the chips' colors: the page's for a gradient or bands; for an effect a
    linear gradient at its count of colors, or, where a glass's keyframes outnumber its six (a file never holds fewer
    colors than keyframes), at eleven, every other one of which is the glass's. */
function filesView(
  s: Shown,
  count: number
): { view: Pick<View, "style" | "steps" | "angle">; every: number } {
  if (!s.effect) return { view: s.view, every: 1 };
  const every = count >= s.palette.anchors.length ? 1 : 2;
  return { view: { style: "linearGradient", steps: (count - 1) * every + 1, angle: 90 }, every };
}

/** A declaration of a gradient of `colors` in the page's style, a stop a line, as the code shows it. */
function gradientDeclaration(
  s: Shown,
  property: string,
  colors: readonly string[],
  indent: string
): string {
  const css = gradientCss(
    colors,
    s.view.style,
    s.view.angle,
    colorFormat() === "oklch" ? "oklch" : undefined
  );
  const [head = "", ...stops] = css.slice(0, -1).split(", ");
  const open = head.indexOf("(") + 1;
  const items = [head.slice(open), ...stops];
  return [
    `${indent}${property}: ${head.slice(0, open)}`,
    ...items.map((item, i) => `${indent}  ${item}${i < items.length - 1 ? "," : ""}`),
    `${indent});`
  ].join("\n");
}

/** Whether the palette suits this example (fit.ts): where it does not, the page leaves the example out. */
export const swatchesFits = (_s: ExampleProps["s"]): boolean => true;

export function SwatchesExample(props: ExampleProps) {
  const s = () => props.s;
  /* the chips' colors: the stops at the page's steps, or the ones the effect is drawn from, which are its palette at
     as many even places */
  const count = () => (s().effect ? drawnColors(s()).length : s().view.steps);
  const tokens = (): Token[] =>
    sampleStops(s().palette, count()).map(stop => ({
      stop,
      white: worstContrast(WHITE, [stop.hex]),
      black: worstContrast(BLACK, [stop.hex])
    }));
  const roomy = () => count() <= ROOMY;
  const files = () => filesView(s(), count());
  const search = () => viewSearch(files().view);
  const sample = () => t("Aa", { $context: "sample" });
  const name = (i: number) => `--palette-${i + 1}`;

  /* a press copies its chip's hex, a check standing in its place for a moment and Copied said to a reader who listens
     (a word would not fit the narrowest chip in every language); one Tab stop for the chips, the arrows walk them */
  let list!: HTMLOListElement;
  const [copied, mark] = createDone<number>(1100);
  const copy = async (hex: string, i: number) => {
    if (await copyText(hex)) {
      mark(i);
      announce(t("Copied"));
    } else announce(t("Couldn't copy. Select the text and copy it."));
  };
  const [at, setAt] = createSignal(0);
  const current = () => Math.min(at(), count() - 1);
  const walk = (e: KeyboardEvent) => {
    const i = current();
    const last = count() - 1;
    const j =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? last
          : e.key === "ArrowRight" || e.key === "ArrowDown"
            ? Math.min(last, i + 1)
            : e.key === "ArrowLeft" || e.key === "ArrowUp"
              ? Math.max(0, i - 1)
              : -1;
    if (j < 0) return;
    e.preventDefault();
    setAt(j);
    list.querySelectorAll<HTMLElement>("button")[j]?.focus();
  };

  /* The strip takes the chips' colors in the files' view: the page's gradient or bands, or an effect's colors as a
     linear gradient. Its JSON and its Markdown are copied as the site serves them, which the editor's copies leave
     out, asked for while the press still counts (as copySwatches does, for Safari) and filled when they arrive; the
     editor's files leave out the JSON too. A press that fails says so on the page's line, and a copy that fails shows
     no check. */
  const taken = () => takenOf({ ...s(), view: files().view, effect: null });
  const served = async (f: "json" | "md") => {
    const answer = await fetch(fileAddress({ seed: s().seed, ...files().view }, f));
    if (!answer.ok) throw new Error(answer.statusText);
    return answer;
  };
  const copyServed = async (f: "json" | "md") => {
    const text = served(f).then(answer => answer.text());
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      try {
        const blob = text.then(words => new Blob([words], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
        return;
      } catch {
        // refused: the copy command's way below
      }
    }
    await writeText(await text);
  };
  const refused = (message: string) => () => {
    toast(message);
    return false;
  };
  const onCopy = (f: Format) =>
    (f === "json" || f === "md" ? copyServed(f) : copyFormat(f, taken())).then(
      () => true,
      refused(t("Couldn't copy the palette."))
    );
  const onDownload = (f: Format) => {
    const seed = s().seed;
    (f === "json"
      ? served(f).then(async answer => downloadFile(`grabient-${seed}.json`, await answer.blob()))
      : saveFormat(f, taken())
    ).catch(refused(t("Couldn't download the file.")));
  };
  const onLink = (f: Format) =>
    copyLink(f, taken()).then(() => true, refused(t("Couldn't copy the palette.")));

  const css = () => {
    const kind = colorFormat();
    const lines = tokens().flatMap((k, i) => [
      `  ${name(i)}: ${spell(kind, k.stop)};`,
      `  --on-palette-${i + 1}: ${inkWord(k)};`
    ]);
    if (!s().effect)
      lines.push(
        gradientDeclaration(
          s(),
          "--palette-gradient",
          tokens().map((_, i) => `var(${name(i)})`),
          "  "
        )
      );
    return `:root {\n${lines.join("\n")}\n}`;
  };
  const tailwind = () => {
    const kind = colorFormat();
    const theme = tokens().flatMap((k, i) => [
      `  --color-palette-${i + 1}: ${spell(kind, k.stop)};`,
      `  --color-on-palette-${i + 1}: ${inkWord(k)};`
    ]);
    const gradient = s().effect
      ? ""
      : `\n\n@utility bg-palette-gradient {\n${gradientDeclaration(
          s(),
          "background-image",
          tokens().map((_, i) => `var(--color-palette-${i + 1})`),
          "  "
        )}\n}`;
    return `@import "tailwindcss";\n\n@theme {\n${theme.join("\n")}\n}${gradient}`;
  };
  const script = () => {
    const every = files().every;
    const place = every > 1 ? "i / 2 + 1" : "i + 1";
    return [
      `const response = await fetch("${props.origin}/${s().seed}.json${search()}");`,
      "const { colors, contrast } = await response.json();",
      "const root = document.documentElement.style;",
      "",
      "colors.forEach((hex, i) => {",
      ...(every > 1 ? ["  if (i % 2) return;"] : []),
      `  root.setProperty(\`--palette-\${${place}}\`, hex);`,
      `  root.setProperty(\`--on-palette-\${${place}}\`, contrast.text[i]);`,
      "});"
    ].join("\n");
  };
  /* the code speaks for itself; Tailwind's says its version, since an older one reads no @theme, and files that hold
     more colors than the glass's six say which are its */
  const code = () => [
    { label: "CSS", code: css() },
    { label: "Tailwind", code: tailwind(), where: { text: t("For Tailwind v4") } },
    { label: "JS", code: script() },
    {
      label: t("Swatches"),
      code: SWATCHES.map(
        f => `${props.origin}/${s().seed}.${SWATCH_FILES[f].extension}${search()}`
      ).join("\n"),
      ...(files().every > 1 ? { where: { text: t("Every other color is the glass's") } } : {})
    }
  ];

  const drawn = () => effectColorsWords(s()) ?? drawnWords(s());
  /* the least any token's ink reaches on its color: white on some and black on others, so its chip has no coin */
  const least = () => Math.min(...tokens().map(bestOf));

  return (
    <Example
      id="swatches"
      n={props.n}
      title={t("Color tokens")}
      about={t("For code and design apps.")}
      drawn={drawn()}
      differs={!!s().effect}
      notes={<ContrastChip ratio={least()} />}
      code={code()}
      codeLabel={t("The tokens' code")}
    >
      <div
        class={styles.whole}
        data-layout={roomy() ? "roomy" : "dense"}
        data-n={count()}
        data-many={count() > MANY ? "" : undefined}
        style={{
          "--n": String(count()),
          "--cols": String(columns(count(), COLUMNS.wide)),
          "--cols-narrow": String(columns(count(), COLUMNS.narrow)),
          "--cols-tight": String(columns(count(), COLUMNS.tight))
        }}
      >
        <Show when={!s().effect}>
          <div class={styles.specimen} dir="ltr">
            <span
              class={styles.tile}
              role="img"
              aria-label={drawnWords(s())}
              style={{ background: gradientOf(s()) }}
            />
            <code class={styles.name}>--palette-gradient</code>
          </div>
        </Show>
        <ol
          ref={list}
          class={styles.sheet}
          dir="ltr"
          aria-label={t("Palette colors")}
          onKeyDown={walk}
        >
          <For each={tokens()} keyed={false}>
            {(k, i) => {
              const tip = tooltip(() => t("Copy"));
              const ink = () => inkOf(k());
              const done = () => copied() === i;
              return (
                <li class={styles.token}>
                  <button
                    ref={tip}
                    type="button"
                    class={styles.color}
                    style={{ background: k().stop.hex, color: ink() }}
                    aria-label={t("Copy {hex}", { hex: k().stop.hex })}
                    tabindex={i === current() ? 0 : -1}
                    onFocus={() => setAt(i)}
                    onClick={() => void copy(k().stop.hex, i)}
                  >
                    <Show
                      when={roomy()}
                      fallback={
                        <>
                          <Show when={count() <= MANY}>
                            <span class={styles.index}>{i + 1}</span>
                          </Show>
                          <span class={styles.hex}>
                            {done() ? <Icon name="check" size={12} /> : k().stop.hex}
                          </span>
                        </>
                      }
                    >
                      <span class={styles.hex}>
                        {done() ? <Icon name="check" size={16} /> : k().stop.hex}
                      </span>
                      <span class={styles.samples} aria-hidden="true">
                        <span style={{ color: WHITE }}>{sample()}</span>
                        <span style={{ color: BLACK }}>{sample()}</span>
                      </span>
                    </Show>
                  </button>
                  <Show
                    when={roomy()}
                    fallback={
                      <span class={hidden.text}>{said(ink(), k().stop.hex, bestOf(k()))}</span>
                    }
                  >
                    <div class={styles.label}>
                      <code class={styles.name}>{name(i)}</code>
                      <span class={styles.reading}>
                        <Chip color={ink()}>
                          <span aria-hidden="true">{contrastWords(bestOf(k()))}</span>
                          <span class={hidden.text}>{said(ink(), k().stop.hex, bestOf(k()))}</span>
                        </Chip>
                      </span>
                    </div>
                  </Show>
                </li>
              );
            }}
          </For>
        </ol>
        <div class={styles.files}>
          <FormatStrip
            size="md"
            variant="paper"
            copy={FORMATS}
            download={FORMATS}
            link={FORMATS}
            swatches={SWATCH_CHIPS}
            onCopy={onCopy}
            onDownload={onDownload}
            onLink={onLink}
          />
        </div>
      </div>
    </Example>
  );
}
