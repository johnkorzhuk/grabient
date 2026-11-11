/* What every page needs of the editor's effects (effects.ts), kept apart so no page but the editor's carries the rest:
   the key this browser keeps the reader's choice under, the script that hides the server's glass still before the
   first paint where the reader chose otherwise, and the words the header's Appearance button reads. */
import {
  EFFECT_FPS,
  type EffectKind,
  type EffectLook,
  type EffectPlay
} from "@grabient/engine/effect.ts";
import { KIT_LABELS } from "@grabient/engine/kit/names.ts";
import { msg, t } from "@grabient/i18n";

/** Where this browser keeps the reader's choice of effect and each one's settings. */
export const EFFECT_KEY = "grabient-effect";

/** Before the first paint: the server's glass still hidden on a page whose address names no style, where this browser
    chose something other than the glass. */
export const effectScript = `(function(){try{if(/[?&]style=/.test(location.search))return;var k=JSON.parse(localStorage.getItem(${JSON.stringify(EFFECT_KEY)})||"null");if(k&&k.kind!=="glass")document.documentElement.dataset.glass="off"}catch(e){}})();`;

/** What the Appearance button reads while an effect plays: its pace (Off at 0), its frames a second where they are
    not the 60 every effect plays at, its roam where it roams, its steps and its zoom where its look names them (an
    effect that takes them, at other than as designed), and the angle where the reader set one. */
export const effectSummary = (
  play: EffectPlay,
  angle: number | null,
  look: Pick<EffectLook, "steps" | "zoom"> | null = null
) =>
  [
    play.speed === 0 ? t("Off") : `${Number(play.speed.toFixed(2))}×`,
    ...(play.fps !== EFFECT_FPS.default && play.speed > 0 ? [`${play.fps} FPS`] : []),
    ...(play.roam ? [t("Roam")] : []),
    ...(look?.steps != null
      ? [t("{count, plural, one {# step} other {# steps}}", { count: look.steps })]
      : []),
    ...(look?.zoom != null ? [t("Zoom {value}", { value: `${look.zoom}×` })] : []),
    ...(angle !== null ? [`${angle}°`] : [])
  ].join(" · ");

/* each effect's name, every kind its own, so a kind with none is a type error rather than another's name */
const LABELS: Record<EffectKind, string> = {
  glass: msg("Fluted glass"),
  blob: msg("Blob"),
  silk: msg("Silk"),
  rosette: msg("Rosette"),
  papercut: msg("Papercut"),
  strings: msg("Strings"),
  dimple: msg("Dimple"),
  ...KIT_LABELS
};

/** An effect's name in the reader's language. */
export const effectLabel = (kind: EffectKind) => t(LABELS[kind]);
