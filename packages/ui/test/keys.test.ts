import { describe, expect, test } from "vitest";
import { KEYMAP } from "../src/keymap.ts";
import {
  type Binding,
  chordOf,
  composing,
  conflictOf,
  keyProblem,
  type Platform,
  pick,
  score,
  showKey,
  typing
} from "../src/keys.ts";

interface Mods {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  altGr?: boolean;
  composing?: boolean;
  keyCode?: number;
}
const ev = (key: string, code: string, m: Mods = {}) =>
  ({
    key,
    code,
    ctrlKey: !!m.ctrl,
    shiftKey: !!m.shift,
    altKey: !!m.alt,
    metaKey: !!m.meta,
    isComposing: !!m.composing,
    keyCode: m.keyCode ?? 0,
    repeat: false,
    getModifierState: (s: string) => s === "AltGraph" && !!m.altGr
  }) as unknown as KeyboardEvent;
const ALTGR: Mods = { ctrl: true, alt: true, altGr: true };
const mod = (p: Platform): Mods => (p === "mac" ? { meta: true } : { ctrl: true });

/* Every binding of the key map pressed the way a reader on each layout presses it, and the binding that must fire
   (null: nothing). The cases R07 ran against grabient4's matcher and TanStack Hotkeys. */
type Case = [layout: string, p: Platform, want: string | null, e: KeyboardEvent];
const cases: Case[] = [];
const add = (layout: string, p: Platform, rows: [string | null, KeyboardEvent][]) => {
  for (const [want, e] of rows) cases.push([layout, p, want, e]);
};
for (const p of ["windows", "mac"] as const)
  add(`US ${p}`, p, [
    ["T", ev("t", "KeyT")],
    ["?", ev("?", "Slash", { shift: true })],
    ["[", ev("[", "BracketLeft")],
    ["]", ev("]", "BracketRight")],
    ["\\", ev("\\", "Backslash")],
    [",", ev(",", "Comma")],
    [".", ev(".", "Period")],
    ["Mod+Z", ev("z", "KeyZ", mod(p))],
    ["Mod+Shift+Z", ev(p === "mac" ? "z" : "Z", "KeyZ", { ...mod(p), shift: true })],
    ["Mod+A", ev("a", "KeyA", mod(p))],
    ["Backspace", ev("Backspace", "Backspace")],
    ["Escape", ev("Escape", "Escape")],
    [null, ev("T", "KeyT", { shift: true })],
    [null, ev("t", "KeyT", { ctrl: true })],
    [null, ev("/", "Slash")]
  ]);
add("US mac", "mac", [
  [null, ev("Dead", "KeyE", { alt: true })],
  [null, ev("∫", "KeyB", { alt: true })]
]);
add("UK windows", "windows", [
  ["\\", ev("\\", "IntlBackslash")],
  ["?", ev("?", "Slash", { shift: true })]
]);
add("German windows", "windows", [
  ["Mod+Z", ev("z", "KeyY", { ctrl: true })],
  ["Mod+Shift+Z", ev("Z", "KeyY", { ctrl: true, shift: true })],
  ["?", ev("?", "Minus", { shift: true })],
  ["[", ev("[", "Digit8", ALTGR)],
  ["]", ev("]", "Digit9", ALTGR)],
  ["\\", ev("\\", "Minus", ALTGR)],
  [",", ev(",", "Comma")],
  [".", ev(".", "Period")],
  [null, ev("y", "KeyZ", { ctrl: true })],
  [null, ev("ü", "BracketLeft")],
  [null, ev("+", "BracketRight")],
  [null, ev("#", "Backslash")]
]);
add("German mac", "mac", [
  ["[", ev("[", "Digit5", { alt: true })],
  ["]", ev("]", "Digit6", { alt: true })],
  ["\\", ev("\\", "Digit7", { alt: true, shift: true })],
  ["?", ev("?", "Minus", { shift: true })],
  ["Mod+Z", ev("z", "KeyY", { meta: true })]
]);
add("French AZERTY windows", "windows", [
  ["Mod+A", ev("a", "KeyQ", { ctrl: true })],
  ["Mod+Z", ev("z", "KeyW", { ctrl: true })],
  ["?", ev("?", "KeyM", { shift: true })],
  ["[", ev("[", "Digit5", ALTGR)],
  ["]", ev("]", "Minus", ALTGR)],
  ["\\", ev("\\", "Digit8", ALTGR)],
  [",", ev(",", "KeyM")],
  [".", ev(".", "Comma", { shift: true })],
  [null, ev("Dead", "BracketLeft")],
  [null, ev("$", "BracketRight")],
  [null, ev("*", "Backslash")],
  [null, ev(";", "Comma")],
  [null, ev(":", "Period")],
  [null, ev("!", "Slash")]
]);
add("French AZERTY mac", "mac", [
  ["[", ev("[", "Digit5", { alt: true, shift: true })],
  ["]", ev("]", "Minus", { alt: true, shift: true })],
  ["\\", ev("\\", "Period", { alt: true, shift: true })],
  [",", ev(",", "KeyM")],
  [".", ev(".", "Comma", { shift: true })],
  ["Mod+Z", ev("z", "KeyW", { meta: true })]
]);
add("Spanish windows", "windows", [
  ["[", ev("[", "BracketLeft", ALTGR)],
  ["]", ev("]", "BracketRight", ALTGR)],
  ["\\", ev("\\", "Backquote", ALTGR)],
  ["?", ev("?", "Minus", { shift: true })],
  [null, ev("Dead", "BracketLeft")],
  [null, ev("+", "BracketRight")],
  [null, ev("º", "Backquote")]
]);
add("Swiss German windows", "windows", [
  ["[", ev("[", "BracketLeft", ALTGR)],
  ["]", ev("]", "BracketRight", ALTGR)],
  ["\\", ev("\\", "IntlBackslash", ALTGR)],
  ["?", ev("?", "Minus", { shift: true })],
  [null, ev("ü", "BracketLeft")]
]);
add("Swedish windows", "windows", [
  ["[", ev("[", "Digit8", ALTGR)],
  ["]", ev("]", "Digit9", ALTGR)],
  ["\\", ev("\\", "Minus", ALTGR)],
  ["?", ev("?", "Minus", { shift: true })],
  [null, ev("å", "BracketLeft")]
]);
add("Italian windows", "windows", [
  ["[", ev("[", "BracketLeft", ALTGR)],
  ["]", ev("]", "BracketRight", ALTGR)],
  ["\\", ev("\\", "Backquote")],
  ["?", ev("?", "Minus", { shift: true })],
  [null, ev("è", "BracketLeft")]
]);
add("Polish programmer windows", "windows", [
  ["E", ev("e", "KeyE")],
  [null, ev("ę", "KeyE", ALTGR)],
  [null, ev("ą", "KeyA", ALTGR)]
]);
add("Czech windows", "windows", [
  ["[", ev("[", "KeyF", ALTGR)],
  ["]", ev("]", "KeyG", ALTGR)],
  ["\\", ev("\\", "KeyQ", ALTGR)],
  ["?", ev("?", "Comma", { shift: true })],
  ["Mod+Z", ev("z", "KeyY", { ctrl: true })],
  [null, ev("ú", "BracketLeft")]
]);
add("Brazilian ABNT2 windows", "windows", [
  ["[", ev("[", "BracketRight")],
  ["]", ev("]", "Backslash")],
  ["\\", ev("\\", "IntlBackslash")],
  ["?", ev("?", "IntlRo", { shift: true })],
  [null, ev("Dead", "BracketLeft")]
]);
add("Turkish Q windows", "windows", [
  ["I", ev("ı", "KeyI")],
  ["I", ev("i", "Quote")],
  ["?", ev("?", "Minus", { shift: true })],
  ["[", ev("[", "Digit8", ALTGR)],
  ["\\", ev("\\", "Minus", ALTGR)],
  [",", ev(",", "Backslash")],
  [".", ev(".", "Slash")]
]);
add("Dvorak windows", "windows", [
  ["T", ev("t", "KeyK")],
  ["E", ev("e", "KeyD")],
  ["Mod+Z", ev("z", "Slash", { ctrl: true })],
  ["[", ev("[", "Minus")],
  ["]", ev("]", "Equal")],
  ["?", ev("?", "BracketLeft", { shift: true })],
  [",", ev(",", "KeyW")],
  [".", ev(".", "KeyE")],
  [null, ev("y", "KeyT")],
  [null, ev("/", "BracketLeft")]
]);
for (const p of ["windows", "mac"] as const)
  add(`Russian ${p}`, p, [
    ["T", ev("е", "KeyT")],
    ["U", ev("г", "KeyU")],
    ["B", ev("и", "KeyB")],
    ["I", ev("ш", "KeyI")],
    ["E", ev("у", "KeyE")],
    ["Mod+A", ev("ф", "KeyA", mod(p))],
    ["Mod+Z", ev("я", "KeyZ", mod(p))],
    ["Mod+Shift+Z", ev("Я", "KeyZ", { ...mod(p), shift: true })],
    ["?", ev("?", "Digit7", { shift: true })],
    ["[", ev("х", "BracketLeft")],
    ["]", ev("ъ", "BracketRight")],
    ["\\", ev("\\", "Backslash")],
    [",", ev("б", "Comma")],
    [".", ev("ю", "Period")],
    [".", ev(".", "Slash")],
    [",", ev(",", "Slash", { shift: true })],
    [null, ev("Е", "KeyT", { shift: true })]
  ]);
add("Ukrainian enhanced windows", "windows", [
  ["\\", ev("ґ", "Backslash")],
  ["]", ev("ї", "BracketRight")],
  ["T", ev("е", "KeyT")],
  ["Mod+S", ev("і", "KeyS", { ctrl: true })]
]);
add("Greek windows", "windows", [
  ["T", ev("τ", "KeyT")],
  ["U", ev("θ", "KeyU")],
  ["B", ev("β", "KeyB")],
  ["Mod+Z", ev("ζ", "KeyZ", { ctrl: true })],
  ["?", ev("?", "Slash", { shift: true })]
]);
add("Hebrew windows", "windows", [
  ["T", ev("א", "KeyT")],
  ["E", ev("ק", "KeyE")],
  ["Mod+Z", ev("ז", "KeyZ", { ctrl: true })],
  ["?", ev("?", "Slash", { shift: true })],
  ["[", ev("[", "BracketRight")],
  ["]", ev("]", "BracketLeft")],
  [",", ev(",", "Quote")],
  [".", ev(".", "Slash")]
]);
add("Arabic windows", "windows", [
  ["T", ev("ف", "KeyT")],
  ["U", ev("ع", "KeyU")],
  ["B", ev("لا", "KeyB")],
  ["I", ev("ه", "KeyI")],
  ["E", ev("ث", "KeyE")],
  ["Mod+Z", ev("ئ", "KeyZ", { ctrl: true })],
  ["?", ev("؟", "Slash", { shift: true })],
  ["[", ev("ج", "BracketLeft")],
  ["]", ev("د", "BracketRight")],
  [",", ev("و", "Comma")],
  [".", ev("ز", "Period")]
]);
add("Persian windows", "windows", [
  ["T", ev("ف", "KeyT")],
  ["B", ev("ذ", "KeyB")],
  ["?", ev("؟", "Slash", { shift: true })],
  ["Mod+Z", ev("ظ", "KeyZ", { ctrl: true })]
]);
add("Thai Kedmanee windows", "windows", [
  ["T", ev("ะ", "KeyT")],
  ["U", ev("ี", "KeyU")],
  ["B", ev("ิ", "KeyB")],
  ["I", ev("ร", "KeyI")],
  ["E", ev("ำ", "KeyE")],
  ["Mod+Z", ev("ผ", "KeyZ", { ctrl: true })],
  ["[", ev("บ", "BracketLeft")],
  ["]", ev("ล", "BracketRight")],
  ["\\", ev("ฃ", "Backslash")],
  [",", ev("ม", "Comma")],
  [".", ev("ใ", "Period")],
  ["?", ev("ฦ", "Slash", { shift: true })]
]);
add("Hindi Inscript windows", "windows", [
  ["T", ev("ज", "KeyT")],
  ["E", ev("ा", "KeyE")],
  ["Mod+Z", ev("ॆ", "KeyZ", { ctrl: true })],
  ["]", ev("़", "BracketRight")],
  ["[", ev("ड", "BracketLeft")]
]);
add("Korean 2-set mac, jamo outside a field", "mac", [
  ["T", ev("ㅅ", "KeyT")],
  ["E", ev("ㄷ", "KeyE")],
  ["Mod+Z", ev("ㅋ", "KeyZ", { meta: true })],
  ["?", ev("?", "Slash", { shift: true })]
]);
add("Korean input method composing", "windows", [
  [null, ev("Process", "KeyT", { keyCode: 229 })],
  [null, ev("t", "KeyT", { composing: true })]
]);
add("Japanese JIS windows", "windows", [
  ["[", ev("[", "BracketRight")],
  ["]", ev("]", "Backslash")],
  ["\\", ev("\\", "IntlRo")],
  ["?", ev("?", "Slash", { shift: true })],
  [null, ev("@", "BracketLeft")]
]);
add("Japanese JIS mac", "mac", [
  ["\\", ev("\\", "IntlYen", { alt: true })],
  [null, ev("¥", "IntlYen")],
  ["?", ev("？", "Slash", { shift: true })]
]);

const bindings: Binding[] = KEYMAP.map(row => ({
  id: row.id,
  key: row.keys,
  label: row.label,
  run: () => {}
}));
/* what fires: ? first, as installKeys asks, then the best of the rest */
function fired(e: KeyboardEvent, p: Platform): string | null {
  if (score(e, "?", p)) return "?";
  const hit = pick(
    e,
    bindings.filter(b => b.id !== "help"),
    p
  );
  return hit ? (hit.binding.key as readonly string[])[hit.index] : null;
}

describe("keys on every layout", () => {
  test("221 presses on 30 layouts fire what the reader means", () => {
    expect(cases).toHaveLength(221);
    const wrong = cases
      .filter(([, p, want, e]) => fired(e, p) !== want)
      .map(
        ([layout, p, want, e]) =>
          `${layout}: ${JSON.stringify(e.key)} ${e.code} wants ${want}, got ${fired(e, p)}`
      );
    expect(wrong).toEqual([]);
  });

  test("the four presses the accessibility check makes", () => {
    expect(fired(ev("е", "KeyT"), "windows")).toBe("T");
    expect(fired(ev("؟", "Slash", { shift: true }), "windows")).toBe("?");
    expect(fired(ev("я", "KeyZ", { ctrl: true }), "windows")).toBe("Mod+Z");
    expect(fired(ev("и", "KeyB"), "windows")).toBe("B");
  });

  test("an input method's keys are its own", () => {
    expect(composing(ev("Enter", "Enter", { keyCode: 229 }))).toBe(true);
    expect(score(ev("Enter", "Enter", { composing: true }), "Enter", "windows")).toBe(0);
  });
});

/* grabient4's labels for every key of the map on each platform, in English */
const LABELS: Record<Platform, Record<string, string>> = {
  mac: {
    T: "T",
    "?": "?",
    "\\": "\\",
    "Mod+A": "⌘ A",
    Backspace: "⌫",
    Delete: "⌦",
    Escape: "Esc",
    "[": "[",
    "Mod+Z": "⌘ Z",
    "Mod+Shift+Z": "⌘ ⇧ Z",
    "Mod+S": "⌘ S",
    "Mod+Shift+T": "⌘ ⇧ T",
    "Alt+K": "⌥ K",
    "Control+K": "⌃ K",
    "Shift+K": "⇧ K",
    ArrowUp: "↑",
    ArrowLeft: "←",
    Space: "␣",
    Tab: "⇥",
    Enter: "↵",
    F5: "F5",
    "Mod+Tab": "⌘ ⇥"
  },
  windows: {
    T: "T",
    "?": "?",
    "\\": "\\",
    "Mod+A": "Ctrl+A",
    Backspace: "Backspace",
    Delete: "Delete",
    Escape: "Esc",
    "[": "[",
    "Mod+Z": "Ctrl+Z",
    "Mod+Shift+Z": "Ctrl+Shift+Z",
    "Mod+S": "Ctrl+S",
    "Mod+Shift+T": "Ctrl+Shift+T",
    "Alt+K": "Alt+K",
    "Control+K": "Ctrl+K",
    "Shift+K": "Shift+K",
    ArrowUp: "↑",
    ArrowLeft: "←",
    Space: "Space",
    Tab: "Tab",
    Enter: "Enter",
    F5: "F5",
    "Mod+Tab": "Ctrl+Tab"
  },
  linux: {}
};
LABELS.linux = LABELS.windows;

describe("key labels", () => {
  for (const p of ["mac", "windows", "linux"] as const)
    test(`as a reader on ${p} sees them`, () => {
      for (const [chord, label] of Object.entries(LABELS[p]))
        expect(showKey(chord, p), chord).toBe(label);
    });
});

describe("changing a key", () => {
  test("the browser's own keys and Shift with punctuation are refused", () => {
    for (const chord of [
      "Mod+A",
      "Control+A",
      "Ctrl+A",
      "Meta+A",
      "Cmd+A",
      "Mod+Shift+Z",
      "Shift+Mod+Z"
    ])
      expect(keyProblem(chord, "windows"), chord).toBeNull();
    for (const chord of ["?", "Shift+/"])
      expect(keyProblem(chord, "windows")).toBe(
        "Shift with punctuation differs between keyboards."
      );
    for (const chord of ["Mod+W", "Ctrl+Q", "Escape", "Space", "F5"])
      expect(keyProblem(chord, "windows"), chord).toBe("The browser uses that key.");
  });

  test("a chord another row already has is a conflict, every route against every page", () => {
    expect(conflictOf("random", "Ctrl+A", KEYMAP, "windows")?.id).toBe("selectAll");
    expect(conflictOf("random", "Ctrl+A", KEYMAP, "mac")).toBeNull();
    expect(conflictOf("random", "T", KEYMAP, "windows")?.id).toBe("theme");
    expect(conflictOf("theme", "E", KEYMAP, "windows")?.id).toBe("reverse");
    expect(conflictOf("random", "Q", KEYMAP, "windows")).toBeNull();
  });

  test("a recorded chord is written as it is matched", () => {
    expect(chordOf(ev("я", "KeyZ", { ctrl: true }), "windows")).toBe("Mod+Z");
    expect(chordOf(ev("Z", "KeyZ", { ctrl: true, shift: true }), "windows")).toBe("Mod+Shift+Z");
    expect(chordOf(ev("z", "KeyZ", { meta: true, shift: true }), "mac")).toBe("Mod+Shift+Z");
    expect(chordOf(ev("T", "KeyT", { shift: true }), "windows")).toBe("Shift+T");
    expect(chordOf(ev("?", "Slash", { shift: true }), "windows")).toBe("?");
    expect(chordOf(ev("[", "Digit8", ALTGR), "windows")).toBe("[");
    expect(chordOf(ev("[", "Digit5", { alt: true }), "mac")).toBe("[");
    expect(chordOf(ev(" ", "Space"), "windows")).toBe("Space");
    expect(chordOf(ev("Shift", "ShiftLeft", { shift: true }), "windows")).toBeNull();
    expect(chordOf(ev("Dead", "BracketLeft"), "windows")).toBeNull();
  });
});

describe("typing", () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}) =>
    ({
      tagName,
      isContentEditable: false,
      closest: () => null,
      ...extra
    }) as unknown as EventTarget;
  test("a field keeps its keys, a range input does not", () => {
    expect(typing(el("INPUT", { type: "text" }))).toBe(true);
    expect(typing(el("INPUT", { type: "range" }))).toBe(false);
    expect(typing(el("TEXTAREA"))).toBe(true);
    expect(typing(el("SELECT"))).toBe(true);
    expect(typing(el("DIV", { isContentEditable: true }))).toBe(true);
    expect(typing(el("BUTTON"))).toBe(false);
  });
  test("a block that keeps its own keys keeps them", () => {
    expect(
      typing(el("SPAN", { closest: (s: string) => (s === '[data-keys="own"]' ? {} : null) }))
    ).toBe(true);
  });
});
