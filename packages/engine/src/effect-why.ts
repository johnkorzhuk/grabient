/* Why each effect hands over less where effect.ts's EFFECT_KINDS says it does: one sentence for each null or false
   there, John's word where he gave one, and none where it falls short of nothing (effect-conformance.test.ts holds
   the two together). Apart from the table, which every page's start loads, so no page carries the words; the
   tests, the docs and whoever adds an effect read them. */
import type { EffectKind, EffectShortfall } from "./effect.ts";
import { kitRecord } from "./kit/kinds.ts";

/* John's word on the effects whose Figma paste could only stand still, the field effects and the papercut */
const FIGMA_DROPPED =
  'John, 8 Nov 2026: "in the cases of sandstone and papercut where theres no svg animation to embed with the figma copy button, we can just drop it and they can use svg"';

/* John's word on the aurora, whose stage, cards and files came first, its clips later the same day (his "werre
   missing hte mp4 download"), its shader pages on 13 Nov 2026 (his "aura is missing shader code"), and whose script
   follows */
const STAGED = 'it came to staging first (John, 11 Nov 2026: "get this in staging")';

const NO_FRAME_SVG =
  "its SVG is drawn by filters and moved by CSS keyframes from its first frame; no writer yet puts a frame at t into an SVG of its own";

/* the field effects' (kit/): every one is a field's levels, which move as the papercut's cuts do */
const KIT_WHY: Readonly<Partial<Record<EffectShortfall, string>>> = {
  svgMotion:
    "its levels change shape as it moves, islands surfacing and parting, which an SVG follows only by stills fading or outlines morphing, as the papercut's cuts would",
  figma: `its levels change shape as it moves, islands surfacing and parting, and Figma's timeline moves, turns, scales and fades layers but never changes a shape, so a paste could only be its still, which its SVG already is (${FIGMA_DROPPED})`
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
    figma: `its cuts change shape as it moves, islands surfacing and parting, and Figma's timeline moves, turns, scales and fades layers but never changes a shape, so a paste could only be its still, which its SVG already is (${FIGMA_DROPPED})`
  },
  strings: {
    svgMotion:
      "its threads change shape as it moves, loops closing and bundles shedding threads, which an SVG follows only by stills fading or paths morphing, as the papercut's cuts would",
    figma:
      'its threads change shape as it moves, loops closing and bundles shedding threads, and Figma\'s timeline moves, turns, scales and fades layers but never changes a shape, so a paste could only be its still, which its SVG already is, its threads as strokes (John, 8 Nov 2026, of the sandstone and the papercut: "we can just drop it and they can use svg", then "same for strings.")'
  },
  dimple: {
    svgMotion:
      'it has no loop, nothing in it moving by itself (John, 10 Nov 2026: "there should be no stationary animations for this one"): its hollow follows the pointer, and an SVG shown as a picture is given no pointer, so its file is its still; roaming (its `roam`, 11 Nov 2026), every disc slides, turns and changes its place along the palette by tracks of its own, a thousand of them, which its Copy for Figma writes for Figma\'s timeline and no SVG animation holds lightly, so its file is its still then too',
    video:
      'it has no loop, nothing in it moving by itself (John, 10 Nov 2026: "there should be no stationary animations for this one"): a clip of it would be its still for as long as it ran; roaming (its `roam`, 11 Nov 2026) it has one, which the clips\' module does not draw yet'
  },
  aurora: {
    svgMotion:
      'its light is turbulence read through the palette, sheets of noise sliding past one another along a fan\'s rays so that its flames boil where they stand, which no slide, turn or scale of a fixed shape gives, so its SVG is a frame of it as shapes (John, 10 Nov 2026: "can this shader be represented as an svg?")',
    figma:
      "Figma's timeline moves, turns, scales and fades layers and nothing on it reads a light through a palette: in Figma it moves only as a shader fill, which a paste cannot carry, so its strips offer its SVG",
    embed: `no script plays it behind another site's page yet, and its stylesheet paints its still there: ${STAGED}`
  },
  ...kitRecord(() => KIT_WHY)
};
