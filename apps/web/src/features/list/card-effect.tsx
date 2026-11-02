import { decodePalette } from "@grabient/engine/codec.ts";
import type { Effect } from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import { t } from "@grabient/i18n";
import { createMemo, Loading, lazy } from "solid-js";
import { effectLabel } from "../editor/effect-page.ts";
import { cardEffect } from "./appearance.ts";

/* The effects' pictures load once a list plays one, never with a list's start: by their export's name, so a page the
   server drew hydrates them as it stands. */
const EffectArt = lazy(() => import("../editor/EffectArt.tsx"), { export: "EffectArt" });

/** Everything a list's cards need to play an effect, asked for as the list first plays one, so a card shows it from
    its first frame. */
export function preloadCardEffects(kind: Effect["kind"]): void {
  void EffectArt.preload().catch(() => {});
  void import("../editor/EffectArt.tsx").then(m => m.preloadEffectArt(kind)).catch(() => {});
}

/** Done once the cards can draw an effect's stills: their picture's code and their stills'. */
export async function readyCardEffects(kind: Effect["kind"]): Promise<void> {
  preloadCardEffects(kind);
  await Promise.all([
    EffectArt.preload(),
    kind === "glass"
      ? import("../editor/glass-draw.ts").then(m => m.loadStill())
      : import("../editor/blob-draw.ts").then(m => m.loadBlob())
  ]);
}

/** A card's picture while its list plays an effect, as the editor's sheet draws its cards: the effect's still in its
    palette's own shape, moving while the card is lit (EffectArt.tsx), its name for a screen reader, the light under
    it (the glass's colors along its ribs, none under a blob) and whether it stands bare (a blob with no ground).
    Nothing while the list draws gradients. A style previewed on every card shows over the picture, which stays, so
    letting the preview go shows it again as it was drawn. */
export function createCardEffect(o: {
  seed: () => string;
  /** the angle the list draws the card at */
  angle: () => number;
  /** the list's effect as the cards play it now */
  effect: () => Effect | null;
  /** the card's own effect, as its save kept it in its own shape, which it plays where the list plays none */
  own?: () => Effect | null;
  /** a gradient's style is previewed on every card */
  peek: () => boolean;
  name: () => string;
}) {
  const palette = createMemo(() => decodePalette(o.seed()));
  const effect = createMemo(() => {
    const fx = o.effect();
    if (fx) return palette() ? cardEffect(fx, o.seed()) : null;
    const own = o.own?.() ?? null;
    return own && palette() ? own : null;
  });
  /* the picture keeps the last effect it played while the list lets it go, until the card takes it away */
  const played = createMemo<Effect | null>(last => effect() ?? last ?? null);
  /* the effect the card shows: none while a style is previewed over it */
  const shown = () => (o.peek() ? null : effect());
  return {
    picture: () =>
      effect()
        ? (active: () => boolean) => (
            <Loading>
              <EffectArt
                kind={played()!.kind}
                palette={palette()!}
                settings={played()!}
                angle={o.angle()}
                active={active()}
              />
            </Loading>
          )
        : undefined,
    /** the previewed style shows in the picture's place */
    peek: () => !!effect() && o.peek(),
    label: () => {
      const fx = shown();
      return fx ? t("{name}, {style}", { name: o.name(), style: effectLabel(fx.kind) }) : undefined;
    },
    glow: () => {
      const fx = shown();
      if (!fx) return undefined;
      return fx.kind === "glass"
        ? { stops: glassColors(palette()!), style: "linearGradient" as const, angle: o.angle() }
        : null;
    },
    bare: () => shown()?.kind === "blob" && shown()?.look.bg === null
  };
}
