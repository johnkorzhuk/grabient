import type { AnyRouter } from "@tanstack/solid-router";
import { expect, onTestFinished, test, vi } from "vitest";
import { afterPress } from "./after-press.ts";

/** A router as far as `afterPress` reads it, in a browser whose frames the test draws: `made` lists the moves the
    router's own start was handed, in order. */
function stage() {
  vi.useFakeTimers();
  const frames: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => frames.push(run));
  onTestFinished(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const made: string[] = [];
  const own = vi.fn(async (options: { href?: string }) => {
    made.push(String(options.href));
    return "made";
  });
  const router = { navigate: own } as unknown as AnyRouter;
  const leave = afterPress(router);
  /* a frame begins, is drawn, and the turn after it runs */
  const draw = async () => {
    for (const run of frames.splice(0)) run();
    await vi.advanceTimersByTimeAsync(0);
  };
  const settle = () => vi.advanceTimersByTimeAsync(0);
  return { router, own, made, draw, settle, leave };
}

test("a move to another page starts once the frame after its press is drawn", async () => {
  const { router, made, draw, settle } = stage();
  const moved = router.navigate({ href: "/collections" });
  await settle();
  expect(made).toEqual([]);
  await draw();
  expect(made).toEqual(["/collections"]);
  // the caller is answered as the router's own start answers
  await expect(moved).resolves.toBe("made");
});

test("an address rewritten in place goes at once", async () => {
  const { router, made } = stage();
  void router.navigate({ href: "/?q=blue", replace: true });
  expect(made).toEqual(["/?q=blue"]);
});

test("what is asked first is made first: a rewrite asked while a move waits follows it", async () => {
  const { router, made, draw, settle } = stage();
  void router.navigate({ href: "/blue-gradients" });
  void router.navigate({ href: "/blue-gradients?view=swatches", replace: true });
  void router.navigate({ href: "/blue-gradients/rising" });
  await settle();
  expect(made).toEqual([]);
  // the first move's frame: the move, then the rewrite that waited on nothing but the move
  await draw();
  expect(made).toEqual(["/blue-gradients", "/blue-gradients?view=swatches"]);
  // the second move waits for a frame of its own
  await draw();
  expect(made).toEqual([
    "/blue-gradients",
    "/blue-gradients?view=swatches",
    "/blue-gradients/rising"
  ]);
  // nothing waits now, so a rewrite goes at once again
  void router.navigate({ href: "/blue-gradients/rising?view=swatches", replace: true });
  expect(made).toHaveLength(4);
});

test("in a tab that draws no frame a move goes a tenth of a second on", async () => {
  const { router, made } = stage();
  void router.navigate({ href: "/palettes" });
  await vi.advanceTimersByTimeAsync(99);
  expect(made).toEqual([]);
  await vi.advanceTimersByTimeAsync(1);
  expect(made).toEqual(["/palettes"]);
});

test("the way back gives the router its own start again", () => {
  const { router, own, leave } = stage();
  expect(router.navigate).not.toBe(own);
  leave();
  expect(router.navigate).toBe(own);
});
