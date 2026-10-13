/* An old `_` link that no map holds, fitted to keyframes in the visitor's browser as the page starts: 96 samples, at
   most 6 keyframes, 200 iterations, the settings of the offline migration. A module of its own so only such a link
   loads the fitter. The fit is deterministic, so one old seed always leads to one seed. */
import { encodePalette } from "./codec.ts";
import { type FitResult, fitSrgbStrip } from "./fit.ts";
import { decodeLegacySeed, type LegacyPalette, legacySrgb } from "./legacy.ts";
import { type ParamReader, parseView, viewSearch } from "./view.ts";

export const importLegacy = (P: LegacyPalette): FitResult =>
  fitSrgbStrip(
    Array.from({ length: 96 }, (_, i) => legacySrgb(P, i / 95)),
    { kMax: 6, iters: 200 }
  );

const fitted = new Map<string, { seed: string; keyframes: number } | null>();
function fittedSeed(old: string) {
  if (!fitted.has(old)) {
    const P = decodeLegacySeed(old);
    const fit = P && importLegacy(P);
    fitted.set(
      old,
      fit ? { seed: encodePalette(fit.palette), keyframes: fit.palette.anchors.length } : null
    );
  }
  return fitted.get(old) ?? null;
}

/** The seed a search field reads a palette as: an old `_` seed is fitted as its link would be; null when it cannot be
    read. Any other seed is itself. */
export const likeSeed = (seed: string): string | null =>
  seed[0] === "_" ? (fittedSeed(seed)?.seed ?? null) : seed;

/** Where an old link leads: its fitted palette at the link's view (its address's query), steps never under the
    fitted keyframes. */
export function importedPath(old: string, params: ParamReader): string | null {
  const made = fittedSeed(old);
  if (!made) return null;
  const view = parseView(params);
  return `/${made.seed}${viewSearch({ ...view, steps: Math.max(view.steps, made.keyframes) })}`;
}
