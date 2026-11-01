import { decodePalette } from "@grabient/engine/codec.ts";
import { gradientCss } from "@grabient/engine/css.ts";
import {
  EFFECT_LOOK,
  EFFECT_PLAY,
  EFFECTS,
  type Effect,
  type EffectKind
} from "@grabient/engine/effect.ts";
import { STEPS_MIN, type Style } from "@grabient/engine/view.ts";
import { t } from "@grabient/i18n";
import {
  APPEARANCE_OPTIONS,
  Appearance,
  type ExtraTile,
  styleLabel
} from "@grabient/ui/Appearance.tsx";
import { BRAND_SUPPLY } from "@grabient/ui/supply.ts";
import { useLocation, useRouter, useSearch } from "@tanstack/solid-router";
import {
  createEffect,
  createSignal,
  Loading,
  lazy,
  onCleanup,
  Show,
  untrack,
  useContext
} from "solid-js";
import { rewriteInPlace, rewriteQuietly } from "../../app/navigation.ts";
import { RESTING } from "../../app/water.ts";
import { hexesOf } from "../../lib/palette.ts";
import { effectLabel, effectSummary } from "../editor/effect-page.ts";
import {
  AppearanceContext,
  cardEffect,
  drawnIn,
  inOrder,
  type ListView,
  readListView,
  rememberView,
  returnedView,
  shownEffect,
  type ViewDraft,
  viewParams
} from "./appearance.ts";

/* The appearance control in the header's corner on every page that draws palettes as cards: style, steps and angle
   for every card and every mosaic tile at once, or an effect every card plays (the fluted glass, the blob) with its
   angle and how it plays, through the address, in place. Its swatch and tiles are painted with the page's first
   palette. Resting on a style's tile previews it on every card; a press commits it. While a field is dragged or
   stepped, the cards draw each value at once from the draft, the address follows quietly, and the route takes the
   value once the change rests or the menu closes: the route drives every link on the page, its metadata, the bar and
   the water, too much to rebuild on every pointer move. Each way of drawing keeps what it had while another shows:
   the steps an effect took the place of, and each effect's pace and look, for this document. */

/** The address follows a change at most this often, and the route takes it once it has rested this long. */
const WRITE_MS = 350;
const REST_MS = 500;

/* the effects' pictures come with the menu or an effect, and their fields as they show, never with a list's start: by
   their exports' names, so a page the server drew hydrates them as it stands */
const EffectSwatch = lazy(() => import("./ListEffects.tsx"), { export: "EffectSwatch" });
const EffectFields = lazy(() => import("./ListFields.tsx"), { export: "EffectFields" });

/* what each way of drawing had as the reader turned to another */
const kept: { steps: ListView["steps"]; effects: Partial<Record<EffectKind, Effect>> } = {
  steps: "auto",
  effects: {}
};

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
    return v.style !== "auto" || v.steps !== "auto" || v.angle !== "auto" || v.effect !== null;
  };
  const reset = () => {
    look.setPeek(null);
    kept.steps = "auto";
    kept.effects = {};
    go({ style: "auto", steps: "auto", angle: "auto", effect: null });
  };
  /* a style chosen leaves the effect, and gives back the steps it took the place of */
  const chooseStyle = (style: ListView["style"]) => {
    look.setPeek(null);
    const playing = view().effect;
    if (!playing) return go({ style });
    kept.effects[playing.kind] = playing;
    go({ style, effect: null, steps: kept.steps });
  };
  /* an effect chosen takes the steps' place, as it had it; chosen again it lets go, as a style's tile does */
  const chooseEffect = (kind: EffectKind) => {
    const v = view();
    if (v.effect?.kind === kind) return chooseStyle("auto");
    if (v.effect) kept.effects[v.effect.kind] = v.effect;
    else kept.steps = v.steps;
    go({
      style: "auto",
      steps: "auto",
      effect: kept.effects[kind] ?? { kind, ...EFFECT_PLAY, look: EFFECT_LOOK }
    });
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
  /* the effect the cards show, and the page's first palette playing it in its own shape, or until the page has one
     the resting colors': the header's swatch and the effects' tiles, each made once and following what it shows */
  const playing = () => shownEffect(view(), look.draft(), look.peek());
  const still = (effect: () => Effect | null, gpu?: boolean) => (
    <Show
      when={(() => {
        const seed = look.first()?.seed ?? BRAND_SUPPLY[0]!;
        const P = decodePalette(seed);
        const fx = effect();
        return P && fx ? { palette: P, effect: cardEffect(fx, seed) } : null;
      })()}
    >
      {shown => (
        <Loading>
          <EffectSwatch
            effect={shown().effect}
            palette={shown().palette}
            angle={paint().angle}
            gpu={gpu}
          />
        </Loading>
      )}
    </Show>
  );
  const swatchArt = still(playing);
  /* the menu's own are made as it opens, which only the browser draws: made with the header they would be claimed
     from the server's page, which holds none of them */
  const extras: readonly ExtraTile[] = EFFECTS.map(kind => ({
    key: kind,
    label: effectLabel(kind),
    get art() {
      return still(
        () => {
          const effect = view().effect;
          return effect?.kind === kind
            ? effect
            : (kept.effects[kind] ?? { kind, ...EFFECT_PLAY, look: EFFECT_LOOK });
        },
        /* the GPU's still only where the page plays the glass, whose context its cards made already */
        untrack(view).effect?.kind === "glass"
      );
    },
    get chosen() {
      return view().effect?.kind === kind;
    },
    onChoose: () => chooseEffect(kind),
    /* resting on it lets a style's preview go, and makes the cards' pictures of it ready */
    onPeek: () => {
      look.setPeek(null);
      void import("./card-effect.tsx").then(m => m.preloadCardEffects(kind));
    }
  }));
  /* a field's value goes to the cards as the address keeps it: a step of 0.05 from 1 is 0.95, not 0.9500000000000001 */
  const fields = () => (
    <Loading>
      <Show when={shown().effect}>
        {effect => (
          <EffectFields
            effect={effect()}
            angle={shown().angle}
            onAngle={angle => change({ angle })}
            onEffect={next => change({ effect: readListView(viewParams({ effect: next })).effect })}
          />
        )}
      </Show>
    </Loading>
  );
  const summary = () => {
    const v = shown();
    if (v.effect) return effectSummary(v.effect, v.angle === "auto" ? null : v.angle);
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
      swatch={
        playing()
          ? "transparent"
          : gradientCss(paint().hexes, look.peek() ?? paint().style, paint().angle)
      }
      swatchArt={swatchArt}
      label={view().effect ? effectLabel(view().effect!.kind) : styleLabel(view().style)}
      summary={summary()}
      open={open()}
      onToggle={() => {
        if (open()) close();
        else {
          look.setPeek(null);
          /* the effects' tiles and both stills' code, so the tiles are painted as the menu shows */
          void import("./ListEffects.tsx").then(
            m => m.preloadStills(),
            () => {}
          );
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
        onStyle: chooseStyle,
        onSteps: steps => change({ steps }),
        onAngle: angle => change({ angle }),
        onPeek: look.setPeek,
        onReset: chosen() ? reset : undefined,
        extras,
        get extraFields() {
          return fields();
        },
        onClose: close
      }}
    />
  );
}
