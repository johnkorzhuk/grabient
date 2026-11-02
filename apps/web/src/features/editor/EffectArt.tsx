import type { EffectKind, EffectSettings } from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { holdsStill, reducesNow } from "@grabient/ui/motion.ts";
import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { BlobArt } from "./BlobArt.tsx";
import { blobViewOf, loadBlob } from "./blob-draw.ts";
import styles from "./EffectArt.module.css";
import { GlassArt } from "./GlassArt.tsx";
import { loadStill } from "./glass-draw.ts";

/** How long the glass's canvas takes to fade out to its still, its frame held (EffectArt.module.css). */
const FADE_MS = 300;

interface Player {
  set(palette: Palette, view: unknown): void;
  rewind(): void;
  destroy(): void;
}
/* a player and the canvas it draws in: each player has a canvas of its own, since one it lets go takes its WebGL
   context with it, and a canvas never has another. It keeps what it plays: a player let go is held at that and kept
   for its kind, read from here, since the picture that named them may be gone with its holder */
interface Session {
  canvas: HTMLCanvasElement;
  player: Player;
  kind: EffectKind;
  palette: Palette;
  view: object;
  /** made ahead and never laid out: it takes the size of the card it goes to */
  fresh?: boolean;
}

/* the players are the browser's alone: the server's build carries neither */
/* Players let go, kept for the next card: a player's WebGL context and programs cost about a tenth of a second on the
   page's thread, which every hover paid. One let go waits here, its loop stopped, its canvas off the page, and the next
   card of its size lit takes it: on to its own picture, back to the first frame, which is that card's still, with that
   card's palette and view. Two of each kind at most, for a glass fading out as the next card lights. */
const POOL = 2;
const pool: Record<EffectKind, Session[]> = { glass: [], blob: [] };
/** A player kept for a box this size in device pixels, or one made ahead, taken out of the pool; none where none
    fits. */
function pooled(kind: EffectKind, width: number, height: number): Session | null {
  const dpr = devicePixelRatio || 1;
  const at = pool[kind].findIndex(
    s =>
      s.fresh ||
      (Math.abs(s.canvas.width - Math.round(width * dpr)) <= 2 &&
        Math.abs(s.canvas.height - Math.round(height * dpr)) <= 2)
  );
  const s = at < 0 ? null : (pool[kind].splice(at, 1)[0] ?? null);
  if (s) s.fresh = false;
  return s;
}
/** A player let go, its canvas off the page so it never shows under another's frame: kept for the next card where
    there is room, its loop stopped; otherwise gone with its context. */
function release(s: Session): void {
  s.canvas.remove();
  if (pool[s.kind].length < POOL) pool[s.kind].push(s);
  else s.player.destroy();
}

const players = {
  glass: () =>
    import.meta.env.SSR ? (new Promise(() => {}) as never) : import("@grabient/ui/glass-player.ts"),
  blob: () =>
    import.meta.env.SSR ? (new Promise(() => {}) as never) : import("@grabient/ui/blob-player.ts")
};

/* One player of the kind the cards play, made ahead as the page idles once its still is painted (painted.ts), where a
   pointer can light a card: the first card lit takes it from the pool, so no hover waits on making a WebGL context,
   some tens of milliseconds on the page's thread and its first extension as long again. Its canvas is off the page,
   never laid out, held at its first frame, its drawing buffer already the size of the card that asked; the first card
   it goes to lays it out. */
const readied: Partial<Record<EffectKind, true>> = {};
async function makeAhead(
  kind: EffectKind,
  palette: Palette,
  view: object,
  size: { width: number; height: number }
): Promise<void> {
  if (readied[kind] || pool[kind].length || !matchMedia("(hover: hover)").matches) return;
  readied[kind] = true;
  if (import.meta.env.SSR) return;
  await (await import("./painted.ts")).stillPainted();
  const code = await players[kind]();
  if (pool[kind].length) return;
  const canvas = document.createElement("canvas");
  canvas.className = styles.canvas;
  /* the cards' size in device pixels, as a player measures it: its buffer made now, not under the pointer */
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(size.width * dpr));
  canvas.height = Math.max(1, Math.round(size.height * dpr));
  const player =
    "playGlass" in code
      ? code.playGlass(canvas, palette, view as Parameters<typeof code.playGlass>[2], undefined, {
          ease: false
        })
      : code.playBlob(canvas, palette, view as Parameters<typeof code.playBlob>[2], undefined, {
          ease: false
        });
  if (player) release({ canvas, player, kind, palette, view, fresh: true });
}

/** Everything a card's picture of an effect needs, fetched before a card asks: its players' code and its still's. */
export function preloadEffectArt(kind: EffectKind): void {
  void players[kind]().catch(() => {});
  void (kind === "glass" ? loadStill() : loadBlob()).catch(() => {});
}

/* An effect's picture in a palette's card or a tile of the sheet: its still, the one the Appearance menu's tile shows
   (GlassArt, BlobArt), and only while the card is lit and the effect moves, its WebGL player over it, from that very
   frame and at its pace at once. A player is made as the pointer or the focus arrives, in a canvas of its own, and let
   go as it leaves, so a list of these holds no WebGL context at rest. Its first frame is the still's, so the canvas
   takes the still's place in one frame. Leaving, the blob's still is back in one frame; the glass holds its frame and
   fades out to its still, and a card lit again meanwhile takes that player back. A blob with no ground of its own
   stands on the list with none (`bare`). Nothing in the picture takes the pointer, so the swap never reads as the
   pointer leaving. A reader who asks for less motion (Settings, else the device: ui/motion.ts) keeps the still, and one
   who asks for it while a card plays stops it there. */
export function EffectArt(props: {
  kind: EffectKind;
  palette: Palette;
  settings: EffectSettings;
  angle: number;
  /** the card is lit: under the pointer, or the keyboard's focus is in it */
  active: boolean;
}) {
  let holder!: HTMLSpanElement;
  /* the player's frame covers the still */
  const [covered, setCovered] = createSignal(false);
  /* the glass's canvas is fading out to the still */
  const [fading, setFading] = createSignal(false);
  const bare = () => props.kind === "blob" && props.settings.look.bg === null;
  /* the players' code while the page idles, and a player made ahead for the first card lit, of each kind the card
     plays: a list turned from the glass to the blob makes one of the blob. None for a picture gone or turned
     meanwhile, whose props are gone with it */
  createEffect(
    () => props.kind,
    kind => {
      const ready = () => {
        void players[kind]().catch(() => {});
        /* one card of a list makes it, the others reading no layout for it; a card the layout hides has no size to
           make one at, and a reader who asks for less motion, whose cards never play, gets none */
        if (readied[kind] || untrack(() => props.settings.speed) === 0 || reducesNow()) return;
        const box = holder.getBoundingClientRect();
        if (box.width && box.height)
          void makeAhead(
            kind,
            untrack(() => props.palette),
            { ...untrack(view), speed: 0 },
            box
          ).catch(() => {});
      };
      if (typeof requestIdleCallback === "function") {
        const id = requestIdleCallback(ready);
        return () => cancelIdleCallback(id);
      }
      const timer = setTimeout(ready, 200);
      return () => clearTimeout(timer);
    }
  );
  /* the glass's colors once a palette: the still reads them again with every change of the view */
  const colors = createMemo(() => glassColors(props.palette));
  const moving = () => props.active && props.settings.speed > 0 && !holdsStill();
  const view = () =>
    props.kind === "glass"
      ? {
          speed: props.settings.speed,
          fps: props.settings.fps,
          angle: props.angle,
          shape: props.settings.look.shape
        }
      : blobViewOf(props.settings);
  let session: Session | null = null;
  let leaving: (Session & { timer: ReturnType<typeof setTimeout> }) | null = null;
  /* a start whose code is still on its way when the card goes dark again makes no player */
  let wanted = false;
  /* a card the layout hides has no box to play in */
  const sized = () => holder.clientWidth > 0 && holder.clientHeight > 0;
  const play = (s: Session, palette: Palette, v: object) => {
    s.palette = palette;
    s.view = v;
    s.player.set(palette, v);
  };
  /* held at its frame: no loop runs at speed 0 */
  const hold = (s: Session) => s.player.set(s.palette, { ...s.view, speed: 0 });
  /* a player let go is kept for the next card, held at its frame */
  const end = (s: Session) => {
    hold(s);
    release(s);
  };
  /* the glass fading out, let go at once */
  const drop = () => {
    if (!leaving) return;
    clearTimeout(leaving.timer);
    end(leaving);
    leaving = null;
  };
  /* `now`: the picture turned to the other kind, whose still stands in at once */
  const stop = (now = false) => {
    wanted = false;
    setCovered(false);
    const going = session;
    session = null;
    if (!going) return;
    if (now || going.kind === "blob") return end(going);
    /* the glass holds its frame and fades out to its still: two pictures that stand still meet, never a moving one */
    hold(going);
    setFading(true);
    const timer = setTimeout(() => {
      if (leaving?.timer !== timer) return;
      drop();
      setFading(false);
    }, FADE_MS);
    leaving = { ...going, timer };
  };
  const start = async () => {
    wanted = true;
    if (session) return;
    const kind = untrack(() => props.kind);
    /* lit again while the glass fades out: that player plays on */
    if (leaving?.kind === kind) {
      clearTimeout(leaving.timer);
      const back: Session = leaving;
      session = back;
      leaving = null;
      setFading(false);
      play(
        back,
        untrack(() => props.palette),
        untrack(view)
      );
      setCovered(true);
      return;
    }
    /* one of the other kind goes at once */
    if (leaving) {
      drop();
      setFading(false);
    }
    if (!sized()) return;
    /* a player kept from another card of this size: on to this one, from this card's first frame */
    const kept = pooled(kind, holder.clientWidth, holder.clientHeight);
    if (kept) {
      holder.append(kept.canvas);
      kept.player.rewind();
      play(
        kept,
        untrack(() => props.palette),
        untrack(view)
      );
      const taken = kept;
      session = taken;
      /* its frame for this card is drawn in the next one: the canvas shows from the one after */
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (wanted && session === taken) setCovered(true);
        })
      );
      return;
    }
    const code = await players[kind]();
    /* the card went dark, turned to the other kind or lost its box while the code came */
    if (
      !wanted ||
      session ||
      leaving?.kind === kind ||
      untrack(() => props.kind) !== kind ||
      !sized()
    )
      return;
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    holder.append(canvas);
    const P = untrack(() => props.palette);
    const v = untrack(view);
    let made: Session | null = null;
    const drawn = () =>
      requestAnimationFrame(() => {
        if (wanted && made && session === made) setCovered(true);
      });
    const player =
      "playGlass" in code
        ? code.playGlass(canvas, P, v as Parameters<typeof code.playGlass>[2], drawn, {
            ease: false
          })
        : code.playBlob(canvas, P, v as Parameters<typeof code.playBlob>[2], drawn, {
            ease: false
          });
    /* where WebGL is missing the still stays */
    if (!player) return canvas.remove();
    made = { canvas, player, kind, palette: P, view: v };
    session = made;
  };
  /* the kind it plays, while it moves: a picture turned to the other kind lets its player go and plays the other */
  createEffect(
    () => (moving() ? props.kind : null),
    kind => {
      if (!kind) stop();
      else if (session && session.kind !== kind) stop(true);
      if (kind) void start();
    }
  );
  createEffect(
    () => [props.kind, props.palette, view()] as const,
    ([kind, palette, v]) => {
      if (session?.kind === kind) play(session, palette, v);
    }
  );
  onCleanup(() => {
    wanted = false;
    if (session) end(session);
    session = null;
    drop();
  });
  return (
    <span
      ref={holder}
      class={styles.art}
      data-kind={props.kind}
      data-bare={bare() ? "" : undefined}
      data-covered={covered() ? "" : undefined}
      data-fading={fading() ? "" : undefined}
    >
      {props.kind === "glass" ? (
        <GlassArt colors={colors()} angle={props.angle} shape={props.settings.look.shape} eager />
      ) : (
        <BlobArt palette={props.palette} settings={props.settings} bare={bare()} />
      )}
    </span>
  );
}
