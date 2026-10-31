/* The effect the editor's picture plays instead of the gradient: none, the fluted glass or the blob, and how each
   plays, kept apart, so a style chosen and then left gives each its settings back as they were. The address says
   which plays and how (engine/effect.ts), and says only that: while an effect plays it carries no steps, and while the
   gradient shows no speed. An address that names no style at all takes the reader's own choice, kept in this browser:
   the fluted glass until the reader picks another. The server draws the glass's still into such a page (Boot.tsx),
   and effectScript hides it before the first paint where this browser chose otherwise. In the editor the blob always
   has a shape number, so a drag that recolors the palette keeps the blob it is looking at. */
import {
  BLOB_LOOK,
  BLOB_SHAPE_MAX,
  type BlobLook,
  blobLook,
  blobShapeOf,
  EFFECT_FPS_MAX,
  EFFECT_PLAY,
  EFFECT_SPEED,
  EFFECTS,
  type Effect,
  type EffectKind,
  type EffectSettings,
  effectFps,
  effectSpeed,
  isEffect,
  sameSettings
} from "@grabient/engine/effect.ts";
import { createSignal, untrack } from "solid-js";
import { EFFECT_KEY } from "./effect-page.ts";

export { EFFECT_FPS_MAX as FPS_MAX, EFFECT_SPEED as SPEED };

type Settings = Record<EffectKind, EffectSettings>;
/** The reader's choice as this browser keeps it. */
interface Kept {
  kind: EffectKind | null;
  settings: Settings;
}
const DEFAULT_SETTINGS: EffectSettings = { ...EFFECT_PLAY, look: BLOB_LOOK };
const DEFAULT_KEPT: Kept = {
  kind: "glass",
  settings: { glass: DEFAULT_SETTINGS, blob: DEFAULT_SETTINGS }
};

/** Settings as stored or set: each part in its bounds. Stored browser data is untrusted. */
const sane = (v: Partial<EffectSettings> | null | undefined): EffectSettings => ({
  speed: effectSpeed(v?.speed ?? 1),
  fps: effectFps(v?.fps),
  look: blobLook(v?.look)
});

function readKept(): Kept {
  try {
    const k = JSON.parse(localStorage.getItem(EFFECT_KEY) ?? "null") as Partial<Kept> | null;
    if (!k) return DEFAULT_KEPT;
    return {
      kind: k.kind === null ? null : isEffect(k.kind) ? k.kind : "glass",
      settings: { glass: sane(k.settings?.glass), blob: sane(k.settings?.blob) }
    };
  } catch {
    return DEFAULT_KEPT;
  }
}

const settingsOf = (effect: Effect): EffectSettings => ({
  speed: effect.speed,
  fps: effect.fps,
  look: effect.look
});
const sameEffect = (a: Effect | null, b: Effect | null) =>
  a === b || (!!a && !!b && a.kind === b.kind && sameSettings(a, b));

/** A shape number the palette suggests, so a blob first chosen is the same for the same palette. */
export const shapeOf = blobShapeOf;

export interface Effects {
  /** the effect playing with its settings, or null while the gradient shows */
  effect: () => Effect | null;
  kind: () => EffectKind | null;
  /** an effect's own settings, kept while another style shows */
  settings: (kind: EffectKind) => EffectSettings;
  /** the reader picks an effect, or the gradient with null */
  choose: (kind: EffectKind | null) => void;
  /** the reader changes how an effect plays */
  set: (kind: EffectKind, part: Partial<Omit<EffectSettings, "look">>) => void;
  /** the reader changes the blob's look */
  look: (part: Partial<BlobLook>) => void;
  /** another shape for the blob, other than the one shown */
  shuffle: () => void;
  /** an address landed: the effect it names, or, where it names no style, the reader's own choice */
  arrive: (effect: Effect | null, styled: boolean) => void;
  /** whether the effect differs from the one the page opened with, which Reset gives back */
  changed: () => boolean;
  reset: () => void;
}

/** The effects as an address opened the page, for the palette `seed` names; `own` is a figure's palette, which plays
    none and keeps nothing. */
export function createEffects(
  start: Effect | null,
  styled: boolean,
  seed: () => string,
  own = false
): Effects {
  const kept = own ? { ...DEFAULT_KEPT, kind: null } : readKept();
  /* the blob always has a shape here */
  const shaped = (all: Settings): Settings =>
    all.blob.look.shape === null
      ? {
          ...all,
          blob: { ...all.blob, look: { ...all.blob.look, shape: shapeOf(untrack(seed)) } }
        }
      : all;
  const settled = (state: Kept): Kept =>
    state.kind === "blob" ? { ...state, settings: shaped(state.settings) } : state;
  /* the state as it stands, kept beside the signals: a signal read in the task that wrote it still gives the value
     before the write, and the mark on <html> and this browser's copy must follow the write itself */
  let now: Kept = settled({
    kind: start ? start.kind : styled ? null : kept.kind,
    settings: start ? { ...kept.settings, [start.kind]: settingsOf(start) } : kept.settings
  });
  const [kind, setKind] = createSignal<EffectKind | null>(now.kind);
  const [settings, setSettings] = createSignal<Settings>(now.settings);
  const effectOf = (state: Kept): Effect | null =>
    state.kind ? { kind: state.kind, ...state.settings[state.kind] } : null;
  const effect = (): Effect | null => {
    const k = kind();
    return k ? { kind: k, ...settings()[k] } : null;
  };
  let opened = effectOf(now);
  const [openedAt, setOpenedAt] = createSignal(opened);
  /** a new state: the signals, the mark on <html> (the server's glass still answers to it, effectScript) and, where
      the reader made it, this browser's copy follow; a figure's palette plays none and touches neither */
  const commit = (next: Kept, keep = true) => {
    now = settled(next);
    setKind(now.kind);
    setSettings(now.settings);
    if (own) return;
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      if (now.kind === "glass") delete root.dataset.glass;
      else root.dataset.glass = "off";
    }
    if (!keep) return;
    try {
      localStorage.setItem(EFFECT_KEY, JSON.stringify(now));
    } catch {}
  };
  const withSettings = (k: EffectKind, s: EffectSettings): Kept => ({
    ...now,
    settings: { ...now.settings, [k]: s }
  });
  return {
    effect,
    kind,
    settings: k => settings()[k],
    choose(next) {
      commit({ ...now, kind: next });
    },
    set(k, part) {
      commit(withSettings(k, sane({ ...now.settings[k], ...part })));
    },
    look(part) {
      const blob = now.settings.blob;
      commit(withSettings("blob", sane({ ...blob, look: { ...blob.look, ...part } })));
    },
    shuffle() {
      const blob = now.settings.blob;
      const was = blob.look.shape ?? -1;
      let next = was;
      while (next === was) next = Math.floor(Math.random() * (BLOB_SHAPE_MAX + 1));
      commit(withSettings("blob", { ...blob, look: { ...blob.look, shape: next } }));
    },
    /* an address landed: what it names shows, and the reader's own choice stays as it was kept */
    arrive(next, addressStyled) {
      commit(
        next
          ? { ...withSettings(next.kind, settingsOf(next)), kind: next.kind }
          : addressStyled || own
            ? { ...now, kind: null }
            : readKept(),
        false
      );
      opened = effectOf(now);
      setOpenedAt(opened);
    },
    changed: () => !sameEffect(effect(), openedAt()),
    reset() {
      commit(
        opened
          ? { ...withSettings(opened.kind, settingsOf(opened)), kind: opened.kind }
          : { ...now, kind: null }
      );
    }
  };
}

/** Every effect, for the menu's tiles. */
export const EFFECT_KINDS = EFFECTS;
