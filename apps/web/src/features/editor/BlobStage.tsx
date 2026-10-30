import { type BlobView, blobSvg } from "@grabient/engine/blob.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { t } from "@grabient/i18n";
import { type BlobPlayer, playBlob } from "@grabient/ui/blob-player.ts";
import { createEffect, createSignal, onSettled, Show, untrack } from "solid-js";
import styles from "./BlobStage.module.css";

/* The picture's blob, loaded once the reader turns the blob on, so the editor's first load carries none of it. */

/** The picture while the blob plays: the still first frame drawn as vector at once, then the WebGL player over it,
    which fades in on its first frame and plays from there; where WebGL is missing the SVG plays itself. */
export function BlobStage(props: {
  palette: Palette;
  view: BlobView;
  class: string;
  style?: Record<string, string>;
}) {
  let host!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  const [box, setBox] = createSignal<{ width: number; height: number } | null>(null);
  const [live, setLive] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  let player: BlobPlayer | null = null;
  onSettled(() => {
    const sizes = new ResizeObserver(() => {
      if (host.clientWidth)
        setBox({ width: Math.round(host.clientWidth), height: Math.round(host.clientHeight) });
    });
    sizes.observe(host);
    player = playBlob(
      canvas,
      untrack(() => props.palette),
      untrack(() => props.view),
      () => setLive(true)
    );
    if (!player) setFailed(true);
    return () => {
      sizes.disconnect();
      player?.destroy();
      player = null;
    };
  });
  createEffect(
    () => [props.palette, props.view] as const,
    ([palette, view]) => {
      player?.set(palette, view);
    }
  );
  /* the vector frame, until the player's first; the moving SVG where there is no player */
  const svg = () => {
    const size = box();
    return size ? blobSvg(props.palette, { ...props.view, still: !failed() }, size, "") : "";
  };
  return (
    <div
      ref={host}
      class={props.class}
      style={props.style}
      role="img"
      aria-label={t("The animated blob")}
    >
      <Show when={!live()}>
        <div class={styles.still} innerHTML={svg()} />
      </Show>
      <canvas ref={canvas} class={styles.canvas} data-live={live() ? "" : undefined} />
    </div>
  );
}
