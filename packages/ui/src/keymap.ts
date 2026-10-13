import { msg } from "./i18n.ts";

/* Every key the site answers to, where it works and what it does. The ? list, the Shortcuts page and the pages that
   bind keys all read this table. A label is a message keyed by its English, so changing one drops its translations. */
export type KeyScope = "Every route" | "Editor";

export interface KeyMapRow {
  /** a row with an id can be changed on the Shortcuts page */
  id: string;
  /** Mod is ⌘ on a Mac and Ctrl elsewhere; two keys are one binding, a pair or an alternate */
  keys: readonly string[];
  label: string;
  scope: KeyScope;
  /** the keys a reader relies on to get out, never changed */
  fixed?: boolean;
  /** listed for an admin alone */
  admin?: boolean;
}

export const KEYMAP: readonly KeyMapRow[] = [
  { id: "theme", keys: ["T"], label: msg("Theme"), scope: "Every route" },
  { id: "copyUrl", keys: ["U"], label: msg("Copy URL"), scope: "Every route" },
  { id: "help", keys: ["?"], label: msg("Show shortcuts"), scope: "Every route", fixed: true },
  { id: "random", keys: ["B"], label: msg("Random palette"), scope: "Editor" },
  { id: "invert", keys: ["I"], label: msg("Invert"), scope: "Editor" },
  { id: "reverse", keys: ["E"], label: msg("Reverse"), scope: "Editor" },
  { id: "panel", keys: ["\\"], label: msg("Show or hide panel"), scope: "Editor" },
  { id: "selectAll", keys: ["Mod+A"], label: msg("Hold all keyframes"), scope: "Editor" },
  {
    id: "remove",
    keys: ["Backspace", "Delete"],
    label: msg("Remove held keyframes"),
    scope: "Editor"
  },
  {
    id: "letGo",
    keys: ["Escape"],
    label: msg("Let go of keyframes"),
    scope: "Editor",
    fixed: true
  },
  { id: "stops", keys: ["[", "]"], label: msg("Fewer or more steps"), scope: "Editor" },
  { id: "rotate", keys: [",", "."], label: msg("Rotate 15°"), scope: "Editor" },
  { id: "undo", keys: ["Mod+Z", "Mod+Shift+Z"], label: msg("Undo or redo"), scope: "Every route" },
  { id: "save", keys: ["Mod+S"], label: msg("Save"), scope: "Editor", admin: true }
];

/** A row of the map by its id. */
export const keyRow = (id: string): KeyMapRow | undefined => KEYMAP.find(k => k.id === id);
