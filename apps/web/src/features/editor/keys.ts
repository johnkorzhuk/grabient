import { keyRow } from "@grabient/ui/keymap.ts";
import { type Binding, rowKeys, showKey } from "@grabient/ui/keys.ts";
import { copyAddress } from "../../app/keys.ts";
import type { PaletteEditor } from "./editor.ts";
import type { PaletteSave } from "./save.ts";

/* The editor's keys, beside the ones every page has. Each names its row of the key map, so a key the reader changed on
   the Shortcuts page applies here and the ? list shows it. Typing is never taken: that is the dispatcher's rule. */

const row = (id: string) => {
  const found = keyRow(id);
  if (!found) throw new Error(`No key map row ${id}`);
  return found;
};

/** A key of the map as this reader's keyboard shows it (⌘ Z on a Mac, Ctrl+Z elsewhere), changed or not: for a tip. */
export const keyOf = (id: string, i = 0): string => {
  const key = rowKeys(row(id))[i];
  return key ? showKey(key) : "";
};

/** The editor's bindings. `live` says whether they apply at all: while the selection has the stage there is no
    palette to edit, so none does, the undo included. */
export function editorBindings(
  e: PaletteEditor,
  o: { live: () => boolean; togglePanel: () => void; save: PaletteSave; settle: () => void }
): Binding[] {
  const bind = (id: string, run: Binding["run"], when?: () => boolean): Binding => {
    const r = row(id);
    return {
      id,
      key: r.keys,
      label: r.label,
      scope: r.scope,
      run,
      when: () => o.live() && (when?.() ?? true)
    };
  };
  const held = () => e.held().length > 0;
  return [
    /* the address as the last edit leaves it, whose write may still be waiting its turn */
    bind("copyUrl", () => {
      o.settle();
      copyAddress();
    }),
    bind("random", () => e.random()),
    bind("invert", () => e.invert()),
    bind("reverse", () => e.reverse()),
    /* the panel key of canvas tools: the picture and the sheet take the page's width */
    bind("panel", o.togglePanel),
    /* over a row of keyframes, select all means those, never the page's text */
    bind("selectAll", () => e.holdAll()),
    /* with nothing held the keys do nothing: taking away a keyframe no one picked would surprise */
    bind("remove", () => e.removeKeyframes(), held),
    /* with nothing held Escape is not the editor's, so whatever else is open takes it */
    bind("letGo", () => e.letGo(), held),
    bind("stops", i => e.setSteps(e.steps() + (i ? 1 : -1))),
    bind("rotate", i => e.setAngle((e.angle() + (i ? 15 : 345)) % 360)),
    /* the editor's own undo, never the browser's Back: it walks the edits with the page's steps and stays here */
    bind("undo", i => (i === 0 ? e.undo() : e.redo())),
    /* an admin's Save, as the press under the edits does; anyone else's Mod+S stays the browser's */
    bind("save", () => void o.save.save(), o.save.admin)
  ];
}
