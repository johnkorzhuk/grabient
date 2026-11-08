/* The effect the editor's picture plays instead of the gradient: none, the fluted glass or the blob, and how each
   plays, kept apart, so a style chosen and then left gives each its settings back as they were. The address says
   which plays and how (engine/effect.ts), and says only that: while an effect plays it carries no steps, and while the
   gradient shows no speed. An address that names no style at all takes the reader's own choice, kept in this browser:
   the fluted glass until the reader picks another. The server draws the glass's still into such a page (Boot.tsx),
   and effectScript hides it before the first paint where this browser chose otherwise. In the editor the blob always
   has a shape number, so a drag that recolors the palette keeps the blob it is looking at. */
import {
  blobShapeOf,
  EFFECT_LOOK,
  EFFECT_PLAY,
  EFFECTS,
  type Effect,
  type EffectKind,
  type EffectLook,
  type EffectSettings,
  effectFps,
  effectLook,
  effectSpeed,
  isEffect,
  SHAPE_MAX,
  sameSettings
} from "@grabient/engine/effect.ts";
import { createSignal, untrack } from "solid-js";
import { EFFECT_KEY } from "./effect-page.ts";

type Settings = Record<EffectKind, EffectSettings>;
/** The reader's choice as this browser keeps it. */
interface Kept {
  kind: EffectKind | null;
  settings: Settings;
}
const DEFAULT_SETTINGS: EffectSettings = { ...EFFECT_PLAY, look: EFFECT_LOOK };
/** Each effect's settings, made by `of`. */
const eachKind = (of: (kind: EffectKind) => EffectSettings): Settings =>
  Object.fromEntries(EFFECTS.map(kind => [kind, of(kind)])) as Settings;
const DEFAULT_KEPT: Kept = {
  kind: "glass",
  settings: eachKind(() => DEFAULT_SETTINGS)
};

/** An effect's settings as stored or set: each part in its bounds, its steps those it takes. Stored browser data is
    untrusted. */
const sane = (kind: EffectKind, v: Partial<EffectSettings> | null | undefined): EffectSettings => ({
  speed: effectSpeed(v?.speed ?? 1),
  fps: effectFps(v?.fps),
  look: effectLook(v?.look, kind)
});

function readKept(): Kept {
  try {
    const k = JSON.parse(localStorage.getItem(EFFECT_KEY) ?? "null") as Partial<Kept> | null;
    if (!k) return DEFAULT_KEPT;
    return {
      kind: k.kind === null ? null : isEffect(k.kind) ? k.kind : "glass",
      settings: eachKind(kind => sane(kind, k.settings?.[kind]))
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
  /** the reader changes an effect's look: its shape, the blob's frost and ground, the sandstone's steps */
  look: (kind: EffectKind, part: Partial<EffectLook>) => void;
  /** another shape for an effect, other than the one shown */
  shuffle: (kind: EffectKind) => void;
  /** an address landed: the effect it names, or, where it names no style, the reader's own choice */
  arrive: (effect: Effect | null, styled: boolean) => void;
  /** whether the effect differs from the one the page opened with, which Reset gives back */
  changed: () => boolean;
  reset: () => void;
}

/** The effects as an address opened the page, for the palette `seed` names; `own` is a figure's palette, which plays
    none and keeps nothing. `chosen` hears what the reader chooses, an effect or the gradient, which the tab keeps
    for the lists. */
export function createEffects(
  start: Effect | null,
  styled: boolean,
  seed: () => string,
  own = false,
  chosen?: (effect: Effect | null) => void
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
  /* the mark on <html> that shows or hides what stands for the reader's choice where an address names no style, the
     first screen's glass and the header's button until the editor holds it (Editor.module.css, Corner.module.css),
     never a glass the editor draws, so a tile's preview of the glass shows over any effect chosen. It is set as a
     document loads (effectScript) and here: an editor a navigation opens marks its own effect at once, since the mark
     is still the page's it came from */
  const mark = () => {
    if (own || typeof document === "undefined") return;
    const root = document.documentElement;
    if (now.kind === "glass") delete root.dataset.glass;
    else root.dataset.glass = "off";
  };
  mark();
  /** a new state: the signals, the mark on <html> (the server's glass still answers to it, effectScript) and, where
      the reader made it, this browser's copy follow; a figure's palette plays none and touches neither */
  const commit = (next: Kept, keep = true, told = keep) => {
    now = settled(next);
    setKind(now.kind);
    setSettings(now.settings);
    if (own) return;
    mark();
    if (!keep) return;
    try {
      localStorage.setItem(EFFECT_KEY, JSON.stringify(now));
    } catch {}
    if (told) chosen?.(effectOf(now));
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
      commit(withSettings(k, sane(k, { ...now.settings[k], ...part })));
    },
    look(k, part) {
      const s = now.settings[k];
      commit(withSettings(k, sane(k, { ...s, look: { ...s.look, ...part } })));
    },
    shuffle(k) {
      const s = now.settings[k];
      const was = s.look.shape ?? 0;
      let next = was;
      /* 0 is the glass's, the silk's, the rosette's and the papercut's design, which a shuffle leaves for another */
      while (next === was || (k !== "blob" && next === 0))
        next = Math.floor(Math.random() * (SHAPE_MAX + 1));
      commit(withSettings(k, { ...s, look: { ...s.look, shape: next } }));
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
    /* the page as it opened, which is no choice of the reader's for the lists */
    reset() {
      commit(
        opened
          ? { ...withSettings(opened.kind, settingsOf(opened)), kind: opened.kind }
          : { ...now, kind: null },
        true,
        false
      );
    }
  };
}
