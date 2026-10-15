import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";
import { msg, t } from "./i18n.ts";
import type { KeyMapRow } from "./keymap.ts";

/* The site's keys. A binding is a portable chord ("T", "Mod+A", "Escape", "["): Mod is ⌘ on a Mac and Ctrl elsewhere.
   A press is matched the way a reader on any keyboard layout means it: a character the layout types is that
   character, so punctuation typed with Shift, AltGr or Option is the punctuation and that modifier is no command, and
   on a layout of another script (Russian, Arabic, Thai, Korean) a key matches the letter a US keyboard prints there,
   so Ctrl+Я is Ctrl+Z. The character beats the position: when two bindings answer, the one the layout typed wins.
   Typing is never intercepted, nor a key an input method is composing.
   A binding with an id reads its keys through the changes the Shortcuts page keeps in this browser (`grabient-keys`),
   a signal, so the ? list, the pages and the dispatcher see a change at once. They are written only in the browser. */
export type Platform = "mac" | "windows" | "linux";

export interface Binding {
  /** its row of the key map, so a key changed on the Shortcuts page applies; without one the keys are fixed */
  id?: string;
  /** one chord, or several that mean the same thing (a pair runs with the index of the one pressed) */
  key: string | readonly string[];
  /** what the ? list says: a message, which the list translates */
  label: string;
  /** where it works, for the ? list's groups */
  scope?: string;
  run: (index: number) => void;
  /** false leaves the key to the page and out of the list */
  when?: () => boolean;
}

/** A row of the ? list: each key as this platform shows it, and what it does. */
export interface KeyRow {
  keys: readonly string[];
  label: string;
  scope?: string;
}

/** mac, windows or linux; windows on the server, so a page draws the keys the server drew until it has settled. */
export function platform(): Platform {
  if (isServer) return "windows";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const name = nav.userAgentData?.platform || nav.platform || nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(name)
    ? "mac"
    : /linux|android|cros/i.test(name)
      ? "linux"
      : "windows";
}

/** Whether a key belongs to what has focus: a field being typed in, or an element that keeps its keys while
    focused (`data-keys="own"`), such as a block of code, whose select all is its own text. A number field at rest is
    read only, and passes its keys on. */
export function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return (
    el.isContentEditable ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    (el.tagName === "INPUT" &&
      (el as HTMLInputElement).type !== "range" &&
      !(el as HTMLInputElement).readOnly) ||
    !!el.closest('[data-keys="own"]')
  );
}

/** Whether a key is a menu's, a sheet's or a list's that stands over the page (`data-keys="menu"`): while it has the
    focus, a key pressed without Ctrl, ⌘ or Alt is its own or nothing, and a chord (an undo) is still the page's. */
export const menuKey = (e: KeyboardEvent): boolean =>
  !e.ctrlKey &&
  !e.metaKey &&
  !e.altKey &&
  !!(e.target as HTMLElement | null)?.closest?.('[data-keys="menu"]');

/** Whether a key belongs to an input method that is still composing (Japanese, Chinese, Korean). Safari sends the Enter
    that takes a candidate after compositionend, with keyCode 229. */
export const composing = (e: KeyboardEvent): boolean => e.isComposing || e.keyCode === 229;

/* the character a US keyboard prints on each key */
const US: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  IntlBackslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/"
};
const usKey = (code: string): string | null =>
  /^Key[A-Z]$/.test(code)
    ? code.slice(3)
    : /^Digit\d$/.test(code)
      ? code.slice(5)
      : (US[code] ?? null);
/* the question mark as each layout types it: Arabic and Persian ؟, a full-width input ？ */
const QUESTION = new Set(["?", "؟", "？"]);
/* a key of a layout whose letters are not Latin: one to three letters, marks or digits of another script (Arabic's
   لا is one key) */
const foreign = (key: string) =>
  /^[\p{L}\p{M}\p{N}]{1,3}$/u.test(key) && !/[\p{Script=Latin}A-Za-z0-9]/u.test(key);
/* the same key whatever its case: Turkish ı is I */
const same = (a: string, b: string) =>
  a === b || (a.length === 1 && b.length === 1 && a.toUpperCase() === b.toUpperCase());
const named = (e: KeyboardEvent) => (e.key === " " ? "Space" : e.key === "Esc" ? "Escape" : e.key);

const MODIFIER: Record<string, string> = {
  Ctrl: "Control",
  Cmd: "Meta",
  Command: "Meta",
  Option: "Alt"
};
interface Chord {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}
function parse(chord: string, mac: boolean): Chord {
  const parts = chord === "+" ? ["+"] : chord.split("+");
  const key = parts.pop() || "+";
  const mods = new Set(
    parts.map(m => (m === "Mod" ? (mac ? "Meta" : "Control") : (MODIFIER[m] ?? m)))
  );
  return {
    key,
    ctrl: mods.has("Control"),
    meta: mods.has("Meta"),
    alt: mods.has("Alt"),
    shift: mods.has("Shift")
  };
}

/** How well a press answers a chord: 2 for the character the layout typed, 1 for the key where a US keyboard prints
    it on a layout of another script, 0 for no. */
export function score(e: KeyboardEvent, chord: string, p: Platform = platform()): 0 | 1 | 2 {
  if (composing(e) || e.key === "Process") return 0;
  const mac = p === "mac";
  const altGr = !mac && !!e.getModifierState?.("AltGraph");
  const ctrl = e.ctrlKey && !altGr;
  const alt = e.altKey && !altGr;
  if (chord === "?") {
    if (QUESTION.has(e.key) && !ctrl && !e.metaKey && !alt) return 2;
    /* Thai types ฦ on the key of Shift and /, where the question mark stands on a US keyboard */
    return e.code === "Slash" && e.shiftKey && !ctrl && !e.metaKey && !alt && foreign(e.key)
      ? 1
      : 0;
  }
  const b = parse(chord, mac);
  const key = named(e);
  const mods = () =>
    ctrl === b.ctrl && e.metaKey === b.meta && alt === b.alt && e.shiftKey === b.shift;
  if (same(key, b.key)) {
    /* punctuation is the character it types: the Shift, AltGr or Option that typed it is no command */
    const typed = b.key.length === 1 && !/^[\p{L}\p{N}]$/u.test(b.key);
    if (typed && !b.ctrl && !b.meta && !b.alt && !ctrl && !e.metaKey && (mac || !alt)) return 2;
    return mods() ? 2 : 0;
  }
  const us = foreign(key) || (key === "Dead" && (ctrl || e.metaKey)) ? usKey(e.code) : null;
  return us && same(us, b.key) && mods() ? 1 : 0;
}

/** Whether a press is the chord. */
export const matches = (e: KeyboardEvent, chord: string): boolean => score(e, chord) > 0;

/* The keys changed in this browser, by binding id. */
const STORE = "grabient-keys";
const [overrides, setOverrides] = createSignal<Readonly<Record<string, readonly string[]>>>({});
let loaded = false;
/* stored data is untrusted: only lists of short strings are keys */
function sane(value: unknown): Record<string, readonly string[]> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, keys]) =>
        Array.isArray(keys) &&
        keys.length > 0 &&
        keys.every(k => typeof k === "string" && k.length <= 40)
    )
  );
}
function persist(next: Readonly<Record<string, readonly string[]>>) {
  try {
    if (Object.keys(next).length) localStorage.setItem(STORE, JSON.stringify(next));
    else localStorage.removeItem(STORE);
  } catch {
    /* a browser that keeps no site data: the change lasts as long as the page */
  }
}

/** Reads the keys changed in this browser, once the page is live. installKeys calls it; a page that shows keys before
    any are installed calls it when it has settled. */
export function loadKeyOverrides(): void {
  if (loaded || isServer) return;
  loaded = true;
  /* the read itself throws where site data is blocked */
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) setOverrides(sane(JSON.parse(raw)));
  } catch {
    /* the defaults stand */
  }
}
/** The keys a row of the key map answers to now: the reader's or its own. */
export const rowKeys = (row: Pick<KeyMapRow, "id" | "keys">): readonly string[] =>
  overrides()[row.id] ?? row.keys;
export const keyChanged = (id: string): boolean => id in overrides();
export const anyKeyChanged = (): boolean => Object.keys(overrides()).length > 0;
/** Sets the keys of a binding, or restores its own with null. */
export function setKeyFor(id: string, keys: readonly string[] | null): void {
  const next = { ...overrides() };
  if (keys?.length) next[id] = keys;
  else delete next[id];
  setOverrides(next);
  persist(next);
}
export function resetKeys(): void {
  setOverrides({});
  persist({});
}
const keysOf = (b: Binding): readonly string[] =>
  (b.id ? overrides()[b.id] : undefined) ?? (typeof b.key === "string" ? [b.key] : b.key);

/* A key's own name as the reader's keyboard prints it (Strg on a German one, Maj on a French one): messages in the
   key context, so Delete the key is never Delete the button. */
const WORDS: Record<string, string> = {
  Ctrl: msg("Ctrl", "key"),
  Shift: msg("Shift", "key"),
  Alt: msg("Alt", "key"),
  Esc: msg("Esc", "key"),
  Tab: msg("Tab", "key"),
  Space: msg("Space", "key"),
  Backspace: msg("Backspace", "key"),
  Delete: msg("Delete", "key"),
  Enter: msg("Enter", "key")
};
const ARROWS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→"
};
const MAC: Record<string, string> = {
  Mod: "⌘",
  Meta: "⌘",
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Backspace: "⌫",
  Delete: "⌦",
  Enter: "↵",
  Tab: "⇥",
  Space: "␣"
};
const OTHER: Record<string, string> = { Mod: "Ctrl", Control: "Ctrl", Meta: "Win" };

/** A chord as a reader on the platform should see it: ⌘ ⇧ Z on a Mac and Ctrl+Shift+Z elsewhere, Esc, arrows as
    arrows, a character as itself, and each named key in the reader's language. */
export function showKey(chord: string, p: Platform = platform()): string {
  if (chord.length === 1) return chord;
  const mac = p === "mac";
  const parts = chord.split("+").map(part => {
    const name = part === "Escape" ? "Esc" : (MODIFIER[part] ?? part);
    const shown = ARROWS[name] ?? (mac ? MAC[name] : OTHER[name]) ?? name;
    return WORDS[shown] ? t(WORDS[shown], { $context: "key" }) : shown;
  });
  return parts.join(mac ? " " : "+");
}
/** Several chords that mean one thing: Ctrl+Z / Ctrl+Shift+Z. */
export const showKeys = (chords: readonly string[], p: Platform = platform()): string =>
  chords.map(c => showKey(c, p)).join(" / ");

/* the same chord written two ways compares equal: Ctrl+A and Mod+A off a Mac */
const ORDER = ["Control", "Alt", "Shift", "Meta"];
function canon(chord: string, p: Platform): string {
  if (chord === "?") return "Shift+/";
  const b = parse(chord, p === "mac");
  const mods = ORDER.filter((_, i) => [b.ctrl, b.alt, b.shift, b.meta][i]);
  return [...mods, b.key.length === 1 ? b.key.toUpperCase() : b.key].join("+");
}
/* the browser's own keys, which no binding takes from it */
const BROWSER = [
  "Mod+W",
  "Mod+Q",
  "Mod+T",
  "Mod+N",
  "Mod+R",
  "Mod+L",
  "Mod+H",
  "Mod+M",
  "Mod+P",
  "Mod+Shift+T",
  "Mod+Shift+N",
  "Mod+Tab",
  "F5",
  "F11",
  "F12",
  "Tab",
  "Space",
  "Enter",
  "Escape"
];

/** The row that already answers to a chord where the binding `id` works, or null. Every route shares its keys with
    every page. */
export function conflictOf<R extends Pick<KeyMapRow, "id" | "keys" | "scope">>(
  id: string,
  chord: string,
  rows: readonly R[],
  p: Platform = platform()
): R | null {
  const scope = rows.find(r => r.id === id)?.scope;
  const overlaps = (s: string) => s === scope || s === "Every route" || scope === "Every route";
  const c = canon(chord, p);
  return (
    rows.find(r => r.id !== id && overlaps(r.scope) && rowKeys(r).some(k => canon(k, p) === c)) ??
    null
  );
}

/** Why a recorded chord cannot be a binding, or null when it can. */
export function keyProblem(chord: string, p: Platform = platform()): string | null {
  const c = canon(chord, p);
  if (BROWSER.some(k => canon(k, p) === c)) return t("The browser uses that key.");
  const key = c.split("+").pop() ?? "";
  if (c.startsWith("Shift+") && key.length === 1 && !/[A-Z0-9]/.test(key))
    return t("Shift with punctuation differs between keyboards.");
  return null;
}

/* a modifier on its own, or a key that types nothing yet: the chord is still coming */
const PENDING = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "AltGraph",
  "CapsLock",
  "Fn",
  "OS",
  "Dead",
  "Unidentified"
]);
/** The chord a press makes, as a binding writes it, or null for a modifier on its own. A letter of another script is
    the letter a US keyboard prints there, as it is matched, so Ctrl+Я on a Russian keyboard is Mod+Z; punctuation is
    the character typed, without the Shift, AltGr or Option that typed it. */
export function chordOf(e: KeyboardEvent, p: Platform = platform()): string | null {
  const name = named(e);
  if (PENDING.has(name)) return null;
  const mac = p === "mac";
  const altGr = !mac && !!e.getModifierState?.("AltGraph");
  const key = foreign(name)
    ? (usKey(e.code) ?? name)
    : name.length === 1
      ? name.toUpperCase()
      : name;
  const typed = key.length === 1 && !/^[\p{L}\p{N}]$/u.test(key);
  const parts: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey && !altGr) parts.push("Mod");
  if (mac && e.ctrlKey) parts.push("Control");
  if (e.altKey && !altGr && !(typed && mac)) parts.push("Alt");
  if (e.shiftKey && !typed) parts.push("Shift");
  return [...parts, key].join("+");
}

/** Records the next chord pressed and hands it to `done`, or null when Escape or a press elsewhere cancels. Returns the
    function that cancels it. The press is the recorder's alone: no page key answers it. */
export function recordKey(done: (chord: string | null) => void): () => void {
  let over = false;
  const finish = (chord: string | null) => {
    if (over) return;
    over = true;
    removeEventListener("keydown", onKey, true);
    removeEventListener("pointerdown", cancel, true);
    done(chord);
  };
  const cancel = () => finish(null);
  const onKey = (e: KeyboardEvent) => {
    if (composing(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return cancel();
    const chord = chordOf(e);
    if (chord) finish(chord);
  };
  addEventListener("keydown", onKey, true);
  addEventListener("pointerdown", cancel, true);
  return cancel;
}

/* The press a binding runs under: an undo groups a held key's repeats into one step. */
let pressing: { code: string; repeat: boolean } | null = null;
/** The key press a binding is running under now, or null outside one. */
export const keyPress = (): { code: string; repeat: boolean } | null => pressing;

const HELP: KeyRow = { keys: ["?"], label: msg("Show shortcuts"), scope: "Every route" };

/** The binding a press runs, and the index of its chord that answered: among those that apply, the best score wins,
    so a character the layout typed beats a key found by its position. */
export function pick(
  e: KeyboardEvent,
  bindings: readonly Binding[],
  p: Platform = platform()
): { binding: Binding; index: number } | null {
  let best: { binding: Binding; index: number } | null = null;
  let top = 0;
  for (const binding of bindings) {
    const keys = keysOf(binding);
    for (let index = 0; index < keys.length; index++) {
      const s = score(e, keys[index], p);
      if (s > top) [best, top] = [{ binding, index }, s];
    }
  }
  return best;
}

/** Answers `bindings()` on the window until the returned function is called. ? hands `help` the rows to list: the
    bindings that apply now, then itself. */
export function installKeys(
  bindings: () => readonly Binding[],
  help?: (rows: readonly KeyRow[]) => void
): () => void {
  if (isServer) return () => {};
  loadKeyOverrides();
  const onKey = (e: KeyboardEvent) => {
    if (typing(e.target) || composing(e) || menuKey(e)) return;
    const p = platform();
    const active = bindings().filter(b => b.when?.() ?? true);
    if (score(e, "?", p)) {
      if (!help) return;
      e.preventDefault();
      const rows = active.map(b => ({
        keys: keysOf(b).map(k => showKey(k, p)),
        label: b.label,
        scope: b.scope
      }));
      help([...rows, HELP]);
      return;
    }
    const hit = pick(e, active, p);
    if (!hit) return;
    e.preventDefault();
    pressing = { code: e.code || e.key, repeat: e.repeat };
    try {
      hit.binding.run(hit.index);
    } finally {
      pressing = null;
    }
  };
  addEventListener("keydown", onKey);
  return () => removeEventListener("keydown", onKey);
}

/** The bindings every route shares: the theme and the page's address. */
export const sharedKeys = (run: { theme: () => void; copyUrl: () => void }): Binding[] => [
  { id: "theme", key: "T", label: msg("Theme"), scope: "Every route", run: run.theme },
  { id: "copyUrl", key: "U", label: msg("Copy URL"), scope: "Every route", run: run.copyUrl }
];
