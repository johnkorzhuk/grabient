import { K_MAX, K_MIN } from "@grabient/engine";
import { hexToSrgb, luminance } from "@grabient/engine/color.ts";
import { gradientCss } from "@grabient/engine/css.ts";
import { stopNear } from "@grabient/engine/strip.ts";
import { resolveSize, type Size } from "@grabient/engine/view.ts";
import { msg, t } from "@grabient/i18n";
import { BackToTop } from "@grabient/ui/BackToTop.tsx";
import { Button } from "@grabient/ui/Button.tsx";
import { type Format, FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { createFlashGuard } from "@grabient/ui/flash.ts";
import { HexField } from "@grabient/ui/HexField.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Keyframes } from "@grabient/ui/Keyframes.tsx";
import { keyRow } from "@grabient/ui/keymap.ts";
import { matches, rowKeys, typing } from "@grabient/ui/keys.ts";
import { reducesNow } from "@grabient/ui/motion.ts";
import { createHold } from "@grabient/ui/press.ts";
import { SizeControl } from "@grabient/ui/SizeControl.tsx";
import { StopStrip } from "@grabient/ui/StopStrip.tsx";
import { tooltip } from "@grabient/ui/Tooltip.tsx";
import { space } from "@grabient/ui/tokens.ts";
import { useLocation, useNavigate, useRouter } from "@tanstack/solid-router";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Loading,
  lazy,
  onCleanup,
  onSettled,
  Show,
  untrack,
  useContext
} from "solid-js";
import { ShellContext } from "../../app/shell.ts";
import { toast } from "../../app/toast.ts";
import { likeCount, liked, refreshCounts, toggleLike } from "../account/likes.ts";
import { account, loginHref } from "../account/session.ts";
import { trackSignInPrompt } from "../analytics/analytics.ts";
import { useInEditor } from "../palette-use/use.ts";
import { createSelectionScreen } from "../selection/SelectionScreen.tsx";
import {
  loadSelection,
  roomNote,
  selected,
  selection,
  toggle as toggleSelected
} from "../selection/selection.ts";
import { Actions, AxisRow } from "./Controls.tsx";
import { Corner, type Panel } from "./Corner.tsx";
import styles from "./Editor.module.css";
import { holdCorner } from "./EditorCorner.tsx";
import { createPaletteEditor, type PaletteEditor } from "./editor.ts";
import { copyFormat, copyLink, NO_IMAGE_CLIPBOARD, saveFormat, type Taken } from "./formats.ts";
import { followAddress } from "./history.ts";
import { editorBindings, keyOf } from "./keys.ts";
import type { PaletteData } from "./page.ts";
import { createRest, type Rest } from "./rest.ts";
import { createPaletteSave, type PaletteSave } from "./save.ts";

/* The editor, at a palette's address. A side that never leaves the window holds the controls: the keyframes, then
   lightness, chroma and hue, each its numbers over its plot, then the actions and the hex of a keyframe held alone.
   Beside it is what the page scrolls: the picture, the first screen, with the strip of the palette's colors along its
   foot, then the sheet, whose name's row shows under the strip at rest. As the page scrolls the sheet comes up over the
   picture, which keeps its place, and the strip comes up with it to the header, where it stays as the page's bar. The
   side can be put away (the panel press in the header's corner, or \), and then a rail of the keyframes stands between
   the picture and the strip. Under 900px there is no room for a side: the controls follow the strip in the page's
   own scroll. */

const NARROW = 900;
/* The sheet, under the first screen, comes once the first screen stands: its code arrives apart, and its panes are
   made in a task of their own, so the controls answer sooner. */
const Sheet = lazy(() => import("./Sheet.tsx").then(m => ({ default: m.Sheet })));
/* the plots' height where the controls follow the strip, and the least and most beside the page */
const PLOT_FLOW = 132;
const PLOT_LEAST = 96;
const PLOT_MOST = 220;
/* a field typed in on a touch screen: how far down the window it may stand and be over any keyboard, the room the side
   gives its rows to rise there (more than any keyboard is tall), and the least a row keeps under the side's top */
const OVER_KEYS = 1 / 3;
const TYPING_ROOM = "60dvh";
const LIFT_GAP = space.s4;

/* The stage strip's formats: Copy hands over the address, the CSS and the pictures, Download saves the files the
   site serves (the Markdown in the address's place), and Copy link copies those files' addresses. A format keeps its
   place as the mode turns (FormatStrip), so only the first chip changes. */
const COPY: Format[] = ["url", "css", "svg", "png"];
const FILES: Format[] = ["md", "css", "svg", "png"];

/** The side's panel: shown or put away, kept in this browser. A window 900px wide or less has no side to put away. */
function createPanel(): Panel {
  const KEY = "grabient-panel";
  const stored = () => {
    try {
      return localStorage.getItem(KEY) !== "0";
    } catch {
      return true;
    }
  };
  const query = matchMedia(`(max-width: ${NARROW}px)`);
  const [pref, setPref] = createSignal(stored());
  const [narrow, setNarrow] = createSignal(query.matches);
  const follow = (e: MediaQueryListEvent) => setNarrow(e.matches);
  query.addEventListener("change", follow);
  onCleanup(() => query.removeEventListener("change", follow));
  const open = () => pref() || narrow();
  return {
    open,
    toggle() {
      const on = !open();
      setPref(on);
      try {
        if (on) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, "0");
      } catch {
        /* a browser that keeps no site data: the choice lasts as long as the page */
      }
    }
  };
}

/** The editor over the palette the route names. It mounts in the browser over the page the server sent. */
export default function Editor(props: { data: PaletteData }) {
  const router = useRouter();
  const navigate = useNavigate();
  const location = useLocation();
  const shell = useContext(ShellContext);
  const first = untrack(() => props.data);
  const e = createPaletteEditor(
    first.page,
    untrack(location).state as { edits?: unknown; opened?: unknown }
  );
  const rest = createRest();
  rest.opened(first.page.seed);
  const panel = createPanel();
  holdCorner(() => <Corner editor={e} panel={panel} />);
  followAddress(e, router, location, page => rest.opened(page.seed));
  const save = createPaletteSave({
    seed: e.seed,
    opened: e.openedSeed,
    saved: e.setOpenedSeed,
    key: () => keyOf("save")
  });
  const drawn = () => ({ seed: e.seed(), style: e.style(), steps: e.steps(), angle: e.angle() });
  /* the selection's export screen, in the page's place while the address says `selection` */
  const chosen = createSelectionScreen({ note: toast });
  /* The frame keeps the keys and the palettes a page hands in last, so these come after the screen's and stand for
     both: while the screen stands the editor's keys rest, Escape closes it and the bar carries the selection. */
  shell.keys(() => [
    ...editorBindings(e, { live: () => !chosen.open(), togglePanel: panel.toggle, save }),
    { key: "Escape", label: msg("Close selection"), run: chosen.close, when: chosen.open }
  ]);
  shell.paint(() => (chosen.open() ? selection() : [drawn()]));

  /* an admin's Save from inside a field (a hex being typed), where the page's keys rest: the field lets go, which
     commits it, then Save; never the browser's own Save page */
  onSettled(() => {
    const saveRow = keyRow("save");
    const onKey = (event: KeyboardEvent) => {
      if (!save.admin() || !typing(event.target) || !saveRow) return;
      if (!rowKeys(saveRow).some(k => matches(event, k))) return;
      event.preventDefault();
      (event.target as HTMLElement).blur();
      setTimeout(() => void save.save(), 0);
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  });
  /* the page's end never stretches with a finger: what is pinned (the strip, a phone's foot) would part from it */
  onSettled(() => {
    const root = document.documentElement;
    const was = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "none";
    return () => {
      root.style.overscrollBehaviorY = was;
    };
  });
  /* how many like the palette on screen, asked once it has rested: a held key makes many palettes a second */
  createEffect(e.seed, seed => {
    rest.is(seed);
    const timer = setTimeout(() => {
      rest.asked(seed);
      void refreshCounts([seed]).catch(() => {});
    }, rest.left());
    return () => clearTimeout(timer);
  });
  /* the check's state is this browser's selection, read once the page is live */
  onSettled(loadSelection);

  /* the palette as a copy or a download takes it */
  const taken = (stage: Size): Taken => ({
    seed: e.seed(),
    style: e.style(),
    steps: e.steps(),
    angle: e.angle(),
    size: e.size(),
    pixels: resolveSize(e.size(), stage),
    stops: e.stopsTaken()
  });
  const used = (action: "copy" | "download", format: string) =>
    useInEditor(action, format, e.openedSeed(), drawn());
  /* the heart: the count for everyone, the press for an account; signed out it leads to sign in */
  const heart = {
    liked: () => liked(e.seed()),
    count: () => likeCount(e.seed(), 0),
    async toggle() {
      if (!account()) {
        trackSignInPrompt("like");
        void navigate({ href: loginHref() });
        return;
      }
      const { seed, ...view } = drawn();
      try {
        await toggleLike(seed, !liked(seed), { view });
      } catch (error) {
        toast(error instanceof Error ? error.message : t("Couldn't save the palette."));
      }
    }
  };
  return (
    <>
      <Page
        editor={e}
        panel={panel}
        save={save}
        rest={rest}
        facts={() => (e.seed() === first.page.seed ? first.facts : null)}
        heading={() =>
          e.seed() === first.page.seed &&
          e.style() === first.page.view.style &&
          e.steps() === first.page.view.steps
            ? first.heading
            : undefined
        }
        opened={e.openedSeed}
        taken={taken}
        used={used}
        heart={heart}
        chosen={chosen}
      />
      {chosen.screen()}
    </>
  );
}

interface Heart {
  liked: () => boolean;
  count: () => number;
  toggle: () => Promise<void>;
}
interface PageProps {
  editor: PaletteEditor;
  panel: Panel;
  save: PaletteSave;
  rest: Rest;
  facts: () => PaletteData["facts"];
  /** the server's heading, while the palette and view are the page's own */
  heading: () => string | undefined;
  opened: () => string;
  taken: (stage: Size) => Taken;
  used: (action: "copy" | "download", format: string) => void;
  heart: Heart;
  /** the selection's export screen: while it stands the page steps away, kept as it was for Close */
  chosen: ReturnType<typeof createSelectionScreen>;
}

function Page(props: PageProps) {
  const e = props.editor;
  let page!: HTMLElement;
  let stage: HTMLElement | undefined;
  let rail: HTMLElement | undefined;
  const [width, setWidth] = createSignal(innerWidth);
  const [dockH, setDockH] = createSignal(72);
  const [band, setBand] = createSignal<number | null>(null);
  /* the stage's own pixels: Auto's size, and what an auto side follows */
  const [stageSize, setStageSize] = createSignal<Size>({ width: 800, height: 400 });
  const narrow = () => width() <= NARROW;
  /* the side stands beside the page, or its rows follow the strip */
  const sided = () => props.panel.open() || narrow();
  const railed = () => !props.panel.open() && !narrow();
  /* The page's scroll, read once a frame: it has left its rest; the sheet's name has come up a press and a gap, clear
     of the press at the page's corner; the strip is at its place under the header, so the picture is covered; and which
     of the two screens is nearer, for the press that leads to the other. */
  const [moved, setMoved] = createSignal(false);
  const [raised, setRaised] = createSignal(false);
  const [docked, setDocked] = createSignal(false);
  const [nearer, setNearer] = createSignal(false);
  const reach = () => (stage?.offsetHeight ?? 0) + (rail?.offsetHeight ?? 0);
  onSettled(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = scrollY;
      const far = reach();
      setMoved(y > 1);
      setRaised(y >= 48);
      setDocked(far > 0 && y >= far - 1);
      setNearer(far > 0 && y > far / 2);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    const sizes = new ResizeObserver(() => {
      setWidth(page.clientWidth);
      page.style.setProperty("--head", `${page.getBoundingClientRect().top + scrollY || 0}px`);
      onScroll();
    });
    /* the observer's first report, after the first layout, reads the scroll too: nothing here forces a layout */
    sizes.observe(page);
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      sizes.disconnect();
      removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  });
  const go = (top: number) => scrollTo({ top, behavior: reducesNow() ? "auto" : "smooth" });
  const [late, setLate] = createSignal(false);
  onSettled(() => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setLate(true), { timeout: 1000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(() => setLate(true), 50);
    return () => clearTimeout(id);
  });
  return (
    <main
      ref={page}
      id="main"
      class={styles.page}
      hidden={props.chosen.open()}
      data-alone={sided() ? undefined : ""}
      data-railed={railed() ? "" : undefined}
      data-beside-scrollbar=""
      style={{
        "--dock-h": `${dockH()}px`,
        ...(band() !== null && !narrow() ? { "--peek": `${band()}px` } : {})
      }}
    >
      {/* the parts stand in the order they are read and the keyboard walks them: beside the page the side comes first;
          where its rows follow the strip, after the strip */}
      <Show when={sided() && !narrow()}>
        <Side {...props} narrow={false} />
      </Show>
      <div class={styles.scrolled}>
        <Stage
          {...props}
          moved={moved()}
          raised={raised()}
          docked={docked()}
          stage={stageSize()}
          onStage={setStageSize}
          ref={el => {
            stage = el;
          }}
        />
        <Show when={railed()}>
          <Rail
            editor={e}
            panel={props.panel}
            out={docked()}
            ref={el => {
              rail = el;
              onCleanup(() => {
                rail = undefined;
              });
            }}
          />
        </Show>
        <Strip
          editor={e}
          narrow={narrow()}
          marked={sided()}
          onHeight={setDockH}
          onCopy={() => props.used("copy", "hex")}
        />
        {/* where the controls follow the strip they are under the first screen, and come with the sheet */}
        <Show when={narrow() && late()}>
          <Side {...props} narrow />
        </Show>
        <Show when={late()}>
          <Loading>
            <Sheet
              editor={e}
              rest={props.rest}
              facts={props.facts}
              heading={props.heading}
              opened={props.opened}
              taken={() => props.taken(stageSize())}
              used={props.used}
              resting={!raised()}
              clear={docked()}
              onBand={height => setBand(height)}
              actions={<Tools editor={e} heart={props.heart} paper />}
              selection={props.chosen.button()}
            />
          </Loading>
        </Show>
      </div>
      <BackToTop
        shown={!narrow() || docked()}
        resting={!docked()}
        down={!nearer()}
        raised={selection().length > 0}
        onDown={() => go(reach())}
        onUp={() => go(0)}
      />
      {props.chosen.float()}
    </main>
  );
}

/** The palette's own presses: the heart and the check that puts it in the selection, and over the picture the way into
    the selection once it holds something. Over the picture they are glass and wait for a tap on a touch screen; in
    the sheet's head they are the page's own. */
function Tools(props: {
  editor: PaletteEditor;
  heart: Heart;
  paper?: boolean;
  chosen?: PageProps["chosen"];
}) {
  const e = props.editor;
  const drawn = () => ({ seed: e.seed(), style: e.style(), steps: e.steps(), angle: e.angle() });
  const chosen = () => selected(drawn());
  const likeTip = tooltip(() => t(props.heart.liked() ? msg("Unlike") : msg("Like")));
  return (
    <>
      <span class={props.paper ? undefined : styles.waits}>
        <button
          ref={likeTip}
          type="button"
          class={styles.like}
          data-paper={props.paper ? "" : undefined}
          aria-pressed={props.heart.liked() ? "true" : "false"}
          aria-label={t("{count, plural, one {Like, #} other {Like, #}}", {
            count: props.heart.count()
          })}
          onClick={() => void props.heart.toggle()}
        >
          <Icon name="heart" fill={props.heart.liked()} size={16} />
          <span class={styles.count}>{props.heart.count()}</span>
        </button>
      </span>
      <Show when={props.chosen}>
        {chosen => <span class={styles.waits}>{chosen().button()}</span>}
      </Show>
      <span class={chosen() || props.paper ? undefined : styles.waits}>
        <Button
          variant={chosen() ? "primary" : props.paper ? "secondary" : "art"}
          icon
          size="lg"
          aria-pressed={chosen()}
          aria-label={t(chosen() ? msg("Remove from selection") : msg("Add to selection"))}
          tip={t(chosen() ? msg("Remove from selection") : msg("Add to selection"))}
          onClick={() => {
            /* a full selection lets its oldest go to make room, and says how to put it back */
            if (toggleSelected(drawn()) === "made room") toast(roomNote(1));
          }}
        >
          <Icon name={chosen() ? "check" : "plus"} size={15} />
        </Button>
      </span>
    </>
  );
}

/* a picture's lights, for the flash guard: each color's relative luminance, in the order it draws them */
const lights = (paints: readonly { hex: string }[]) =>
  paints.map(p => luminance(hexToSrgb(p.hex) ?? [0, 0, 0]));

/** The stage: the artwork with the presses at its corners. The presses are the first screen's: the sheet comes up
    over the picture, so the ones at its foot go as the page leaves its rest, and the palette's own at its top go once
    the sheet's head has them. */
function Stage(
  props: PageProps & {
    moved: boolean;
    raised: boolean;
    docked: boolean;
    stage: Size;
    onStage: (size: Size) => void;
    ref: (el: HTMLElement) => void;
  }
) {
  const e = props.editor;
  let el!: HTMLDivElement;
  /* a finger's tap on the artwork shows its presses, a second tap or a press anywhere else puts them away; a mouse
     always has them */
  const [shown, setShown] = createSignal(false);
  let finger = false;
  /* the artwork never flashes: a press that turns it back waits a moment, the state behind it never does */
  const calm = createFlashGuard(e.shownStops, lights);
  const art = () =>
    gradientCss(
      calm().map(s => s.paint ?? s.hex),
      e.shownStyle(),
      e.angle()
    );
  /* the size a row of the size list is resting on, painted without being set */
  const [sizePeek, setSizePeek] = createSignal<Size | null | undefined>(undefined);
  const drawn = () => {
    const peek = sizePeek();
    if (peek !== undefined) return peek;
    return e.size() ? resolveSize(e.size(), props.stage) : null;
  };
  onSettled(() => {
    const away = (event: PointerEvent) => {
      if (shown() && !el.contains(event.target as Node)) setShown(false);
    };
    document.addEventListener("pointerdown", away, true);
    const sizes = new ResizeObserver(() => {
      if (el.clientWidth)
        props.onStage({ width: Math.round(el.clientWidth), height: Math.round(el.clientHeight) });
    });
    sizes.observe(el);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      sizes.disconnect();
    };
  });
  onCleanup(() => setSizePeek(undefined));
  const copy = async (f: Format) => {
    try {
      await copyFormat(f, props.taken(props.stage));
      props.used("copy", f);
      return true;
    } catch (error) {
      toast(
        error instanceof Error && error.message === NO_IMAGE_CLIPBOARD
          ? t("Images can't be copied here.")
          : t("Couldn't copy the palette.")
      );
      return false;
    }
  };
  const link = async (f: Format) => {
    try {
      await copyLink(f, props.taken(props.stage));
      props.used("copy", `link:${f}`);
      return true;
    } catch {
      toast(t("Couldn't copy the palette."));
      return false;
    }
  };
  const download = (f: Format) =>
    saveFormat(f, props.taken(props.stage)).then(
      () => props.used("download", f),
      () => toast(t("Couldn't download the file."))
    );
  return (
    /* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: a tap on the artwork shows its presses to a finger; a mouse and the keyboard have them anyway */
    <div
      ref={div => {
        el = div;
        props.ref(div);
      }}
      class={styles.stage}
      data-shown={shown() ? "" : undefined}
      data-out={props.docked ? "" : undefined}
      inert={props.docked}
      onPointerDown={event => {
        finger = event.pointerType === "touch";
      }}
      onClick={event => {
        if ((event.target as Element).closest("a, button, input, [role='dialog']")) return;
        if (finger) setShown(!shown());
      }}
    >
      <Show
        when={drawn()}
        fallback={
          <div
            class={styles.paint}
            role="img"
            aria-label={t("The gradient")}
            style={{ background: art() }}
          />
        }
      >
        {size => (
          <div
            class={styles.fitted}
            role="img"
            aria-label={t("The gradient")}
            style={{
              "--ar": String(size().width / size().height),
              "--w": `${size().width}px`,
              background: art()
            }}
          />
        )}
      </Show>
      {/* biome-ignore lint/a11y/useSemanticElements: the palette's presses, which a fieldset would box */}
      <div
        class={styles.tools}
        data-away={props.raised ? "" : undefined}
        role="group"
        aria-label={t("Palette actions")}
      >
        <Tools editor={e} heart={props.heart} chosen={props.chosen} />
      </div>
      <div class={styles.bottomStart} data-away={props.moved ? "" : undefined}>
        <span class={styles.waits}>
          <SizeControl
            value={e.size()}
            auto={props.stage}
            onChange={size => {
              setSizePeek(undefined);
              e.setSize(size);
            }}
            onPeek={setSizePeek}
          />
        </span>
      </div>
      <div class={styles.bottomEnd} data-away={props.moved ? "" : undefined}>
        <span class={styles.waits}>
          <FormatStrip
            size="lg"
            variant="art"
            copy={COPY}
            download={FILES}
            swatches={SWATCH_CHIPS}
            link={FILES}
            onCopy={copy}
            onDownload={f => void download(f)}
            onLink={link}
          />
        </span>
      </div>
    </div>
  );
}

/** The keyframe rail, while the side is away: between the picture and the strip. Holding a keyframe brings the side
    back, where its numbers are. */
function Rail(props: {
  editor: PaletteEditor;
  panel: Panel;
  out: boolean;
  ref: (el: HTMLElement) => void;
}) {
  const e = props.editor;
  let rail!: HTMLDivElement;
  const reveal = () =>
    queueMicrotask(() => {
      if (e.held().length && !props.panel.open()) props.panel.toggle();
    });
  /* a finger's long press adds a keyframe to the hold or lets it go, as Ctrl or Cmd does; its click is swallowed */
  let pressed = -1;
  let longed = false;
  const hold = createHold(() => {
    if (pressed < 0) return;
    longed = true;
    e.pick(pressed, "toggle");
    reveal();
  });
  /* the side comes back and the rail goes: the keyboard moves to the same keyframe among the side's chips */
  const handOn = (j: number) => {
    if (!rail.contains(document.activeElement)) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`aside [role="listbox"] [data-i="${j}"]`)?.focus()
      )
    );
  };
  const x = (i: number) => (e.K() > 1 ? (i / (e.K() - 1)) * 100 : 50);
  return (
    <div
      ref={div => {
        rail = div;
        props.ref(div);
      }}
      class={styles.railDock}
      data-out={props.out ? "" : undefined}
      inert={props.out}
    >
      <div
        class={styles.rail}
        dir="ltr"
        role="listbox"
        aria-multiselectable="true"
        aria-label={t("Keyframes")}
      >
        <i class={styles.railLine} aria-hidden="true" />
        <For each={e.shownKeyframes()} keyed={false}>
          {(stop, i) => (
            <button
              type="button"
              role="option"
              class={styles.handle}
              data-held={e.held().includes(i) ? "" : undefined}
              aria-selected={e.held().includes(i) ? "true" : "false"}
              aria-label={t("Keyframe {number}, {hex}", { number: i + 1, hex: stop().hex })}
              tabindex={i === Math.max(0, e.lead()) ? 0 : -1}
              style={{ "--x": `${x(i).toFixed(2)}%`, "--c": stop().paint ?? stop().hex }}
              ref={tooltip(() =>
                t("Keyframe {number} · {hex}", { number: i + 1, hex: stop().hex })
              )}
              onKeyDown={event => {
                const d = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (!d) return;
                event.preventDefault();
                const j = Math.max(0, Math.min(e.K() - 1, i + d));
                handOn(j);
                e.pick(j, event.shiftKey ? "range" : "only");
                reveal();
              }}
              onPointerDown={event => {
                longed = false;
                if (event.pointerType === "touch") {
                  pressed = i;
                  hold.down(event);
                }
              }}
              onPointerMove={event => hold.move(event)}
              onPointerUp={event => {
                hold.up(event);
                pressed = -1;
              }}
              onPointerCancel={() => {
                hold.cancel();
                pressed = -1;
              }}
              onContextMenu={event => event.preventDefault()}
              onClick={event => {
                if (longed) {
                  longed = false;
                  return;
                }
                handOn(i);
                e.pick(
                  i,
                  event.shiftKey ? "range" : event.metaKey || event.ctrlKey ? "toggle" : "one"
                );
                reveal();
              }}
            />
          )}
        </For>
      </div>
    </div>
  );
}

/** The strip of the palette's colors: the first screen's foot, which comes up with the sheet and is the page's bar
    from there. */
function Strip(props: {
  editor: PaletteEditor;
  narrow: boolean;
  /** the held keyframes are marked on it, except while the rail beside it shows them */
  marked: boolean;
  onHeight: (height: number) => void;
  onCopy: () => void;
}) {
  const e = props.editor;
  let bar!: HTMLDivElement;
  const calm = createFlashGuard(e.shownStops, lights);
  onSettled(() => {
    const sizes = new ResizeObserver(() =>
      props.onHeight(Math.round(bar.getBoundingClientRect().height))
    );
    sizes.observe(bar);
    return () => sizes.disconnect();
  });
  const marks = () =>
    props.marked
      ? e.held().map(i => {
          const k = e.shownKeyframes()[i];
          return { t: e.K() > 1 ? i / (e.K() - 1) : 0.5, paint: k?.paint ?? k?.hex ?? "" };
        })
      : [];
  return (
    <div ref={bar} class={styles.bar}>
      <StopStrip
        stops={calm()}
        marks={marks()}
        reading={e.reading()}
        short={props.narrow}
        onCopy={props.onCopy}
      />
    </div>
  );
}

/** The side: the keyframes, the three axes and the actions, then the hex of a keyframe held alone. */
function Side(props: PageProps & { narrow: boolean }) {
  const e = props.editor;
  let side!: HTMLElement;
  let rows: HTMLDivElement | undefined;
  let acts: HTMLDivElement | undefined;
  const hex = () => e.shownKeyframes()[e.lead()]?.hex ?? "#000000";
  /* the stop a plot or the color solid is being read at, as the strip lifts it, said again at the hex line's end; the
     last one read stays while its line fades */
  const read = createMemo(() => {
    const at = e.reading();
    const list = e.shownStops();
    return at === null || !list.length ? null : list[stopNear(list.length, at)];
  });
  const [lastRead, setLastRead] = createSignal<ReturnType<typeof read>>(null);
  createEffect(read, stop => {
    if (stop) setLastRead(stop);
  });
  /* The plots share what the window leaves the side under its other rows, read from the rows themselves, so a plot's
     own height takes no part in it. In a window too low for the plots at their least the side scrolls its rows. */
  const [plotH, setPlotH] = createSignal(160);
  onSettled(() => {
    let frame = 0;
    const size = () => {
      frame = 0;
      if (props.narrow || !rows || !acts) return;
      const others = rows.offsetHeight + acts.offsetHeight - 3 * untrack(plotH);
      setPlotH(
        Math.max(PLOT_LEAST, Math.min(PLOT_MOST, Math.floor((side.clientHeight - others) / 3)))
      );
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(size);
    };
    const sizes = new ResizeObserver(soon);
    sizes.observe(side);
    if (rows) sizes.observe(rows);
    if (acts) sizes.observe(acts);
    soon();
    return () => {
      sizes.disconnect();
      cancelAnimationFrame(frame);
    };
  });
  const height = () => (props.narrow ? PLOT_FLOW : plotH());
  /* A field typed in on a touch screen beside the page: the keyboard takes the window's lower half, where most of the
     side's fields stand, and the side is pinned, so no scroll of the page brings one up. The side gives its rows room
     to rise and brings the field's row into the window's top third, as far as it needs; a field there already moves
     nothing. When typing ends the room goes and the rows stand where they stood. */
  let stood = -1;
  const lift = (event: FocusEvent) => {
    const field = event.target;
    if (
      props.narrow ||
      !(field instanceof HTMLInputElement) ||
      field.readOnly ||
      !matchMedia("(pointer: coarse)").matches
    )
      return;
    const row = (field.closest('[dir="ltr"]') ?? field).getBoundingClientRect();
    const by = Math.min(
      row.bottom - innerHeight * OVER_KEYS,
      row.top - side.getBoundingClientRect().top - LIFT_GAP
    );
    if (by <= 0) return;
    if (stood < 0) stood = side.scrollTop;
    side.style.setProperty("--typing", TYPING_ROOM);
    side.scrollTop += by;
  };
  const lower = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (stood < 0 || (next instanceof HTMLInputElement && !next.readOnly && side.contains(next)))
      return;
    side.style.removeProperty("--typing");
    side.scrollTop = stood;
    stood = -1;
  };
  /* Where the rows follow the strip they stand under the first screen, and each axis comes in a task of its own, so a
     phone answers between them; beside the page they come at once, as the reader sees them. */
  const [axes, setAxes] = createSignal(untrack(() => props.narrow) ? 0 : 3);
  onSettled(() => {
    if (untrack(axes) === 3) return;
    let shown = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      setAxes(++shown);
      if (shown < 3) timer = setTimeout(next, 0);
    };
    timer = setTimeout(next, 0);
    return () => clearTimeout(timer);
  });
  return (
    <aside
      ref={side}
      class={styles.side}
      data-narrow={props.narrow ? "" : undefined}
      aria-label={t("Editor")}
      onFocusIn={lift}
      onFocusOut={lower}
    >
      <div ref={rows} class={styles.rows}>
        <div class={styles.section}>
          <Keyframes
            stops={e.shownKeyframes()}
            selection={e.held()}
            lead={e.lead() >= 0 ? e.lead() : undefined}
            onPick={e.pick}
            onSweep={e.sweep}
            min={K_MIN}
            max={K_MAX}
            onAdd={() => e.addKeyframe()}
            onRemove={() => e.removeKeyframes()}
            removeLabel={t(e.multi() ? msg("Remove keyframes") : msg("Remove keyframe"))}
          />
        </div>
        <For each={(["l", "c", "h"] as const).slice(0, axes())}>
          {axis => (
            <div class={styles.section} data-ruled="">
              <AxisRow editor={e} axis={axis} height={height()} />
            </div>
          )}
        </For>
      </div>
      <div ref={acts} class={styles.section} data-ruled="">
        <Actions editor={e} save={props.save} />
        {/* the hex of a keyframe held alone; its line is kept while none is, so nothing moves */}
        <div class={styles.hexRoom}>
          <Show when={!e.whole() && !e.multi()}>
            <HexField
              quiet
              value={hex()}
              onCommit={value => e.setHex(value)}
              onPick={value => void e.setHex(value, false)}
              beside={() => (props.narrow ? undefined : side)}
            />
          </Show>
          <span
            class={styles.read}
            data-unread={read() ? undefined : ""}
            data-reading=""
            aria-hidden="true"
            dir="ltr"
          >
            <Show when={lastRead()}>
              {stop => (
                <>
                  <span
                    class={styles.readSwatch}
                    style={{ background: stop().paint ?? stop().hex }}
                  />
                  <span>{stop().hex}</span>
                </>
              )}
            </Show>
          </span>
        </div>
      </div>
    </aside>
  );
}
