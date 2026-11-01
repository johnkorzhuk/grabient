import { decodePalette } from "@grabient/engine/codec.ts";
import { cssBlock } from "@grabient/engine/css.ts";
import { type Effect, type EffectKind, effectEmbedHtml } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { type View, viewSearch } from "@grabient/engine/view.ts";
import { localHref, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import type { CodeTab } from "@grabient/ui/CodeTabs.tsx";
import { CodeTabs } from "@grabient/ui/CodeTabs.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Dynamic } from "@solidjs/web";
import { useLocation, useRouter } from "@tanstack/solid-router";
import { type Component, createUniqueId, For, Match, Switch, untrack, useContext } from "solid-js";
import { AppPage } from "../../app/Frames.tsx";
import { ShellContext } from "../../app/shell.ts";
import { colorFormat } from "../../lib/color-format.ts";
import { paletteName, siteOrigin } from "../../lib/page-meta.ts";
import { seedAddress } from "../editor/address.ts";
import { BlobLayer } from "../editor/BlobLayer.tsx";
import { effectHtml } from "../editor/formats.ts";
import { GlassLayer } from "../editor/GlassLayer.tsx";
import { keyOf } from "../editor/keys.ts";
import { CardsExample, cardsFits } from "./Cards.tsx";
import { ChartExample, chartFits } from "./Chart.tsx";
import type { ExampleProps } from "./Example.tsx";
import styles from "./ExamplesPage.module.css";
import { ProfileExample, profileFits } from "./Profile.tsx";
import type { Shown } from "./paint.ts";
import { SwatchesExample, swatchesFits } from "./Swatches.tsx";
import { drawnWords, gradientOf, stopsOf, takenOf } from "./shared.ts";
import { createExamplesState, examplesBindings } from "./state.ts";
import { wordsTone } from "./tone.ts";
import { WallpapersExample, wallpapersFits } from "./Wallpapers.tsx";

/* A palette's examples (routes/$id/examples.tsx), the same page whatever style its address names, each example
   deciding how that style serves it and saying so where it shows the palette another way. First the hero: the palette
   as a page's background in that style, a gradient, the fluted glass or the blob playing from the server's still, run
   under the header to the window's top and edge to edge, with the way back to the editor at its top and at its foot the
   palette's name, how it is drawn and the code that puts it there, in the theme that reads on the colors under them
   (tone.ts), or on a sheet of the page's own where neither does. Then the examples, each in the documentation's frame
   (Example.tsx). The editor's keys turn the palette here too (state.ts). */

/** The examples in their order, each with the check of whether the palette suits it (fit.ts): the page shows the ones
    it suits, numbered as they stand, and the keys that turn the palette may bring one in or take one out. */
const SECTIONS: readonly { fits: (s: Shown) => boolean; example: Component<ExampleProps> }[] = [
  { fits: cardsFits, example: CardsExample },
  { fits: profileFits, example: ProfileExample },
  { fits: chartFits, example: ChartExample },
  { fits: wallpapersFits, example: WallpapersExample },
  { fits: swatchesFits, example: SwatchesExample }
];

/** The still as the hero's code shows it: its data elided, which Copy writes in full. */
const STILL_SHOWN: Readonly<Record<EffectKind, string>> = {
  glass: 'url("data:image/webp;base64,…") 50% 50%/cover no-repeat',
  blob: 'url("data:image/svg+xml,…") 50% 50% / 100% 100% no-repeat'
};

export function ExamplesPage(props: { seed: string; view: View; effect: Effect | null }) {
  const shell = useContext(ShellContext);
  const router = useRouter();
  const location = useLocation();
  const st = createExamplesState({
    initial: untrack(() => ({
      seed: props.seed,
      palette: decodePalette(props.seed) as Palette,
      view: props.view,
      effect: props.effect
    })),
    router,
    location
  });
  const s = st.painted;
  const origin = siteOrigin();
  shell?.keys(() => examplesBindings(st));
  shell?.paint(() => [
    { seed: s().seed, style: s().view.style, steps: s().view.steps, angle: s().view.angle }
  ]);
  return (
    <AppPage>
      <main id="main" class={styles.page}>
        <Hero s={s()} origin={origin} onLeave={st.settle} onRandom={st.random} />
        <div class={styles.sections}>
          <For each={SECTIONS.filter(section => section.fits(s()))}>
            {(section, i) => (
              <Dynamic component={section.example} s={s()} origin={origin} n={i() + 1} />
            )}
          </For>
        </div>
      </main>
    </AppPage>
  );
}

/** The hero: the palette as a page's background, from the window's top, edge to edge. */
function Hero(props: { s: Shown; origin: string; onLeave: () => void; onRandom: () => void }) {
  const heading = createUniqueId();
  const s = () => props.s;
  const name = () => paletteName(s().palette, s().view);
  /* the way back: the editor at this palette as the keys left it */
  const editor = () =>
    localHref(
      seedAddress({
        seed: s().seed,
        view: s().view,
        ...(s().effect ? { effect: s().effect } : {})
      })
    );
  const tone = () => wordsTone(s());
  const code = (): CodeTab[] => {
    const effect = s().effect;
    if (effect)
      return [
        {
          label: "HTML",
          code: effectEmbedHtml(
            props.origin,
            s().seed,
            effect,
            s().view.angle,
            STILL_SHOWN[effect.kind]
          ),
          take: () => effectHtml(takenOf(s()), effect),
          where: { text: t("In the page's head") }
        },
        {
          label: t("Linked"),
          code: effectEmbedHtml(props.origin, s().seed, effect, s().view.angle),
          where: { text: t("In the page's head") }
        }
      ];
    return [
      {
        label: "CSS",
        code: cssBlock(stopsOf(s()), s().view.style, s().view.angle, colorFormat()),
        where: { text: t("In any CSS rule") }
      },
      {
        label: "HTML",
        code: `<link rel="stylesheet" href="${props.origin}/${s().seed}.css${viewSearch(s().view)}">`,
        where: { text: t("In the page's head") }
      }
    ];
  };
  return (
    <section class={styles.hero} aria-labelledby={heading}>
      <div class={styles.backdrop} aria-hidden="true">
        <Switch fallback={<div class={styles.fill} style={{ background: gradientOf(s()) }} />}>
          <Match when={s().effect?.kind === "glass" && s().effect}>
            {effect => (
              <GlassLayer
                palette={s().palette}
                view={{
                  speed: effect().speed,
                  fps: effect().fps,
                  angle: s().view.angle,
                  shape: effect().look.shape
                }}
              />
            )}
          </Match>
          <Match when={s().effect?.kind === "blob" && s().effect}>
            {effect => (
              <BlobLayer palette={s().palette} settings={effect()} angle={s().view.angle} />
            )}
          </Match>
        </Switch>
      </div>
      {/* the way back to the editor, and a random palette for a reader with no keyboard, the key in its tip */}
      <div class={styles.top}>
        <Button variant="art" size="sm" href={editor()} onClick={() => props.onLeave()}>
          <Icon name="back" size={13} />
          {t("Editor")}
        </Button>
        <Button variant="art" size="sm" tip={keyOf("random")} onClick={() => props.onRandom()}>
          <Icon name="dice" size={13} />
          {t("Random")}
        </Button>
      </div>
      <div
        class={styles.words}
        data-theme={tone() ?? undefined}
        data-sheet={tone() ? undefined : ""}
      >
        <span class={styles.kicker}>{t("Examples")}</span>
        <h1 id={heading} class={styles.title}>
          {name()}
        </h1>
        <p class={styles.drawn}>{drawnWords(s())}</p>
        <CodeTabs tabs={code()} aria-label={t("The code that paints it")} />
      </div>
    </section>
  );
}
