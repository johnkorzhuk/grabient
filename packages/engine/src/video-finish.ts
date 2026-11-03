/* A clip's soft and grain as its module finishes its frames with them (video.ts, video/video.c), worked out from
   fx-finish.ts: how the blur runs and what lies under the blurred frame. It stands apart from video.ts because the
   Worker's own entrypoint loads the clips' drawing without the router (server/images/video-parts.ts): through
   fx-finish.ts this reaches svg.ts, which the router's chunk holds, and the drawing's reaching it too would split
   that module out of the router's chunk. The answer loads this, works a clip's finish out once and hands it to every
   part. */
import type { EffectFinish } from "./effect.ts";
import { blurBoxes, effectBlurSigma, effectUnderlay } from "./fx-finish.ts";
import type { Palette } from "./palette.ts";
import { type VideoBlur, type VideoEffect, type VideoFinish, videoBlurScale } from "./video.ts";
import type { Size } from "./view.ts";

/** How the module blurs a frame for a soft of `sigma` pixels: at the frame's own resolution, by fx-finish.ts's own
    boxes (blurBoxes), or at 1/`scale` of it, the frame averaged `scale` by `scale` as it is drawn and read back up
    bilinearly after, as a browser draws a wide blur, by three boxes whose variance is the full blur's less what the
    averaging and the reading back spread (a box of f's (f² - 1) / 12 and a bilinear read's f² / 6 a side), each box
    centered: three of odd widths, or two of even widths leaning either way and one of odd, their widths within 2 of
    each other, so their sum stays near a Gaussian. Each step down costs a quarter of the blur before it. */
export function videoBlur(sigma: number, scale = videoBlurScale(sigma)): VideoBlur {
  const full = blurBoxes(sigma);
  if (scale === 1 || !full.length) return { scale: 1, boxes: full };
  const variance = (boxes: readonly [number, number][]) =>
    boxes.reduce((v, [l, r]) => v + ((l + r + 1) ** 2 - 1) / 12, 0);
  const target =
    (variance(full) - ((scale * scale - 1) / 12 + (scale * scale) / 6)) / (scale * scale);
  if (target <= 0) return { scale: 1, boxes: full };
  const w0 = Math.sqrt(4 * target + 1);
  let best: { boxes: [number, number][]; off: number; spread: number } | null = null;
  for (let a = Math.max(1, Math.floor(w0) - 2); a <= Math.ceil(w0) + 2; a++)
    for (let b = a; b <= a + 2; b++)
      for (let c = Math.max(1, b - 2); c <= a + 2; c++) {
        const odd = a % 2 && b % 2 && c % 2 && c >= b;
        const paired = !(a % 2) && !(b % 2) && c % 2;
        if (!odd && !paired) continue;
        const boxes: [number, number][] = odd
          ? [a, b, c].map((w): [number, number] => [(w - 1) / 2, (w - 1) / 2])
          : [
              [a / 2, a / 2 - 1],
              [b / 2 - 1, b / 2],
              [(c - 1) / 2, (c - 1) / 2]
            ];
        const off = Math.abs(variance(boxes) - target);
        const spread = Math.max(a, b, c) - Math.min(a, b, c);
        if (
          !best ||
          off < best.off - 1e-9 ||
          (Math.abs(off - best.off) <= 1e-9 && spread < best.spread)
        )
          best = { boxes, off, spread };
      }
  return best ? { scale, boxes: best.boxes } : { scale: 1, boxes: full };
}

/** A clip's finish at its size: its grain, and for a soft, the blur of its sigma (at `blurAs` where a check asks one
    resolution, else videoBlur's) and the palette's gradient under it at the effect's angle, its stops blurred by the
    same soft (none under a blob with no ground). */
export function videoFinish(
  P: Palette,
  effect: Pick<VideoEffect, "kind" | "look">,
  angle: number,
  finish: EffectFinish,
  size: Size,
  blurAs?: VideoBlur["scale"]
): VideoFinish {
  return {
    ...(finish.grain ? { grain: finish.grain } : {}),
    ...(finish.soft
      ? {
          soft: {
            blur: videoBlur(effectBlurSigma(finish.soft, size), blurAs),
            under: effectUnderlay(P, effect, angle, finish.soft)
          }
        }
      : {})
  };
}
