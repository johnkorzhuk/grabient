import { decodePalette } from "@grabient/engine/codec.ts";
import { cssBlock } from "@grabient/engine/css.ts";
import {
  EFFECT_LOOK,
  EFFECT_PLAY,
  EFFECTS,
  type EffectKind,
  isVectorKind,
  type VectorKind
} from "@grabient/engine/effect.ts";
import { type EffectLayers, effectEmbedHtml } from "@grabient/engine/effect-embed.ts";
import { GRAIN_SIDE } from "@grabient/engine/grain-tiles.ts";
import { kitRecord } from "@grabient/engine/kit/kinds.ts";
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
  createSignal,
  createUniqueId,
  For,
  Match,
  Show,
  Switch,
  untrack,
  useContext
} from "solid-js";
import { AppPage } from "../../app/Frames.tsx";
import { ShellContext } from "../../app/shell.ts";
import { colorFormat } from "../../lib/color-format.ts";
import { paletteName, siteOrigin } from "../../lib/page-meta.ts";
import { BlobLayer } from "../editor/BlobLayer.tsx";
import { FxLayer } from "../editor/FxLayer.tsx";
import { effectHtml } from "../editor/formats.ts";
import { GlassLayer } from "../editor/GlassLayer.tsx";
import { keyOf } from "../editor/keys.ts";
import { CardsExample } from "./Cards.tsx";
import { ChartExample, chartFits, chartGood } from "./Chart.tsx";
import {
  type ExampleProps,
  effectBlur,
  effectUnder,
  Grain,
  TurnHint,
  turnsSaid
} from "./Example.tsx";
import styles from "./ExamplesPage.module.css";
import { HERO_LOOKS, heroOf } from "./hero.ts";
import { LOOKS, lookOf, looksFor, pickLook, plainOf, shuffled, type Taken } from "./looks.ts";
import { ProfileExample } from "./Profile.tsx";
import type { Shown } from "./paint.ts";
import { SwatchesExample } from "./Swatches.tsx";
import { drawnWords, gradientOf, stopsOf, takenOf } from "./shared.ts";
import { createExamplesState, examplesBindings } from "./state.ts";
import { turnInPlay } from "./swipe.ts";
import { wordsTone } from "./tone.ts";
import { WallpapersExample, wallpapersGood } from "./Wallpapers.tsx";

/* A palette's examples (routes/$id/examples.tsx): one page for each palette, whatever its address named, each part of it
   showing the palette in a look of its own that the seed picks of the looks the part is a good fit for (looks.ts). First
   the hero: the palette as a page's background playing one of the effects, which the seed picks, from the server's
   still, under the header and edge to edge, with the way back to the editor at its top and at its foot
   the palette's name, how it is drawn and the code that puts it there, in the theme that reads on the colors under them
   (tone.ts), the look picked where one does, or on a sheet of the page's own where none does. Then the examples, each
   in the documentation's frame (Example.tsx), taking turns at the looks so the page shows the palette's range. The
   editor's keys that turn the palette turn it here too (state.ts). */

/** The examples in their order: whether the palette suits one (else the page leaves it out, and the keys that turn the
    palette may bring it in), and what makes a look a good fit for it. The cards take their looks a tile at a time. */
interface Section {
  name: string;
  example: Component<ExampleProps>;
  fits?: (base: Shown) => boolean;
  good?: (s: Shown) => boolean;
  /** it shows a picture of the palette, which takes a soft and a grain (looks.ts finished); the charts and the tokens
      take its colors alone */
  finish?: boolean;
}
const SECTIONS: readonly Section[] = [
  { name: "cards", example: CardsExample },
  { name: "profile", example: ProfileExample, finish: true },
  { name: "chart", example: ChartExample, fits: chartFits, good: chartGood },
  { name: "wallpapers", example: WallpapersExample, good: wallpapersGood, finish: true },
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
            taken,
            1,
            0,
            section.finish
          )
    );
  return {
    hero,
    sections: shown.map(section => ({ name: section.name, s: looks.get(section.name) ?? base }))
  };
}

/* the looks a reader turns each part through, worked out as the part is first turned, for the palette shown */
let lists: { seed: string; of: Map<string, Shown[]> } = { seed: "", of: new Map() };
/** The look a reader turned a part to, `turn` looks on from the page's own (`first`; back where `turn` is under 0), of
    those it is a good fit for (looks.ts's looksFor), coming round again after the last. */
function turnedTo(first: Shown, name: string, turn: number): Shown {
  if (!turn) return first;
  if (lists.seed !== first.seed) lists = { seed: first.seed, of: new Map() };
  let list = lists.of.get(name);
  if (!list) {
    const section = SECTIONS.find(s => s.name === name);
    list = looksFor(
      first,
      name,
      name === "hero" ? HERO_LOOKS : LOOKS,
      section?.good ?? (() => true),
      name === "hero" || !!section?.finish
    );
    lists.of.set(name, list);
  }
  return list[((turn % list.length) + list.length) % list.length];
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
  /* which look a reader turned each part to, for the palette shown: none at first, and none again on another palette */
  const [turns, setTurns] = createSignal<{ seed: string; at: Readonly<Record<string, number>> }>({
    seed: "",
    at: {}
  });
  const turnOf = (name: string) =>
    turns().seed === st.painted().seed ? (turns().at[name] ?? 0) : 0;
  const turnPart = (name: string, by: 1 | -1) => {
    const seed = untrack(() => st.painted().seed);
    setTurns(now => {
      const at = now.seed === seed ? now.at : {};
      return { seed, at: { ...at, [name]: (at[name] ?? 0) + by } };
    });
  };
  const hero = createMemo(() => turnedTo(looks().hero, "hero", turnOf("hero")));
  const origin = siteOrigin();
  shell?.keys(() => examplesBindings(st, turnInPlay));
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
        <Hero
          s={hero()}
          origin={origin}
          onLeave={st.settle}
          onRandom={st.random}
          onTurn={by => turnPart("hero", by)}
        />
        <div class={styles.sections}>
          {/* each example drawn anew for each palette, and kept as a reader turns it or another */}
          <For each={looks().sections.map(section => `${section.s.seed}|${section.name}`)}>
            {(key, i) => {
              const name = key.slice(key.indexOf("|") + 1);
              const Section = (SECTIONS.find(section => section.name === name) as Section).example;
              const first = () =>
                looks().sections.find(section => section.name === name)?.s ?? looks().hero;
              const s = createMemo(() =>
                name === "cards" ? first() : turnedTo(first(), name, turnOf(name))
              );
              return (
                <Section
                  s={s()}
                  origin={origin}
                  n={i() + 1}
                  turn={turnOf(name)}
                  onTurn={by => turnPart(name, by)}
                />
              );
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
  blob: 'url("data:image/svg+xml,…") 50% 50% / 100% 100% no-repeat',
  silk: 'url("data:image/svg+xml,…") 50% 50% / cover no-repeat',
  rosette: 'url("data:image/svg+xml,…") 50% 50% / cover no-repeat',
  papercut: 'url("data:image/svg+xml,…") 50% 50% / cover no-repeat',
  strings: 'url("data:image/svg+xml,…") 50% 50% / cover no-repeat',
  dimple: 'url("data:image/svg+xml,…") 50% 50% / cover no-repeat',
  ...kitRecord(() => 'url("data:image/svg+xml,…") 50% 50% / cover no-repeat')
};

/** The layers a soft or grained effect's first frame lies on behind a page, as the hero's code shows them: its blur,
    the gradient under it and the grain's tile, whose data the code elides, which Copy writes in full
    (engine/effect-code.ts effectLayers). */
function layersShown(s: Shown): EffectLayers {
  const { soft, grain } = s.view;
  return {
    ...(soft ? { blur: effectBlur(s, "vmax"), under: effectUnder(s) } : {}),
    ...(grain
      ? { grain: `url("data:image/png;base64,…") 0 0 / ${GRAIN_SIDE}px ${GRAIN_SIDE}px` }
      : {})
  };
}

/** The effects drawn over a vector still, each its own layer in the hero, as EFFECT_KINDS names them. */
const VECTOR_KINDS: readonly VectorKind[] = EFFECTS.filter(isVectorKind);

/** The hero: the palette as a page's background, under the header, edge to edge. */
function Hero(props: {
  s: Shown;
  origin: string;
  onLeave: () => void;
  onRandom: () => void;
  /** turns the hero to another look, on or back */
  onTurn: (by: 1 | -1) => void;
}) {
  const heading = createUniqueId();
  const hint = createUniqueId();
  const s = () => props.s;
  /* a swipe across the hero or a press on its picture turns it, and the look it turned to is said to one who listens */
  let hero!: HTMLElement;
  turnsSaid(
    () => hero,
    () => props.onTurn,
    () => drawnWords(s())
  );
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
            STILL_SHOWN[effect.kind],
            s().view,
            layersShown(s())
          ),
          take: () => effectHtml(takenOf(s()), effect),
          where: { text: t("In the page's head") }
        },
        {
          label: t("Linked"),
          code: effectEmbedHtml(
            props.origin,
            s().seed,
            effect,
            s().view.angle,
            undefined,
            s().view
          ),
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
    <section
      ref={hero}
      class={styles.hero}
      aria-labelledby={heading}
      aria-describedby={hint}
      data-look="hero"
    >
      {/* a soft effect blurred over the gradient its edges thin to, and the grain over it, as the editor's stage */}
      <div
        class={styles.backdrop}
        aria-hidden="true"
        data-soft={s().view.soft ? "" : undefined}
        style={{ background: effectUnder(s()), "--fx-blur": effectBlur(s()) }}
      >
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
            />
          </Match>
          {/* a layer for each vector effect, as the editor's stage has: a layer plays the kind it was made for */}
          {VECTOR_KINDS.map(kind => (
            <Match when={s().effect?.kind === kind}>
              <FxLayer
                kind={kind}
                palette={s().palette}
                settings={s().effect ?? { ...EFFECT_PLAY, look: EFFECT_LOOK }}
                angle={s().view.angle}
              />
            </Match>
          ))}
        </Switch>
        <Show when={s().view.grain}>{grain => <Grain grain={grain()} />}</Show>
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
        data-hold=""
      >
        <span class={styles.kicker}>{t("Examples")}</span>
        <h1 id={heading} class={styles.title}>
          {name()}
        </h1>
        <p class={styles.drawn}>
          {drawnWords(s())}
          <TurnHint id={hint} />
        </p>
        <CodeTabs tabs={code()} aria-label={t("The code that paints it")} />
      </div>
    </section>
  );
}
