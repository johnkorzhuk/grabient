import { cardBackground, cssLine } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { isFixedSize, viewSearch } from "@grabient/engine/view.ts";
import { localHref, t } from "@grabient/i18n";
import { For, Show } from "solid-js";
import { heading, pageMeta } from "../../lib/page-meta.ts";
import { Boot } from "./Boot.tsx";
import { BOOT_SCRIPT } from "./boot.ts";
import { metaPage, type PaletteData } from "./page.ts";

/** A palette's page as the server sends it, for crawlers and readers without JavaScript; the editor takes its place in
    the browser. It says what the palette is, shows it and the CSS that draws it, and leads on: to the collections that
    hold it, the palettes like it, and the same palette as data. The boot's script stands before it, so a browser that
    runs scripts has the mark before it reads the page. */
export function StaticPalette(props: { data: PaletteData }) {
  const page = () => props.data.page;
  /* the server's words, or the palette named here for one the browser opened */
  const title = () => props.data.heading ?? heading(metaPage(props.data.page, props.data.facts));
  const description = () =>
    (props.data.meta ?? pageMeta(metaPage(props.data.page, props.data.facts))).description;
  const stops = () => sampleStops(page().palette, page().view.steps);
  /* the same palette as data and as Markdown, drawn the same way; a picture at a fixed size keeps it */
  const view = () => viewSearch({ ...page().view, size: null });
  const size = () => (isFixedSize(page().view.size) ? page().view.size : null);
  const png = () => {
    const query = new URLSearchParams(view().slice(1));
    const fixed = size();
    if (fixed) {
      query.set("w", String(fixed.width));
      query.set("h", String(fixed.height));
    }
    return `/${page().seed}.png${query.size ? `?${query}` : ""}`;
  };
  return (
    <>
      <script innerHTML={BOOT_SCRIPT} />
      <main id="main" class="palette-static">
        <a href={localHref("/")}>{t("Grabient palettes")}</a>
        <h1 dir="auto">{title()}</h1>
        <div
          data-picture=""
          role="img"
          aria-label={title()}
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
        <p>{description()}</p>
        <p>
          {t(
            "{steps, plural, one {# color} other {# colors}}, {keyframes, plural, one {# editable OKLCH keyframe} other {# editable OKLCH keyframes}}.",
            { steps: page().view.steps, keyframes: page().palette.anchors.length }
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
              {held => <a href={localHref(`/${held.slug}`)}>{held.title}</a>}
            </For>
          </p>
        </Show>
        {/* the palettes like this one are a search the index never keeps: nofollow, so a crawler that reads every palette
          renders no search for each */}
        <p data-links="">
          <a href={localHref(`/palettes?q=${encodeURIComponent(page().seed)}`)} rel="nofollow">
            {t("Similar palettes")}
          </a>
          <a href={localHref("/collections")}>{t("Collections")}</a>
          <a href={png()}>{t("Download PNG")}</a>
          <a href={`/${page().seed}.json${view()}`}>{t("Palette JSON")}</a>
          <a href={`/${page().seed}.md${view()}`}>{t("Markdown")}</a>
          <a href={localHref("/about")}>{t("How it works")}</a>
        </p>
      </main>
      <Boot page={page()} title={title()} likes={props.data.facts?.likes ?? 0} />
    </>
  );
}
