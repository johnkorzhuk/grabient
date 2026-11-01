import { decodePalette } from "@grabient/engine/codec.ts";
import { cssBlock } from "@grabient/engine/css.ts";
import {
  EFFECT_LOOK,
  EFFECT_PLAY,
  type EffectKind,
  effectEmbedHtml
} from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { viewSearch } from "@grabient/engine/view.ts";
import { localHref, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import type { CodeTab } from "@grabient/ui/CodeTabs.tsx";
import { CodeTabs } from "@grabient/ui/CodeTabs.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { useLocation, useRouter } from "@tanstack/solid-router";
import {
  type Component,
  createMemo,
  createUniqueId,
  For,
  Match,
  Switch,
  untrack,
  useContext
} from "solid-js";
import { AppPage } from "../../app/Frames.tsx";
import { ShellContext } from "../../app/shell.ts";
import { colorFormat } from "../../lib/color-format.ts";
import { paletteName, siteOrigin } from "../../lib/page-meta.ts";
import { BlobLayer } from "../editor/BlobLayer.tsx";
import { effectHtml } from "../editor/formats.ts";
import { GlassLayer } from "../editor/GlassLayer.tsx";
import { keyOf } from "../editor/keys.ts";
import { CardsExample } from "./Cards.tsx";
import { ChartExample, chartFits, chartGood } from "./Chart.tsx";
import type { ExampleProps } from "./Example.tsx";
import styles from "./ExamplesPage.module.css";
import { heroOf } from "./hero.ts";
import { LOOKS, lookOf, pickLook, plainOf, shuffled, type Taken } from "./looks.ts";
import { ProfileExample } from "./Profile.tsx";
import type { Shown } from "./paint.ts";
import { SwatchesExample } from "./Swatches.tsx";
import { drawnWords, gradientOf, stopsOf, takenOf } from "./shared.ts";
import { createExamplesState, examplesBindings } from "./state.ts";
import { wordsTone } from "./tone.ts";
import { WallpapersExample, wallpapersGood } from "./Wallpapers.tsx";

/* A palette's examples (routes/$id/examples.tsx): one page for each palette, whatever its address named, each part of it
   showing the palette in a look of its own that the seed picks of the looks the part is a good fit for (looks.ts). First
   the hero: the palette as a page's background playing the fluted glass or the blob, which the seed picks, from the
   server's still, run under the header to the window's top and edge to edge, with the way back to the editor at its top and at its foot
   the palette's name, how it is drawn and the code that puts it there, in the theme that reads on the colors under them
   (tone.ts), the look picked where one does, or on a sheet of the page's own where none does. Then the examples, each
   in the documentation's frame (Example.tsx), taking turns at the looks so the page shows the palette's range. The
   editor's keys that turn the palette turn it here too (state.ts). */

/** The examples in their order: whether the palette suits one (else the page leaves it out, and the keys that turn the
    palette may bring it in), and what makes a look a good fit for it. The cards take their looks a tile at a time. */
const SECTIONS: readonly {
  name: string;
  example: Component<ExampleProps>;
  fits?: (base: Shown) => boolean;
  good?: (s: Shown) => boolean;
}[] = [
  { name: "cards", example: CardsExample },
  { name: "profile", example: ProfileExample },
  { name: "chart", example: ChartExample, fits: chartFits, good: chartGood },
  { name: "wallpapers", example: WallpapersExample, good: wallpapersGood },
  { name: "swatches", example: SwatchesExample }
];

/** The page's looks, the same each time a palette's page opens: the hero's, then each example's that the palette suits
    (the cards with the palette as it is, their tiles picking their own), each preferring the looks the parts before it
    took least. The examples pick in an order the seed shuffles, so the look the others passed by falls to a different
    one from palette to palette; they stand in their own order. */
export function pageLooks(base: Shown) {
  const taken: Taken = new Map();
  const hero = heroOf(base.seed, base.palette);
  taken.set(lookOf(hero), 1);
  const shown = SECTIONS.filter(section => section.fits?.(base) ?? true);
  const looks = new Map<string, Shown>();
  for (const section of shuffled(shown, base.seed, "sections"))
    looks.set(
      section.name,
      section.name === "cards"
        ? base
        : pickLook(
            base.seed,
            base.palette,
            section.name,
            LOOKS,
            section.good ?? (() => true),
            taken
          )
    );
  return {
    hero,
    sections: shown.map(section => ({
      example: section.example,
      s: looks.get(section.name) ?? base
    }))
  };
}

export function ExamplesPage(props: { seed: string }) {
  const shell = useContext(ShellContext);
  const router = useRouter();
  const location = useLocation();
  const st = createExamplesState({
    initial: untrack(() => plainOf(props.seed, decodePalette(props.seed) as Palette)),
    router,
    location
  });
  const looks = createMemo(() => pageLooks(st.painted()));
  const hero = () => looks().hero;
  const origin = siteOrigin();
  shell?.keys(() => examplesBindings(st));
  shell?.paint(() => [
    {
      seed: hero().seed,
      style: hero().view.style,
      steps: hero().view.steps,
      angle: hero().view.angle
    }
  ]);
  return (
    <AppPage>
      <main id="main" class={styles.page}>
        <Hero s={hero()} origin={origin} onLeave={st.settle} onRandom={st.random} />
        <div class={styles.sections}>
          <For each={looks().sections}>
            {(section, i) => {
              const Section = section.example;
              return <Section s={section.s} origin={origin} n={i() + 1} />;
            }}
          </For>
        </div>
      </main>
    </AppPage>
  );
}

/** The still as the hero's code shows it: its data elided, which Copy writes in full. */
const STILL_SHOWN: Readonly<Record<EffectKind, string>> = {
  glass: 'url("data:image/webp;base64,…") 50% 50%/cover no-repeat',
  blob: 'url("data:image/svg+xml,…") 50% 50% / 100% 100% no-repeat'
};

/** The hero: the palette as a page's background, from the window's top, edge to edge. */
function Hero(props: { s: Shown; origin: string; onLeave: () => void; onRandom: () => void }) {
  const heading = createUniqueId();
  const s = () => props.s;
  /* the palette's own name, whatever look the hero shows */
  const name = () => paletteName(s().palette);
  /* the way back: the editor at this palette, in the view the tab keeps for it */
  const editor = () => localHref(`/${s().seed}`);
  const tone = createMemo(() => wordsTone(s()));
  /* an effect behind a page: its first frame inline and the palette's script, or both from their addresses */
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
        {/* each layer reads the hero's look itself, never the value its Match narrowed: a turn to the other effect lets
            the layer go, and a narrowed value read as it goes is gone, which Solid throws on and the page's error
            showed between palettes */}
        <Switch fallback={<div class={styles.fill} style={{ background: gradientOf(s()) }} />}>
          <Match when={s().effect?.kind === "glass"}>
            <GlassLayer
              palette={s().palette}
              view={{
                speed: s().effect?.speed ?? EFFECT_PLAY.speed,
                fps: s().effect?.fps ?? EFFECT_PLAY.fps,
                angle: s().view.angle,
                shape: s().effect?.look.shape ?? null
              }}
            />
          </Match>
          <Match when={s().effect?.kind === "blob"}>
            <BlobLayer
              palette={s().palette}
              settings={s().effect ?? { ...EFFECT_PLAY, look: EFFECT_LOOK }}
              angle={s().view.angle}
            />
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
