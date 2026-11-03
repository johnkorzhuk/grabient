/* The papercut behind any page: `<script src="https://grabient.com/{seed}.js?style=papercut" async></script>`
   (mount.ts). Built into one classic script by build.ts, which the Worker serves at /{seed}.js?style=papercut. Its
   still is the stylesheet's (engine/fx-still.ts fxStillBackground), its shadows stepped, drawn by the papercut's writer
   alone; the canvas fades in over it with the shadows soft, the player's exact first frame. Where the page paints no
   still, the script draws it a share at a time: its cuts take some 20 ms to trace on a desktop and four times that on
   a phone (engine/papercut-svg.ts), which in one task would hold the page as it loads. */
import { FX_STILL_SIDE, fxCover } from "@grabient/engine/fx-still.ts";
import { papercutSceneSteps } from "@grabient/engine/papercut.ts";
import { papercutStillSteps } from "@grabient/engine/papercut-svg.ts";
import { playPapercut } from "@grabient/ui/papercut-player.ts";
import { mount } from "./mount.ts";

/** How long a share of the still's drawing holds the page's thread, as a list's cards share a frame (FxArt.tsx). */
const SHARE_MS = 6;

/* the page's thread given back for a moment: a message to itself, which no timer's clamp delays */
const handBack = (): Promise<void> =>
  new Promise(resolve => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });

/* the steps taken a share at a time, the thread handed back between shares */
async function inShares<T>(steps: Generator<void, T>): Promise<T> {
  for (let end = performance.now() + SHARE_MS; ; ) {
    const step = steps.next();
    if (step.done) return step.value;
    if (performance.now() > end) {
      await handBack();
      end = performance.now() + SHARE_MS;
    }
  }
}

mount({
  kind: "papercut",
  still: async (P, effect, angle) => {
    const scene = await inShares(
      papercutSceneSteps(
        P,
        { angle, shape: effect.look.shape },
        { width: FX_STILL_SIDE, height: FX_STILL_SIDE }
      )
    );
    return fxCover(await inShares(papercutStillSteps(scene)));
  },
  play: (canvas, P, effect, angle, drawn, reduced) =>
    playPapercut(
      canvas,
      P,
      { angle, shape: effect.look.shape, speed: effect.speed, fps: effect.fps },
      drawn,
      { reduced }
    )
});
