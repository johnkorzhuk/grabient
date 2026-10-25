import { cardBackground, cssLine } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { isFixedSize, viewSearch } from "@grabient/engine/view.ts";
import { locale, localHref, t } from "@grabient/i18n";
import { For, Show } from "solid-js";
import {
  CARD_SIZE,
  heading,
  type Page,
  paletteFacts,
  paletteFile,
  relTo
} from "../../lib/page-meta.ts";
import type { SeedPage } from "./address.ts";
import { Boot } from "./Boot.tsx";
import { BOOT_MARK, BOOT_SCRIPT } from "./boot.ts";
import type { PaletteFacts } from "./facts.ts";
import type { PaletteData } from "./page.ts";

/** The page as its metadata reads it. */
export const metaPage = (
  page: SeedPage,
  facts: PaletteFacts | null
): Extract<Page, { kind: "palette" }> => ({
  kind: "palette",
  seed: page.seed,
  palette: page.palette,
  view: page.view,
  ...(facts?.saved ? { saved: facts.saved } : {}),
  ...(facts?.written ? { written: facts.written } : {}),
  heldBy: facts?.heldBy ?? []
});

/** The static page's styles, in its head: only a palette's page draws it, and a stylesheet of its own would hold the
    first paint of every page back. The values are the design system's tokens. While the page boots the static page
    is hidden (boot.ts). */
export const STATIC_CSS = [
  "@layer components{",
  `html[${BOOT_MARK}] .palette-static{display:none}`,
  ".palette-static{max-width:var(--size-prose);margin-inline:auto;padding:var(--space-s8) var(--space-s4);display:flex;flex-direction:column;gap:var(--space-s4)}",
  ".palette-static>a:first-child{color:var(--color-ink2);font-size:var(--font-fs2)}",
  ".palette-static h1{margin:0;font-size:var(--font-fs6);font-weight:var(--font-bold);line-height:var(--font-lh-tight);letter-spacing:var(--font-ls-title)}",
  ".palette-static h2{margin:var(--space-s4) 0 0;font-size:var(--font-fs4)}",
  ".palette-static p{margin:0;line-height:var(--font-lh-prose)}",
  `[data-picture]{display:block;width:100%;height:auto;aspect-ratio:${CARD_SIZE.width}/${CARD_SIZE.height};object-fit:cover;border-radius:var(--radius-surface);box-shadow:var(--color-shadow)}`,
  "[data-stops]{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:var(--space-s2) var(--space-s4);font-family:var(--font-mono);font-size:var(--font-fs2)}",
  "[data-stops] li{display:flex;align-items:center;gap:var(--space-s2)}",
  "[data-stops] span{width:var(--space-s5);height:var(--space-s5);border-radius:var(--radius-circle);box-shadow:var(--color-rim);forced-color-adjust:none}",
  ".palette-static pre{margin:0;padding:var(--space-s4);border-radius:var(--radius-control);background:var(--color-paper-solid);font-family:var(--font-mono);font-size:var(--font-fs2);white-space:pre-wrap;overflow-wrap:anywhere}",
  "[data-links]{display:flex;flex-wrap:wrap;gap:var(--space-s2) var(--space-s4)}",
  "}"
].join("");

/** A palette's page as the server sends it, for crawlers and readers without JavaScript; the editor takes its place in
    the browser. It says what the palette is, shows it and the CSS that draws it, and leads on: to the collections that
    hold it, the palettes like it, and the same palette as data. The boot's script stands before it, so a browser that
    runs scripts has the mark before it reads the page. */
export function StaticPalette(props: { data: PaletteData }) {
  const page = () => props.data.page;
  /* the server's words, or the palette named here for one the browser opened */
  const title = () => props.data.heading ?? heading(metaPage(props.data.page, props.data.facts));
  /* how it is drawn, as the editor says it under its name */
  const facts = () => paletteFacts(metaPage(props.data.page, props.data.facts));
  const stops = () => sampleStops(page().palette, page().view.steps);
  /* the same palette as data and as Markdown, drawn the same way; a picture at a fixed size keeps it */
  const view = () => viewSearch({ ...page().view, size: null });
  const size = () => (isFixedSize(page().view.size) ? page().view.size : null);
  const png = () => paletteFile(page().seed, page().view, "png");
  /* the picture's words, as its share card's say them */
  const alt = () => props.data.meta?.imageAlt ?? title();
  return (
    <>
      <script innerHTML={BOOT_SCRIPT} />
      <main id="main" class="palette-static">
        <a href={localHref("/")}>{t("Grabient palettes")}</a>
        <h1 dir="auto">{title()}</h1>
        {/* the palette as a file, which an image search indexes, over its painted colors while it loads; lazy, so a
            browser that boots the editor, which hides this page, never asks for it */}
        <img
          data-picture=""
          src={png()}
          alt={alt()}
          width={size()?.width ?? CARD_SIZE.width}
          height={size()?.height ?? CARD_SIZE.height}
          loading="lazy"
          decoding="async"
          style={{
            background:
              cardBackground(
                page().seed,
                page().view.style,
                page().view.steps,
                page().view.angle
              ) ?? undefined,
            ...(size() ? { "aspect-ratio": `${size()?.width} / ${size()?.height}` } : {})
          }}
        />
        <p>{facts()}</p>
        <p>
          {t(
            "{keyframes, plural, one {# editable OKLCH keyframe} other {# editable OKLCH keyframes}}.",
            { keyframes: page().palette.anchors.length }
          )}
        </p>
        <ul data-stops="" dir="ltr">
          <For each={stops()}>
            {stop => (
              <li>
                <span style={{ background: stop.hex }} />
                {stop.hex}
              </li>
            )}
          </For>
        </ul>
        <h2>CSS</h2>
        <pre dir="ltr">
          <code>{cssLine(stops(), page().view.style, page().view.angle, "oklch")}</code>
        </pre>
        <Show when={props.data.facts?.heldBy.length}>
          <h2>{t("In these collections")}</h2>
          <p data-links="">
            <For each={props.data.facts?.heldBy}>
              {held => (
                /* a title in the page's language says the collection's page is indexed in it */
                <a
                  href={localHref(`/${held.slug}`)}
                  rel={relTo(localHref(`/${held.slug}`), held.english ? [locale()] : [])}
                >
                  {held.title}
                </a>
              )}
            </For>
          </p>
        </Show>
        {/* the palettes like this one are a search the index never keeps: nofollow, so a crawler that reads every palette
          renders no search for each; the files are no pages, and a picture is drawn for each visit */}
        <p data-links="">
          <a href={localHref(`/palettes?q=${encodeURIComponent(page().seed)}`)} rel="nofollow">
            {t("Similar palettes")}
          </a>
          <a href={localHref("/collections")}>{t("Collections")}</a>
          <a href={png()} rel={relTo(png())}>
            {t("Download PNG")}
          </a>
          <a href={`/${page().seed}.json${view()}`} rel={relTo(`/${page().seed}.json`)}>
            {t("Palette JSON")}
          </a>
          <a href={`/${page().seed}.md${view()}`} rel={relTo(`/${page().seed}.md`)}>
            {t("Markdown")}
          </a>
          <a href={localHref("/about")}>{t("How it works")}</a>
        </p>
      </main>
      <Boot page={page()} title={title()} likes={props.data.facts?.likes ?? 0} alt={alt()} />
    </>
  );
}
