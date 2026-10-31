import type { EffectKind, EffectSettings } from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import { BlobArt } from "./BlobArt.tsx";
import { blobViewOf, loadBlob } from "./blob-draw.ts";
import styles from "./EffectArt.module.css";
import { GlassArt } from "./GlassArt.tsx";
import { loadStill } from "./glass-draw.ts";

/** How long the glass's canvas takes to fade out to its still, its frame held (EffectArt.module.css). */
const FADE_MS = 300;

interface Player {
  set(palette: Palette, view: unknown): void;
  destroy(): void;
}
/* a player and the canvas it draws in: each player has a canvas of its own, since one it lets go takes its WebGL
   context with it, and a canvas never has another */
interface Session {
  canvas: HTMLCanvasElement;
  player: Player;
}

const players = {
  glass: () => import("@grabient/ui/glass-player.ts"),
  blob: () => import("@grabient/ui/blob-player.ts")
};

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
   pointer leaving. A reader who asks for less motion keeps the still. */
export function EffectArt(props: {
  kind: EffectKind;
  palette: Palette;
  settings: EffectSettings;
  angle: number;
  /** the card is lit: under the pointer, or the keyboard's focus is in it */
  active: boolean;
}) {
  let holder!: HTMLSpanElement;
  const [reduced, setReduced] = createSignal(false);
  /* the player's frame covers the still */
  const [covered, setCovered] = createSignal(false);
  /* the glass's canvas is fading out to the still */
  const [fading, setFading] = createSignal(false);
  const bare = () => props.kind === "blob" && props.settings.look.bg === null;
  onSettled(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(motion.matches);
    read();
    motion.addEventListener("change", read);
    /* the players' code, while the page idles */
    const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 200));
    idle(() => void players[untrack(() => props.kind)]().catch(() => {}));
    return () => motion.removeEventListener("change", read);
  });
  const moving = () => props.active && props.settings.speed > 0 && !reduced();
  const view = () =>
    props.kind === "glass"
      ? { speed: props.settings.speed, fps: props.settings.fps, angle: props.angle }
      : blobViewOf(props.settings);
  let session: Session | null = null;
  let leaving: (Session & { timer: ReturnType<typeof setTimeout> }) | null = null;
  /* a start whose code is still on its way when the card goes dark again makes no player */
  let wanted = false;
  const end = (s: Session) => {
    s.player.destroy();
    s.canvas.remove();
  };
  const stop = () => {
    wanted = false;
    setCovered(false);
    const going = session;
    session = null;
    if (!going) return;
    if (props.kind === "blob") return end(going);
    /* the glass holds its frame and fades out to its still: two pictures that stand still meet, never a moving one */
    going.player.set(
      untrack(() => props.palette),
      { ...untrack(view), speed: 0 }
    );
    setFading(true);
    const timer = setTimeout(() => {
      if (leaving?.timer !== timer) return;
      end(leaving);
      leaving = null;
      setFading(false);
    }, FADE_MS);
    leaving = { ...going, timer };
  };
  const start = async () => {
    wanted = true;
    if (session) return;
    /* lit again while the glass fades out: that player plays on */
    if (leaving) {
      clearTimeout(leaving.timer);
      session = { canvas: leaving.canvas, player: leaving.player };
      leaving = null;
      setFading(false);
      session.player.set(
        untrack(() => props.palette),
        untrack(view)
      );
      setCovered(true);
      return;
    }
    const kind = props.kind;
    const code = await players[kind]();
    if (!wanted || session || leaving) return;
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
    made = { canvas, player };
    session = made;
  };
  createEffect(moving, on => {
    if (on) void start();
    else stop();
  });
  createEffect(
    () => [props.palette, view()] as const,
    ([palette, v]) => session?.player.set(palette, v)
  );
  onCleanup(() => {
    wanted = false;
    if (session) end(session);
    if (leaving) {
      clearTimeout(leaving.timer);
      end(leaving);
    }
    session = null;
    leaving = null;
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
        <GlassArt colors={glassColors(props.palette)} angle={props.angle} eager />
      ) : (
        <BlobArt palette={props.palette} settings={props.settings} bare={bare()} />
      )}
    </span>
  );
}
