import type { EffectKind, EffectSettings } from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import { BlobArt } from "./BlobArt.tsx";
import { blobViewOf } from "./blob-draw.ts";
import styles from "./EffectArt.module.css";
import { GlassArt } from "./GlassArt.tsx";

/** How long the glass's canvas takes to fade in over its still and out again (EffectArt.module.css). */
const FADE_MS = 700;

interface Player {
  set(palette: Palette, view: unknown): void;
  destroy(): void;
}

const players = {
  glass: () => import("@grabient/ui/glass-player.ts"),
  blob: () => import("@grabient/ui/blob-player.ts")
};

/* An effect's picture in a palette's card or a tile of the sheet: its still, the one the Appearance menu's tile shows
   (GlassArt, BlobArt), and only while the card is lit and the effect moves, its WebGL player over it from that very
   frame, at its pace at once. The player is made as the pointer or the focus arrives and let go as it leaves, so a list
   of these holds no WebGL context at rest and a screen of them costs what its stills cost; its code is fetched while
   the page idles, so the first card lit plays at once. The glass's canvas fades in over its still and out again to it;
   the blob's canvas is clear around the blob, so it and its still change places in one frame, and leaving shows the
   still again, the first frame. A blob with no ground of its own stands on the list with none (`bare`). Nothing in the
   picture takes the pointer, so the swap never reads as the pointer leaving. A reader who asks for less motion keeps
   the still. */
export function EffectArt(props: {
  kind: EffectKind;
  palette: Palette;
  settings: EffectSettings;
  angle: number;
  /** the card is lit: under the pointer, or the keyboard's focus is in it */
  active: boolean;
}) {
  let canvas!: HTMLCanvasElement;
  const [reduced, setReduced] = createSignal(false);
  /* the player's frame covers the still */
  const [covered, setCovered] = createSignal(false);
  const bare = () => props.kind === "blob" && props.settings.look.bg === null;
  onSettled(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(motion.matches);
    read();
    motion.addEventListener("change", read);
    /* the player's code, while the page idles */
    const idle = window.requestIdleCallback ?? ((run: () => void) => setTimeout(run, 200));
    idle(() => void players[untrack(() => props.kind)]().catch(() => {}));
    return () => motion.removeEventListener("change", read);
  });
  const moving = () => props.active && props.settings.speed > 0 && !reduced();
  const view = () =>
    props.kind === "glass"
      ? { speed: props.settings.speed, fps: props.settings.fps, angle: props.angle }
      : blobViewOf(props.settings);
  let player: Player | null = null;
  /* a start whose code is still on its way when the card goes dark again makes no player */
  let wanted = false;
  let letting: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    wanted = false;
    setCovered(false);
    clearTimeout(letting);
    const going = player;
    player = null;
    if (!going) return;
    /* the glass fades out to its still first; the blob's still is back in the same frame */
    if (props.kind === "glass") letting = setTimeout(() => going.destroy(), FADE_MS);
    else going.destroy();
  };
  const start = async () => {
    wanted = true;
    clearTimeout(letting);
    if (player) return;
    const P = untrack(() => props.palette);
    const v = untrack(view);
    const drawn = () => requestAnimationFrame(() => wanted && setCovered(true));
    if (props.kind === "glass") {
      const { playGlass } = await players.glass();
      if (!wanted || player) return;
      player = playGlass(canvas, P, v as Parameters<typeof playGlass>[2], drawn, { ease: false });
    } else {
      const { playBlob } = await players.blob();
      if (!wanted || player) return;
      player = playBlob(canvas, P, v as Parameters<typeof playBlob>[2], drawn, { ease: false });
    }
  };
  createEffect(moving, on => {
    if (on) void start();
    else stop();
  });
  createEffect(
    () => [props.palette, view()] as const,
    ([palette, v]) => player?.set(palette, v)
  );
  onCleanup(() => {
    wanted = false;
    clearTimeout(letting);
    player?.destroy();
    player = null;
  });
  return (
    <span
      class={styles.art}
      data-kind={props.kind}
      data-bare={bare() ? "" : undefined}
      data-covered={covered() ? "" : undefined}
    >
      {props.kind === "glass" ? (
        <GlassArt colors={glassColors(props.palette)} angle={props.angle} />
      ) : (
        <BlobArt palette={props.palette} settings={props.settings} bare={bare()} />
      )}
      <canvas ref={canvas} class={styles.canvas} />
    </span>
  );
}
