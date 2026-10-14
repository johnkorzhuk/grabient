import { gradientCss } from "@grabient/engine/css.ts";
import { STEPS_MIN, type Style } from "@grabient/engine/view.ts";
import { t } from "@grabient/i18n";
import { APPEARANCE_OPTIONS, Appearance, styleLabel } from "@grabient/ui/Appearance.tsx";
import { useLocation, useRouter, useSearch } from "@tanstack/solid-router";
import { createEffect, createSignal, onCleanup, untrack, useContext } from "solid-js";
import { rewriteInPlace, rewriteQuietly } from "../../app/navigation.ts";
import { RESTING } from "../../app/water.ts";
import { hexesOf } from "../../lib/palette.ts";
import {
  AppearanceContext,
  drawnIn,
  inOrder,
  type ListView,
  readListView,
  rememberView,
  returnedView,
  type ViewDraft,
  viewParams
} from "./appearance.ts";

/* The appearance control in the header's corner on every page that draws palettes as cards: style, steps and angle
   for every card and every mosaic tile at once, through the address, in place. Its swatch and tiles are painted with
   the page's first palette. Resting on a tile previews its style on every card; a press commits it. While Steps or
   Angle is dragged or stepped, the cards draw each value at once from the draft, the address follows quietly, and the
   route takes the value once the change rests or the menu closes: the route drives every link on the page, its
   metadata, the bar and the water, too much to rebuild on every pointer move. */

/** The address follows a change at most this often, and the route takes it once it has rested this long. */
const WRITE_MS = 350;
const REST_MS = 500;

export function ListAppearance() {
  const look = useContext(AppearanceContext)!;
  const router = useRouter();
  const location = useLocation();
  const search = useSearch({ strict: false });
  const [open, setOpen] = createSignal(false);
  const view = (): ListView => readListView(search() as Record<string, unknown>);
  const shown = (): ListView => ({ ...view(), ...look.draft() });
  /* the address with a view over the page's own, as the router writes it */
  const href = (patch: Partial<ListView>) =>
    router.buildLocation({
      to: location().pathname,
      search: (prev: Record<string, unknown>) => inOrder(prev, viewParams(patch))
    } as never).publicHref;

  /* the draft as a plain value too: a signal written now reads its old value until the write settles */
  let pending: ViewDraft | null = null;
  let since: string | null = null;
  let lastWrite = 0;
  let writeTimer: ReturnType<typeof setTimeout> | undefined;
  let restTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(writeTimer);
    clearTimeout(restTimer);
    writeTimer = restTimer = undefined;
  };
  const drop = () => {
    stop();
    since = null;
    if (pending) {
      pending = null;
      look.setDraft(null);
    }
  };
  /* the route takes the draft with this press's own change, and the draft goes. A draft set back to the route's own
     value leaves the route nothing to take, so the address is written here. */
  const go = (patch: Partial<ListView>) => {
    const held = pending;
    stop();
    since = null;
    pending = null;
    const to = href({ ...held, ...patch });
    if (held) rewriteQuietly(to);
    if (to !== location().publicHref)
      void router.navigate({ href: to, replace: true, resetScroll: false });
    if (held) look.setDraft(null);
  };
  const settle = () => {
    if (pending) go({});
  };
  const writeQuietly = () => {
    writeTimer = undefined;
    if (!pending) return;
    lastWrite = Date.now();
    rewriteQuietly(href(pending));
  };
  const change = (next: ViewDraft) => {
    since ??= location().href;
    pending = { ...pending, ...next };
    look.setDraft(pending);
    writeTimer ??= setTimeout(writeQuietly, Math.max(0, WRITE_MS - (Date.now() - lastWrite)));
    clearTimeout(restTimer);
    restTimer = setTimeout(settle, REST_MS);
  };
  /* the page left another way while a value waited (Back, Forward): the value stays with the page it was set on */
  createEffect(
    () => location().href,
    now => {
      if (since && now !== since) drop();
    }
  );
  /* the tab remembers the view this page is drawn in, for the next page that draws palettes. A list that Back or
     Forward returned to first takes the choices made since it was left, in the entry it has: its own address would
     otherwise put them out of the tab's memory */
  createEffect(view, own => {
    const taken = returnedView(own);
    // the address is read as it stands, as a press reads it
    if (taken) rewriteInPlace(untrack(() => href(taken)));
    else rememberView(own);
  });
  onCleanup(drop);

  const chosen = () => {
    const v = shown();
    return v.style !== "auto" || v.steps !== "auto" || v.angle !== "auto";
  };
  const reset = () => {
    look.setPeek(null);
    go({ style: "auto", steps: "auto", angle: "auto" });
  };
  /* the page's first palette as the list draws it; until the page has one, the resting colors at the chosen angle */
  const paint = (): { hexes: readonly string[]; style: Style; angle: number } => {
    const first = look.first();
    if (first) {
      const drawn = drawnIn(first, view(), look.draft());
      const hexes = hexesOf(drawn);
      if (hexes.length) return { hexes, style: drawn.style, angle: drawn.angle };
    }
    const v = shown();
    return {
      hexes: RESTING,
      style: v.style === "auto" ? "linearGradient" : v.style,
      angle: v.angle === "auto" ? 90 : v.angle
    };
  };
  const summary = () => {
    const v = shown();
    const parts: string[] = [];
    if (v.steps !== "auto")
      parts.push(t("{count, plural, one {# step} other {# steps}}", { count: v.steps }));
    if (v.angle !== "auto") parts.push(`${v.angle}°`);
    return parts.join(" · ");
  };
  const close = () => {
    look.setPeek(null);
    settle();
    setOpen(false);
  };
  return (
    <Appearance
      swatch={gradientCss(paint().hexes, look.peek() ?? paint().style, paint().angle)}
      label={styleLabel(view().style)}
      summary={summary()}
      open={open()}
      onToggle={() => {
        if (open()) close();
        else {
          look.setPeek(null);
          setOpen(true);
        }
      }}
      menu={{
        options: APPEARANCE_OPTIONS,
        auto: true,
        style: view().style,
        steps: shown().steps,
        angle: shown().angle,
        stepsMin: STEPS_MIN,
        bg: style => gradientCss(paint().hexes, style, paint().angle),
        onStyle: style => {
          look.setPeek(null);
          go({ style });
        },
        onSteps: steps => change({ steps }),
        onAngle: angle => change({ angle }),
        onPeek: look.setPeek,
        onReset: chosen() ? reset : undefined,
        onClose: close
      }}
    />
  );
}
