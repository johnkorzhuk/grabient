/* What every page needs of the editor's effects (effects.ts), kept apart so no page but the editor's carries the rest:
   the key this browser keeps the reader's choice under, the script that hides the server's glass still before the
   first paint where the reader chose otherwise, and the words the header's Appearance button reads. */
import type { EffectKind, EffectPlay } from "@grabient/engine/effect.ts";
import { msg, t } from "@grabient/i18n";

/** Where this browser keeps the reader's choice of effect and each one's settings. */
export const EFFECT_KEY = "grabient-effect";

/** Before the first paint: the server's glass still hidden on a page whose address names no style, where this browser
    chose something other than the glass. */
export const effectScript = `(function(){try{if(/[?&]style=/.test(location.search))return;var k=JSON.parse(localStorage.getItem(${JSON.stringify(EFFECT_KEY)})||"null");if(k&&k.kind!=="glass")document.documentElement.dataset.glass="off"}catch(e){}})();`;

/** What the Appearance button reads while an effect plays: its pace (Off at 0), its frames a second where set, and the
    angle where the reader set one. */
export const effectSummary = (play: EffectPlay, angle: number | null) =>
  [
    play.speed === 0 ? t("Off") : `${Number(play.speed.toFixed(2))}×`,
    ...(play.fps && play.speed > 0 ? [`${play.fps} FPS`] : []),
    ...(angle !== null ? [`${angle}°`] : [])
  ].join(" · ");

/** An effect's name in the reader's language. */
export const effectLabel = (kind: EffectKind) =>
  t(kind === "glass" ? msg("Fluted glass") : msg("Blob"));
