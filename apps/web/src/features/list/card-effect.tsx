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
    Nothing while the list draws gradients. */
export function createCardEffect(o: {
  seed: () => string;
  /** the angle the list draws the card at */
  angle: () => number;
  /** the list's effect as the cards show it now */
  effect: () => Effect | null;
  name: () => string;
}) {
  const palette = createMemo(() => decodePalette(o.seed()));
  const effect = createMemo(() => {
    const fx = o.effect();
    return fx && palette() ? cardEffect(fx, o.seed()) : null;
  });
  /* the picture keeps the last effect it played while the list lets it go, until the card takes it away */
  const played = createMemo<Effect | null>(last => effect() ?? last ?? null);
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
    label: () => {
      const fx = effect();
      return fx ? t("{name}, {style}", { name: o.name(), style: effectLabel(fx.kind) }) : undefined;
    },
    glow: () => {
      const fx = effect();
      if (!fx) return undefined;
      return fx.kind === "glass"
        ? { stops: glassColors(palette()!), style: "linearGradient" as const, angle: o.angle() }
        : null;
    },
    bare: () => effect()?.kind === "blob" && effect()?.look.bg === null
  };
}
