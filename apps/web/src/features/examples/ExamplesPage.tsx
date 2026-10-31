import { decodePalette } from "@grabient/engine/codec.ts";
import { cssBlock, cssLine, gradientCss } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import {
  blobStillKey,
  type Effect,
  type EffectKind,
  effectEmbedHtml,
  effectFileAddress
} from "@grabient/engine/effect.ts";
import { glassColors, glassStillKey } from "@grabient/engine/glass-colors.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import {
  DEFAULT_SIZE,
  type Size,
  STYLE_LABELS,
  STYLES,
  type Style,
  type View
} from "@grabient/engine/view.ts";
import { localHref, msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { createDone } from "@grabient/ui/done.ts";
import { Icon } from "@grabient/ui/Icon.tsx";
import {
  createSignal,
  createUniqueId,
  type Element,
  For,
  onSettled,
  Show,
  untrack
} from "solid-js";
import { AppPage } from "../../app/Frames.tsx";
import { toast } from "../../app/toast.ts";
import { colorFormat } from "../../lib/color-format.ts";
import { writeText } from "../../lib/files.ts";
import { effectCard, paletteName, siteOrigin } from "../../lib/page-meta.ts";
import { seedAddress } from "../editor/address.ts";
import { blobViewOf } from "../editor/blob-draw.ts";
import { EffectArt } from "../editor/EffectArt.tsx";
import { copyFormat, type Taken } from "../editor/formats.ts";
import styles from "./ExamplesPage.module.css";

/* A palette's examples (routes/$id/examples.tsx): first the palette as a hero's background in the style its address
   names, with the code that puts it there, then ways to put it to use. An effect (the fluted glass, the blob) behind a
   card, inside a headline's letters, as a phone's and a desktop's wallpaper and as the picture a link to it shows; a
   gradient in each of the six styles, each the background of a shape it suits. Every example shows its code, and Copy
   takes it whole. Each effect's picture is its still at rest and moves under the pointer, so the page holds no player
   but the hero's. */

/** The still as the hero's code shows it: its data elided, which Copy writes in full. */
const STILL_SHOWN: Readonly<Record<EffectKind, string>> = {
  glass: 'url("data:image/webp;base64,…") 50% 50%/cover no-repeat',
  blob: 'url("data:image/svg+xml,…") 50% 50% / 100% 100% no-repeat'
};
const TIPS = msg(
  "Copy HTML gives the tags that play it behind a web page: its first frame inside the page, so the page paints it at once, and a script that plays it from that frame with WebGL. Without WebGL, or for a reader who asks for less motion, the first frame stays."
);
const GRADIENT_TIP = msg(
  "Copy CSS gives the declaration that paints it: paste it into any rule, and the element wears the palette."
);
/* wallpapers at the sizes they are made for, within a PNG's 3 million pixels */
const PHONE: Size = { width: 1080, height: 2340 };
const DESKTOP: Size = { width: 1920, height: 1080 };

type Shown = "CSS" | "HTML" | "URL";

export function ExamplesPage(props: { seed: string; view: View; effect: Effect | null }) {
  const P = () => decodePalette(props.seed) as Palette;
  const stops = () => sampleStops(P(), props.view.steps);
  const name = () => paletteName(P(), props.view);
  const heading = createUniqueId();
  const origin = siteOrigin();
  const taken = (): Taken => ({
    seed: props.seed,
    style: props.view.style,
    steps: props.view.steps,
    angle: props.view.angle,
    size: null,
    pixels: DEFAULT_SIZE,
    stops: stops(),
    effect: props.effect
  });
  const editor = () =>
    localHref(
      seedAddress({
        seed: props.seed,
        view: props.view,
        ...(props.effect ? { effect: props.effect } : {})
      })
    );
  const heroCode = () =>
    props.effect
      ? effectEmbedHtml(
          origin,
          props.seed,
          props.effect,
          props.view.angle,
          STILL_SHOWN[props.effect.kind]
        )
      : cssLine(stops(), props.view.style, props.view.angle, "hex");
  return (
    <AppPage>
      <article class={styles.page}>
        <section class={styles.hero} aria-labelledby={heading}>
          <div class={styles.backdrop} aria-hidden="true">
            <Show
              when={props.effect}
              fallback={
                <div
                  class={styles.fill}
                  style={{
                    background: gradientCss(
                      stops().map(s => s.hex),
                      props.view.style,
                      props.view.angle
                    )
                  }}
                />
              }
            >
              {effect => (
                <HeroEffect P={P()} seed={props.seed} effect={effect()} angle={props.view.angle} />
              )}
            </Show>
          </div>
          <div class={styles.panel}>
            <p class={styles.kicker}>{t("Examples")}</p>
            <h1 id={heading} class={styles.title}>
              {name()}
            </h1>
            <p class={styles.note}>{t(props.effect ? TIPS : GRADIENT_TIP)}</p>
            <Code
              text={heroCode()}
              shown={props.effect ? "HTML" : "CSS"}
              onCopy={() => copyFormat(props.effect ? "html" : "css", taken())}
            />
            <a class={styles.back} href={editor()}>
              <Icon name="edit" size={14} />
              {t("Open in the editor")}
            </a>
          </div>
        </section>
        <Show
          when={props.effect}
          fallback={
            <section class={styles.examples} aria-label={t("Examples")}>
              <For each={STYLES}>
                {style => <StyleExample style={style} stops={stops()} angle={props.view.angle} />}
              </For>
            </section>
          }
        >
          {effect => (
            <section class={styles.examples} data-pairs="" aria-label={t("Examples")}>
              <EffectExamples
                P={P()}
                seed={props.seed}
                name={name()}
                effect={effect()}
                angle={props.view.angle}
                origin={origin}
              />
            </section>
          )}
        </Show>
      </article>
    </AppPage>
  );
}

/** The hero's effect: its first frame, which the server's still paints in the first paint (a holder naming it, as the
    palette's page has), and its player taking over from that frame, playing as long as the page stands, unless the
    reader asks for less motion or the effect is still. */
function HeroEffect(props: { P: Palette; seed: string; effect: Effect; angle: number }) {
  let canvas!: HTMLCanvasElement;
  const [covered, setCovered] = createSignal(false);
  /* the effect the page names, which a page's address fixes: read once */
  const kind = untrack(() => props.effect.kind);
  const named = untrack(() =>
    kind === "glass"
      ? {
          "data-glass-still": glassStillKey(
            glassColors(props.P),
            props.angle,
            props.effect.look.shape
          )
        }
      : { "data-blob-still": blobStillKey(props.seed, props.effect.look, props.angle) }
  );
  onSettled(() => {
    if (props.effect.speed === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let alive = true;
    let player: { destroy(): void } | null = null;
    const drawn = () => requestAnimationFrame(() => alive && setCovered(true));
    const made =
      kind === "glass"
        ? (import.meta.env.SSR
            ? (new Promise(() => {}) as never)
            : import("@grabient/ui/glass-player.ts")
          ).then(m =>
            m.playGlass(
              canvas,
              props.P,
              {
                speed: props.effect.speed,
                fps: props.effect.fps,
                angle: props.angle,
                shape: props.effect.look.shape
              },
              drawn
            )
          )
        : (import.meta.env.SSR
            ? (new Promise(() => {}) as never)
            : import("@grabient/ui/blob-player.ts")
          ).then(m => m.playBlob(canvas, props.P, blobViewOf(props.effect, props.angle), drawn));
    void made.then(
      p => {
        if (alive) player = p;
        else p?.destroy();
      },
      () => {}
    );
    return () => {
      alive = false;
      player?.destroy();
    };
  });
  return (
    <div class={styles.effect} data-kind={kind} data-covered={covered() ? "" : undefined}>
      <div class={styles.still} {...named} />
      <canvas ref={canvas} class={styles.canvas} />
    </div>
  );
}

/** A block of code with Copy at its foot, which confirms on itself, and whatever else takes the example beside it. */
function Code(props: {
  text: string;
  shown: Shown;
  onCopy: () => Promise<unknown>;
  extra?: Element;
}) {
  const [done, mark] = createDone();
  return (
    <div class={styles.code}>
      <pre>
        <code>{props.text}</code>
      </pre>
      <div class={styles.takes}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            void props.onCopy().then(
              () => mark(true),
              () => toast(t("Couldn't copy."))
            )
          }
        >
          <Icon name={done() ? "check" : "copy"} size={14} />
          {t("Copy {format}", { format: props.shown })}
        </Button>
        {props.extra}
      </div>
    </div>
  );
}

/** One way to use the palette: its picture, its name and what it is for, then its code. */
function Example(props: {
  title: string;
  note?: string;
  wide?: boolean;
  picture: Element;
  code: string;
  shown: Shown;
  onCopy: () => Promise<unknown>;
  extra?: Element;
  /** the pointer arrives on the picture, or leaves it */
  onLit?: (lit: boolean) => void;
}) {
  return (
    <figure class={styles.example} data-wide={props.wide ? "" : undefined}>
      <div
        class={styles.stage}
        onPointerEnter={() => props.onLit?.(true)}
        onPointerLeave={() => props.onLit?.(false)}
      >
        {props.picture}
      </div>
      <figcaption class={styles.caption}>
        <span class={styles.name}>{props.title}</span>
        <Show when={props.note}>
          <span class={styles.about}>{props.note}</span>
        </Show>
      </figcaption>
      <Code text={props.code} shown={props.shown} onCopy={props.onCopy} extra={props.extra} />
    </figure>
  );
}

/** The palette in one of the six styles, as the background of a shape that style suits. */
function StyleExample(props: {
  style: Style;
  stops: ReturnType<typeof sampleStops>;
  angle: number;
}) {
  const paint = () =>
    gradientCss(
      props.stops.map(s => s.hex),
      props.style,
      props.angle
    );
  return (
    <Example
      title={t(STYLE_LABELS[props.style])}
      picture={
        <div class={styles.shape} data-style={props.style} style={{ background: paint() }} />
      }
      code={cssLine(props.stops, props.style, props.angle, "hex")}
      shown="CSS"
      onCopy={() => writeText(cssBlock(props.stops, props.style, props.angle, colorFormat()))}
    />
  );
}

type Where = "card" | "headline" | "phone" | "desktop";

/** An effect put to use: behind a card, inside a headline's letters, as a phone's and a desktop's wallpaper, and as
    the picture a link to it shows. Each picture moves while the pointer is on it. */
function EffectExamples(props: {
  P: Palette;
  seed: string;
  name: string;
  effect: Effect;
  angle: number;
  origin: string;
}) {
  const [lit, setLit] = createSignal<Where | null>(null);
  const light = (where: Where) => (on: boolean) =>
    setLit(was => (on ? where : was === where ? null : was));
  const file = (extension: "svg" | "png", size?: Size) =>
    effectFileAddress(props.origin, props.seed, props.effect, props.angle, extension, size);
  const card = () => `${props.origin}${effectCard(props.seed, props.effect, props.angle)}`;
  const still = () =>
    props.effect.kind === "glass"
      ? {
          "data-glass-still": glassStillKey(
            glassColors(props.P),
            props.angle,
            props.effect.look.shape
          )
        }
      : { "data-blob-still": blobStillKey(props.seed, props.effect.look, props.angle) };
  const art = (where: Where) => (
    <EffectArt
      kind={props.effect.kind}
      palette={props.P}
      settings={props.effect}
      angle={props.angle}
      active={lit() === where}
    />
  );
  const download = (size: Size, label: string) => (
    <Button
      size="sm"
      variant="secondary"
      href={file("png", size)}
      download={`grabient-${props.seed}-${label}.png`}
    >
      <Icon name="download" size={14} />
      {t("Download {format}", { format: "PNG" })}
    </Button>
  );
  const cardCode = () =>
    `<div style="background: url('${file("svg")}') 50% 50% / cover no-repeat">\n  …\n</div>`;
  const headlineCode = () =>
    `<h1 style="background: url('${file("svg")}') 50% 50% / cover no-repeat; -webkit-background-clip: text; background-clip: text; color: transparent">\n  ${props.name}\n</h1>`;
  const metaCode = () => `<meta property="og:image" content="${card().replaceAll("&", "&amp;")}">`;
  return (
    <>
      <Example
        wide
        title={t("Card")}
        note={t("The effect moving behind any element, as an animated SVG.")}
        onLit={light("card")}
        picture={
          <div class={styles.card} data-kind={props.effect.kind}>
            {art("card")}
            <div class={styles.cardBody} aria-hidden="true">
              <span class={styles.cardLine} />
              <span class={styles.cardLine} data-short="" />
              <span class={styles.cardPress} />
            </div>
          </div>
        }
        code={cardCode()}
        shown="HTML"
        onCopy={() => writeText(cardCode())}
      />
      <Example
        wide
        title={t("Headline")}
        note={t("The same SVG inside a headline's letters.")}
        onLit={light("headline")}
        picture={
          <p
            class={styles.headline}
            /* inline, over the still's own rule, which the server writes outside the page's layers: the letters
               clip it, and under the pointer the moving SVG takes its place */
            style={{
              "-webkit-background-clip": "text",
              "background-clip": "text",
              ...(lit() === "headline" ? { "background-image": `url("${file("svg")}")` } : {})
            }}
            {...still()}
          >
            {props.name}
          </p>
        }
        code={headlineCode()}
        shown="HTML"
        onCopy={() => writeText(headlineCode())}
      />
      <Example
        title={t("Phone wallpaper")}
        note={t("Its first frame as a PNG at a phone's size.")}
        onLit={light("phone")}
        picture={<div class={styles.phone}>{art("phone")}</div>}
        code={file("png", PHONE)}
        shown="URL"
        onCopy={() => writeText(file("png", PHONE))}
        extra={download(PHONE, "phone")}
      />
      <Example
        title={t("Desktop wallpaper")}
        note={t("Its first frame as a PNG at a desktop's size.")}
        onLit={light("desktop")}
        picture={
          <div class={styles.desktop}>
            <div class={styles.screen}>{art("desktop")}</div>
          </div>
        }
        code={file("png", DESKTOP)}
        shown="URL"
        onCopy={() => writeText(file("png", DESKTOP))}
        extra={download(DESKTOP, "desktop")}
      />
      <Example
        wide
        title={t("Link preview")}
        note={t("The picture a link to the palette shows in chats and posts.")}
        picture={
          <div class={styles.preview}>
            <img src={card()} alt="" width="1200" height="630" loading="lazy" decoding="async" />
          </div>
        }
        code={metaCode()}
        shown="HTML"
        onCopy={() => writeText(metaCode())}
      />
    </>
  );
}
