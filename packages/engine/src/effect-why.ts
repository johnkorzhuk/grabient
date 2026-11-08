/* Why each effect hands over less where effect.ts's EFFECT_KINDS says it does: one sentence for each null, false or
   "still" there, John's word where he gave one, and none where it falls short of nothing (effect-conformance.test.ts
   holds the two together). Apart from the table, which every page's start loads, so no page carries the words; the
   tests, the docs and whoever adds an effect read them. */
import type { EffectKind, EffectShortfall } from "./effect.ts";
import { kitRecord } from "./kit/kinds.ts";

const NO_FRAME_SVG =
  "its SVG is drawn by filters and moved by CSS keyframes from its first frame; no writer yet puts a frame at t into an SVG of its own";

/* the field effects' (kit/): every one is a field's levels, which move as the papercut's cuts do */
const KIT_WHY: Readonly<Partial<Record<EffectShortfall, string>>> = {
  svgMotion:
    "its levels change shape as it moves, islands surfacing and parting, which an SVG follows only by stills fading or outlines morphing, as the papercut's cuts would",
  figma:
    "its levels change shape as it moves, islands surfacing and parting, which no layer's turn or move on Figma's timeline follows"
};

export const EFFECT_WHY: Readonly<
  Record<EffectKind, Readonly<Partial<Record<EffectShortfall, string>>>>
> = {
  glass: { frameSvg: NO_FRAME_SVG },
  blob: { frameSvg: NO_FRAME_SVG },
  silk: {},
  rosette: {},
  papercut: {
    svgMotion:
      'its cuts change shape as it moves, which an SVG follows only by stills fading or outlines morphing, megabytes each (John, 3 Nov 2026: "we just dont do animations with svg")',
    figma:
      "its cuts change shape as it moves, islands surfacing and parting, which no layer's turn or move on Figma's timeline follows"
  },
  strings: {
    svgMotion:
      "its threads change shape as it moves, loops closing and bundles shedding threads, which an SVG follows only by stills fading or paths morphing, as the papercut's cuts would",
    figma:
      "its threads change shape as it moves, which no layer's turn or move on Figma's timeline follows; and a paste's layers are fills alone (figma-schema.ts holds no stroke's paint), so each thread is pasted as its outline"
  },
  ...kitRecord(() => KIT_WHY)
};
