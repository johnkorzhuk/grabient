import { clampSize, parseSize, type Size, sizeParam } from "@grabient/engine/view.ts";
import { msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { EXPORT_DEFAULTS, type ExportSettings } from "@grabient/ui/export-settings.ts";
import { Icon } from "@grabient/ui/Icon.tsx";
import { SIZE_PRESETS, screenSize, sizePresetOf } from "@grabient/ui/sizes.ts";
import { Text } from "@grabient/ui/Text.tsx";
import { isServer } from "@solidjs/web";
import { useLocation, useRouter, useSearch } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  type Element,
  lazy,
  onCleanup,
  onSettled,
  Show,
  untrack,
  useContext
} from "solid-js";
import { rewriteInPlace, rewriteQuietly, SELECTION_MARK } from "../../app/navigation.ts";
import { ShellContext } from "../../app/shell.ts";
import { inOrder, rememberedView, rememberView } from "../list/appearance.ts";
import styles from "./Selection.module.css";
import { loadSelection, selection, selectionRead } from "./selection.ts";

/* The selection on a page that lists palettes: the lists, the collections, the home and a collection's page. Once the
   selection holds something, Selection opens selection mode: the export screen the editor has, the selection drawn on
   the stage as it will export and the export column at its right, Close at its head. The page's own content stays
   mounted and out of sight (`away`), so Close returns to the same depth. Selection mode is the page's address with
   `selection`, an entry of its own: Back closes it, and Close and Escape are Back when the entry was opened here.
   Each palette's size is the address's `size`, which travels with the reader; the column's other numbers are this
   browser's. A page draws the parts where they stand in its own markup (`button`, `float`, `screen`). What a page
   starts with is here: the way in, the address and the numbers; the screen itself is ExportScreen.tsx. */

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

/* The export screen's code (ExportScreen.tsx) is no page's start: it is asked for in an idle moment once the selection
   holds something, so its way in stands; at once as the pointer, the keyboard or a finger reaches that press; and as an
   address asks for the screen, a palette's page waiting for it with the editor's own code (editor/page.ts). The page
   stands until it has come, as it stands until the selection is read, so the screen takes its place whole. The screen
   never stands on the server, whose build carries none of it. */
const ExportScreen = lazy(() =>
  (import.meta.env.SSR ? (new Promise(() => {}) as never) : import("./ExportScreen.tsx")).then(
    m => ({ default: m.ExportScreen })
  )
);
/* whether its code has come: plain for a page made after, a signal for a page that waits for it */
let came = false;
const [loaded, setLoaded] = createSignal(false);
const ready = () => came || loaded();
/** Asks for the export screen's code, once while it comes; settles once it is in. */
export function loadExportScreen(): Promise<void> {
  return ExportScreen.preload().then(() => {
    if (came) return;
    came = true;
    setLoaded(true);
  });
}
const prefetch = () => void loadExportScreen().catch(() => {});

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
  /* the address asks for the selection; it stands once this browser's selection is read and holds something, and its
     screen's code is in, so the page stands until then, on the server and through hydration alike */
  const asked = () => params().selection !== undefined;
  const wanted = () => asked() && selectionRead() && selection().length > 0;
  const open = () => wanted() && ready();
  /* an address that asks for the screen asks for its code as the page starts */
  if (!isServer && untrack(asked)) prefetch();
  createEffect(
    () => wanted() && !ready(),
    waiting => {
      if (waiting) prefetch();
    }
  );
  /* once the selection holds something its way in stands, and the screen's code comes in an idle moment */
  createEffect(
    () => selection().length > 0 && !ready(),
    idle => {
      if (!idle) return;
      if (typeof requestIdleCallback === "function") {
        const id = requestIdleCallback(prefetch, { timeout: 2000 });
        return () => cancelIdleCallback(id);
      }
      const id = setTimeout(prefetch, 200);
      return () => clearTimeout(id);
    }
  );

  const [layout, setLayout] = createSignal<Layout>(LAYOUT);
  /* what Auto is: a list's palettes have no picture of their own and take the grid's cell; a page that has one hands
     its size in (sized), so Auto exports the picture the reader sees */
  let auto: () => Size | undefined = () => undefined;
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
      search: (prev: Record<string, unknown>) => inOrder(prev, patch)
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
  /* the route takes the size once the drag rests: a route change redraws the page's data, links and metadata. A size
     dragged back to the route's own leaves the route nothing to take, so the address is written here. Each write is
     in the entry's place and keeps what the entry holds, its mark among it. */
  const settle = () => {
    stop();
    const want = draft();
    if (want === null) return;
    lastWrite = Date.now();
    (want === committed() ? rewriteQuietly : rewriteInPlace)(href({ size: sizeParamOf(want) }));
    /* the tab remembers it as the reader's view, which a list that Close goes Back to takes */
    rememberView({ ...rememberedView(), size: parseSize(want) });
    setDraft(null);
  };
  const writeSize = (want: string) => {
    setDraft(want);
    writeTimer ??= setTimeout(
      () => {
        writeTimer = undefined;
        lastWrite = Date.now();
        rewriteQuietly(href({ size: sizeParamOf(want) }));
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
    /* the screen's code, if it has not come: asked for again where an earlier ask failed */
    prefetch();
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
    rewriteInPlace(href({ selection: undefined }));
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
        else rewriteInPlace(href({ selection: undefined }));
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

  /* the way in appears once something is in the selection; open, the column's head has Close. The pointer, the keyboard
     or a finger that reaches it asks for the screen's code, if an idle moment has not */
  const press = () => (
    <Show when={selection().length && !open()}>
      <span
        data-selection="open"
        class={styles.covering}
        onPointerEnter={prefetch}
        onPointerDown={prefetch}
        onFocusIn={prefetch}
      >
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
    /** the page's own picture, whose size Auto is: the editor's stage, as it was measured last */
    sized(picture: () => Size) {
      auto = picture;
    },
    /** Selection alone, once something is in it, where a page stands it among presses of its own */
    press,
    /** the end of the page's row of lists: Selection, once something is in it */
    button: () => <span class={styles.end}>{press()}</span>,
    /** a phone's: the same, floating at the foot of the screen */
    float: () => (
      <span class={styles.float} data-floor={selection().length && !open() ? "" : undefined}>
        {press()}
      </span>
    ),
    /** the export screen while the selection stands, in the page's content's place: its code is in by then */
    screen: () => (
      <Show when={open()}>
        <ExportScreen
          settings={settings()}
          onSettings={onSettings}
          autoSize={auto()}
          note={page.note}
          save={page.save?.()}
          onClose={close}
        />
      </Show>
    )
  };
}
