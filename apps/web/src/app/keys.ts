import { msg, t } from "@grabient/i18n";
import { announce } from "@grabient/ui/announce.ts";
import { copyText } from "@grabient/ui/copy.ts";
import { keyRow } from "@grabient/ui/keymap.ts";
import { type Binding, installKeys, type KeyRow, sharedKeys } from "@grabient/ui/keys.ts";
import { toggleTheme } from "@grabient/ui/theme.ts";
import { createSignal, onSettled } from "solid-js";
import { trackEvent } from "../features/analytics/analytics.ts";
import { redo, undo } from "./undo.ts";

/* The keys every page answers to: T for the theme, U to copy the page's address, Mod+Z and Mod+Shift+Z for the page's
   undo, ? for the list of what works here, then whatever the page adds. A page's binding with the id of a shared one
   stands in for it while it applies: the editor's undo walks its edits, and its copy of the address waits for the
   address to settle. Typing is never taken. */
const UNDO = keyRow("undo")!;

/** Binds the site's keys and `page()` for as long as the caller is mounted. `rows` is the ? list while it is open. */
export function createSiteKeys(page: () => readonly Binding[]) {
  const [rows, setRows] = createSignal<readonly KeyRow[] | null>(null);
  const shared = (): Binding[] => [
    ...sharedKeys({
      theme: () => {
        const next = toggleTheme();
        if (next) trackEvent("change_setting", { setting: "theme", value: next });
      },
      copyUrl: () => {
        void copyText(location.href).then(ok => {
          announce(t(ok ? msg("Copied") : msg("Couldn't copy. Select the text and copy it.")));
          if (ok) trackEvent("copy_link", { surface: "key" });
        });
      }
    }),
    {
      id: "undo",
      key: UNDO.keys,
      label: UNDO.label,
      scope: UNDO.scope,
      run: i => void (i === 0 ? undo() : redo())
    }
  ];
  onSettled(() =>
    installKeys(
      () => {
        const own = page().filter(b => b.when?.() ?? true);
        const taken = new Set(own.map(b => b.id).filter(Boolean));
        return [...shared().filter(b => !taken.has(b.id)), ...own];
      },
      list => setRows(rows() ? null : list)
    )
  );
  return { rows, close: () => setRows(null) };
}
