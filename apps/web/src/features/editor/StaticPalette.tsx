import "@grabient/ui/tokens.css";
import "@grabient/ui/base.css";
import { cardBackground, cssLine } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { isFixedSize, viewSearch } from "@grabient/engine/view.ts";
import { localHref, t } from "@grabient/i18n";
import { For, Show } from "solid-js";
import { heading, pageMeta } from "../../lib/page-meta.ts";
import type { PaletteData } from "./page.ts";
import styles from "./StaticPalette.module.css";

/** A palette's page as the server sends it, for crawlers and readers without JavaScript; the editor takes its place in
    the browser. It says what the palette is, shows it and the CSS that draws it, and leads on: to the collections that
    hold it, the palettes like it, and the same palette as data. */
export function StaticPalette(props: { data: PaletteData }) {
  const page = () => props.data.page;
  const palette = () => ({
    kind: "palette" as const,
    seed: page().seed,
    palette: page().palette,
    view: page().view,
    ...(props.data.facts?.written ? { written: props.data.facts.written } : {}),
    heldBy: props.data.facts?.heldBy ?? []
  });
  const title = () => heading(palette());
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
    <main id="main" class={styles.page}>
      <a class={styles.home} href={localHref("/")}>
        {t("Grabient palettes")}
      </a>
      <h1 class={styles.title} dir="auto">
        {title()}
      </h1>
      <div
        class={styles.picture}
        role="img"
        aria-label={title()}
        style={{
          background:
            cardBackground(page().seed, page().view.style, page().view.steps, page().view.angle) ??
            undefined,
          ...(size() ? { "aspect-ratio": `${size()?.width} / ${size()?.height}` } : {})
        }}
      />
      <p class={styles.lead}>{pageMeta(palette()).description}</p>
      <p class={styles.count}>
        {t(
          "{steps, plural, one {# color} other {# colors}}, {keyframes, plural, one {# editable OKLCH keyframe} other {# editable OKLCH keyframes}}.",
          { steps: page().view.steps, keyframes: page().palette.anchors.length }
        )}
      </p>
      <ul class={styles.stops} dir="ltr">
        <For each={stops()}>
          {stop => (
            <li class={styles.stop}>
              <span class={styles.chip} style={{ background: stop.hex }} />
              {stop.hex}
            </li>
          )}
        </For>
      </ul>
      <h2 class={styles.heading}>CSS</h2>
      <pre class={styles.code} dir="ltr">
        <code>{cssLine(stops(), page().view.style, page().view.angle, "oklch")}</code>
      </pre>
      <Show when={props.data.facts?.heldBy.length}>
        <h2 class={styles.heading}>{t("In these collections")}</h2>
        <p class={styles.links}>
          <For each={props.data.facts?.heldBy}>
            {held => <a href={localHref(`/${held.slug}`)}>{held.title}</a>}
          </For>
        </p>
      </Show>
      {/* the palettes like this one are a search the index never keeps: nofollow, so a crawler that reads every palette
          renders no search for each */}
      <p class={styles.links}>
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
  );
}
