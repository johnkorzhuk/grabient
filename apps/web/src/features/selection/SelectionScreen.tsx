import { clampSize, parseSize, sizeParam } from "@grabient/engine/view.ts";
import { msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { EXPORT_DEFAULTS, ExportPanel, type ExportSettings } from "@grabient/ui/ExportPanel.tsx";
import { ExportPreview } from "@grabient/ui/ExportPreview.tsx";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { SIZE_PRESETS, screenSize, sizePresetOf } from "@grabient/ui/sizes.ts";
import { Text } from "@grabient/ui/Text.tsx";
import { useLocation, useRouter, useSearch } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  type Element,
  onCleanup,
  onSettled,
  Show,
  untrack,
  useContext
} from "solid-js";
import { SELECTION_MARK } from "../../app/navigation.ts";
import { ShellContext } from "../../app/shell.ts";
import { hexesOf } from "../../lib/palette.ts";
import { useTaken } from "../palette-use/use.ts";
import { copySelection, downloadSelection } from "./export.ts";
import styles from "./Selection.module.css";
import {
  clearSelection,
  loadSelection,
  removeSelected,
  selection,
  selectionRead
} from "./selection.ts";

/* The selection on a page that lists palettes: the lists, the collections, the home and a collection's page. Once the
   selection holds something, Selection opens selection mode: the export screen the editor has, the selection drawn on
   the stage as it will export and the export column at its right, Close at its head. The page's own content stays
   mounted and out of sight (`away`), so Close returns to the same depth. Selection mode is the page's address with
   `selection`, an entry of its own: Back closes it, and Close and Escape are Back when the entry was opened here.
   Each palette's size is the address's `size`, which travels with the reader; the column's other numbers are this
   browser's. A page draws the parts where they stand in its own markup (`button`, `float`, `screen`). */

/** A size dragged in the column reaches the address at most this often, and the route takes it once it rests. */
const WRITE_MS = 350;
const REST_MS = 500;
const LAYOUT_KEY = "grabient-selection-export";

/** How the column lays the selection out: the columns, and the gap, padding and corners as shares of a palette's
    shorter side. */
type Layout = Pick<ExportSettings, "columns" | "gap" | "padding" | "corners">;
const LAYOUT: Layout = {
  columns: EXPORT_DEFAULTS.columns,
  gap: EXPORT_DEFAULTS.gap,
  padding: EXPORT_DEFAULTS.padding,
  corners: EXPORT_DEFAULTS.corners
};
const share = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(50, Math.max(0, Math.round(value)))
    : fallback;
function readLayout(): Layout {
  try {
    const kept = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null");
    if (kept && typeof kept === "object") {
      return {
        columns:
          kept.columns === "auto" || (Number.isInteger(kept.columns) && kept.columns > 0)
            ? kept.columns
            : LAYOUT.columns,
        gap: share(kept.gapPercent, LAYOUT.gap),
        padding: share(kept.paddingPercent, LAYOUT.padding),
        corners: share(kept.corners, LAYOUT.corners)
      };
    }
  } catch {
    /* the defaults */
  }
  return LAYOUT;
}
function keepLayout(next: Layout) {
  try {
    localStorage.setItem(
      LAYOUT_KEY,
      JSON.stringify({
        columns: next.columns,
        gapPercent: next.gap,
        paddingPercent: next.padding,
        corners: next.corners
      })
    );
  } catch {
    /* the page still has it */
  }
}

/** While the column covers the page (a narrow screen, where it is fixed), the page beneath it is inert, so the
    keyboard stays in the column. Returns the way out. */
function inertBehind(panel: HTMLElement): () => void {
  const marked: HTMLElement[] = [];
  const release = () => {
    for (const el of marked.splice(0)) el.inert = false;
  };
  const apply = () => {
    release();
    const main = panel.closest("main");
    if (!main || getComputedStyle(panel).position !== "fixed") return;
    for (let el: HTMLElement | null = panel; el && el !== main; el = el.parentElement) {
      for (const sibling of el.parentElement?.children ?? []) {
        if (sibling !== el && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true;
          marked.push(sibling);
        }
      }
    }
  };
  let frame = 0;
  const later = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  };
  apply();
  window.addEventListener("resize", later);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", later);
    release();
  };
}

/** The export column's place, which makes the page beneath inert while the column covers it. */
function Covering(props: { children: Element }) {
  let box!: HTMLDivElement;
  onSettled(() => {
    const panel = box.firstElementChild;
    return panel instanceof HTMLElement ? inertBehind(panel) : undefined;
  });
  return (
    <div ref={box} class={styles.covering}>
      {props.children}
    </div>
  );
}

export function createSelectionScreen(page: {
  /** the page's status line: what the selection could not do */
  note: (message: string) => void;
  /** the column's Save side: the selection kept as one of the account's collections */
  save?: () => Element;
}) {
  const shell = useContext(ShellContext);
  const router = useRouter();
  const location = useLocation();
  const search = useSearch({ strict: false });
  const params = () => search() as Record<string, unknown>;
  /* the address asks for the selection; it stands once this browser's selection is read and holds something, so the
     page stands until then, on the server and through hydration alike */
  const asked = () => params().selection !== undefined;
  const open = () => asked() && selectionRead() && selection().length > 0;

  const [layout, setLayout] = createSignal<Layout>(LAYOUT);
  /* each palette's size: the address's, or while a drag goes on, the value it has reached */
  const [draft, setDraft] = createSignal<string | null>(null);
  const committed = () => (typeof params().size === "string" ? (params().size as string) : "auto");
  const size = () => draft() ?? committed();
  const settings = createMemo((): ExportSettings => {
    const s = parseSize(size());
    return {
      preset: sizePresetOf(s, screenSize()),
      width: s?.width ?? "auto",
      height: s?.height ?? "auto",
      ...layout()
    };
  });
  const href = (patch: Record<string, unknown>) =>
    router.buildLocation({
      to: location().pathname,
      search: (prev: Record<string, unknown>) => ({ ...prev, ...patch })
    } as never).publicHref;

  let writeTimer: ReturnType<typeof setTimeout> | undefined;
  let restTimer: ReturnType<typeof setTimeout> | undefined;
  let lastWrite = 0;
  const stop = () => {
    clearTimeout(writeTimer);
    clearTimeout(restTimer);
    writeTimer = restTimer = undefined;
  };
  const sizeParamOf = (value: string) => (value === "auto" ? undefined : value);
  /* the route takes the size once the drag rests: a route change redraws the page's data, links and metadata */
  const settle = () => {
    stop();
    const want = draft();
    if (want === null) return;
    lastWrite = Date.now();
    if (want !== committed())
      void router.navigate({
        href: href({ size: sizeParamOf(want) }),
        replace: true,
        resetScroll: false
      });
    setDraft(null);
  };
  const writeSize = (want: string) => {
    setDraft(want);
    writeTimer ??= setTimeout(
      () => {
        writeTimer = undefined;
        lastWrite = Date.now();
        history.replaceState(history.state, "", href({ size: sizeParamOf(want) }));
      },
      Math.max(0, WRITE_MS - (Date.now() - lastWrite))
    );
    clearTimeout(restTimer);
    restTimer = setTimeout(settle, REST_MS);
  };
  /* a page on its way out drops a write still waiting: the address is another page's by then */
  onCleanup(stop);

  const onSettings = (next: ExportSettings) => {
    const kept: Layout = {
      columns: next.columns,
      gap: next.gap,
      padding: next.padding,
      corners: next.corners
    };
    if (JSON.stringify(kept) !== JSON.stringify(layout())) {
      setLayout(kept);
      keepLayout(kept);
    }
    const preset = SIZE_PRESETS.find(p => p.value === next.preset);
    const chosen =
      next.preset === "auto"
        ? null
        : clampSize(
            preset?.w && preset.h
              ? { width: preset.w, height: preset.h }
              : { width: next.width, height: next.height }
          );
    const want = sizeParam(chosen) ?? "auto";
    if (want !== size()) writeSize(want);
  };

  let scrolledTo = 0;
  /* Selection and Close stand in each other's place: a keyboard that pressed one goes to the other once it stands */
  const focusPress = (which: "open" | "close") => {
    if (!document.activeElement?.closest("[data-selection], aside")) return;
    const land = (tries: number) => {
      const press = [
        ...document.querySelectorAll<HTMLElement>(
          which === "close"
            ? `aside button[aria-label="${CSS.escape(t("Close selection"))}"]`
            : '[data-selection="open"] button'
        )
      ].find(el => el.offsetParent !== null);
      if (press) press.focus({ preventScroll: true });
      else if (tries > 0) setTimeout(() => land(tries - 1), 50);
    };
    setTimeout(() => land(8));
  };
  const show = () => {
    if (asked()) return;
    scrolledTo = scrollY;
    focusPress("close");
    void router.navigate({
      href: href({ selection: "" }),
      resetScroll: false,
      state: { mark: SELECTION_MARK } as never
    });
  };
  /* the way back to the page: Back, when this entry was opened over it here; else the page's own address in its place */
  const close = () => {
    settle();
    if (!asked()) return;
    focusPress("open");
    const state = history.state as { mark?: unknown; __TSR_index?: number } | null;
    if (state?.mark === SELECTION_MARK && (state.__TSR_index ?? 0) > 0) return history.back();
    void router.navigate({
      href: href({ selection: undefined }),
      replace: true,
      resetScroll: false
    });
    requestAnimationFrame(() => window.scrollTo({ top: scrolledTo, behavior: "instant" }));
  };
  /* nothing left to show: a selection emptied while it stood closes as Close does; an address that asks for an empty
     one lets the word go */
  let stood = false;
  createEffect(
    () => [asked(), selectionRead(), selection().length] as const,
    ([isAsked, isRead, count]) => {
      if (!isAsked || !isRead) {
        stood = false;
        return;
      }
      if (count) {
        stood = true;
        return;
      }
      /* what Close and the address read is the page's now, not what the effect follows */
      untrack(() => {
        if (stood) close();
        else
          void router.navigate({
            href: href({ selection: undefined }),
            replace: true,
            resetScroll: false
          });
      });
      stood = false;
    }
  );
  onSettled(() => {
    loadSelection();
    setLayout(readLayout());
  });
  /* while it stands, the bar and the water carry the selection, and Escape closes it */
  shell?.paint(() => (open() ? selection() : null));
  shell?.keys(() => [{ key: "Escape", label: msg("Close selection"), run: close, when: open }]);

  const previews = createMemo(() =>
    selection().map(item => ({
      id: item.id,
      stops: hexesOf(item),
      style: item.style,
      angle: item.angle
    }))
  );
  const copy = (format: Format) =>
    copySelection(selection(), settings(), format).then(
      done => {
        if (done === "downloaded")
          page.note(t("Images can't be copied here, so the file was downloaded."));
        useTaken(
          done === "downloaded" ? "download" : "copy",
          format,
          { surface: "selection" },
          selection()
        );
        return done === "copied";
      },
      (reason: unknown) => {
        page.note(reason instanceof Error ? reason.message : t("Couldn't copy the selection."));
        return false;
      }
    );
  const download = (format: Format) =>
    void downloadSelection(selection(), settings(), format).then(
      () =>
        useTaken(
          format === "url" ? "copy" : "download",
          format,
          { surface: "selection" },
          selection()
        ),
      (reason: unknown) =>
        page.note(reason instanceof Error ? reason.message : t("Couldn't download the selection."))
    );
  /* the way in appears once something is in the selection; open, the column's head has Close */
  const press = () => (
    <Show when={selection().length && !open()}>
      <span data-selection="open" class={styles.covering}>
        <Button variant="primary" size="lg" onClick={show}>
          <Icon name="grid" size={14} />
          <span>{t("Selection")}</span>{" "}
          <Text variant="num" as="span">
            {selection().length}
          </Text>
        </Button>
      </span>
    </Show>
  );
  return {
    open,
    show,
    close,
    /** Selection alone, once something is in it, where a page stands it among presses of its own */
    press,
    /** the end of the page's row of lists: Selection, once something is in it */
    button: () => <span class={styles.end}>{press()}</span>,
    /** a phone's: the same, floating at the foot of the screen */
    float: () => <span class={styles.float}>{press()}</span>,
    /** the export screen while the selection stands, in the page's content's place */
    screen: () => (
      <Show when={open()}>
        <main class={styles.screen} data-beside-scrollbar="">
          <div class={styles.stage}>
            <div class={styles.fit}>
              <ExportPreview items={previews()} settings={settings()} onRemove={removeSelected} />
            </div>
          </div>
          <div class={styles.column}>
            <Covering>
              <ExportPanel
                count={selection().length}
                settings={settings()}
                onSettings={onSettings}
                onClear={clearSelection}
                onCopy={copy}
                onDownload={download}
                save={page.save?.()}
                onClose={close}
                preview={
                  <ExportPreview
                    items={previews()}
                    settings={settings()}
                    onRemove={removeSelected}
                  />
                }
              />
            </Covering>
          </div>
        </main>
      </Show>
    )
  };
}
