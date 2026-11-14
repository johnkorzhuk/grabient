import type { FxTraceAsk } from "@grabient/engine/fx-still.ts";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TraceSaid } from "./fx-trace.ts";

/* The stills' worker as the page's thread runs it: one for the page, started by the first card that needs it, one ask
   in it at a time, each card at a view told once its threads are kept, and the page tracing for itself wherever no
   worker can. The worker's own side is the engine's (strings.test.ts: what it traces writes the page's still). */

/* a worker as the page sees one: what it is asked, whether it is ended, and what it says or how it fails; a browser
   without module workers refuses to make one */
class Made extends EventTarget {
  static all: Made[] = [];
  static refused = false;
  readonly url: URL;
  readonly options: WorkerOptions;
  asked: FxTraceAsk[] = [];
  ended = false;
  constructor(url: URL, options: WorkerOptions) {
    super();
    if (Made.refused)
      throw new TypeError("Module scripts are not supported on DedicatedWorker yet");
    this.url = url;
    this.options = options;
    Made.all.push(this);
  }
  postMessage(data: FxTraceAsk) {
    this.asked.push(data);
  }
  terminate() {
    this.ended = true;
  }
  say(said: TraceSaid) {
    this.dispatchEvent(new MessageEvent("message", { data: said }));
  }
  /* its script did not load: no connection, or a deploy since retired it */
  unloaded() {
    this.dispatchEvent(new Event("error", { cancelable: true }));
  }
}

const ask = (angle: number): FxTraceAsk => ({
  kind: "strings",
  key: `${angle}|0|1000|1000`,
  palette: { anchors: [] },
  view: { angle, shape: null, bg: null },
  size: { width: 1000, height: 1000 }
});
const THREADS: [number, string][] = [
  [-3, "M1 2l3 4"],
  [5, "M5 6c1 1 2 2 3 3"]
];

/* the module afresh: one worker for a page, so each test is a page of its own */
const page = async () => {
  vi.resetModules();
  return import("./fx-trace.ts");
};
/* a card waiting on a view: what it was told, and what kept the threads */
const card = () => {
  const card = { told: 0, kept: [] as [number, string][][] };
  return {
    card,
    keep: (threads: [number, string][]) => card.kept.push(threads),
    tell: () => card.told++
  };
};

beforeEach(() => {
  vi.stubGlobal("Worker", Made);
  Made.all = [];
  Made.refused = false;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

test("one worker for the page traces one view at a time, the first asked first, and every card at it is told once its threads are kept", async () => {
  const { traceAway } = await page();
  const a1 = card();
  const a2 = card();
  const b = card();
  expect(traceAway(ask(90), a1.keep, a1.tell)).toBeTypeOf("function");
  expect(traceAway(ask(90), a2.keep, a2.tell)).toBeTypeOf("function");
  expect(traceAway(ask(45), b.keep, b.tell)).toBeTypeOf("function");
  expect(Made.all).toHaveLength(1);
  const [worker] = Made.all;
  expect(worker.options).toEqual({ type: "module", name: "Stills" });
  expect(worker.url.pathname).toMatch(/\/still-worker\.ts$/);
  /* one ask in it at a time */
  expect(worker.asked).toEqual([ask(90)]);
  worker.say({ key: ask(90).key, threads: THREADS });
  /* kept once, both cards told, and the next ask sent */
  expect(a1.card.kept).toEqual([THREADS]);
  expect(a2.card.kept).toEqual([]);
  expect([a1.card.told, a2.card.told, b.card.told]).toEqual([1, 1, 0]);
  expect(worker.asked).toEqual([ask(90), ask(45)]);
  /* a trace that failed in the worker keeps nothing, and its card traces on the page */
  worker.say({ key: ask(45).key, threads: null });
  expect(b.card.kept).toEqual([]);
  expect(b.card.told).toBe(1);
  expect(worker.asked).toHaveLength(2);
  expect(worker.ended).toBe(false);
});

test("an ask no card waits for any more is never sent, and one in the worker is kept for the next card", async () => {
  const { traceAway } = await page();
  const a = card();
  const b = card();
  const c = card();
  const forgetA = traceAway(ask(10), a.keep, a.tell);
  const forgetB = traceAway(ask(20), b.keep, b.tell);
  traceAway(ask(30), c.keep, c.tell);
  const [worker] = Made.all;
  forgetB?.();
  forgetA?.();
  expect(worker.asked).toEqual([ask(10)]);
  worker.say({ key: ask(10).key, threads: THREADS });
  /* the view in the worker is kept though its card has gone; the one forgotten is passed over */
  expect(a.card).toEqual({ told: 0, kept: [THREADS] });
  expect(worker.asked).toEqual([ask(10), ask(30)]);
  worker.say({ key: ask(30).key, threads: THREADS });
  expect(b.card).toEqual({ told: 0, kept: [] });
  expect(c.card).toEqual({ told: 1, kept: [THREADS] });
});

test("a worker whose file did not load tells every waiting card, and the page traces for itself from then on", async () => {
  const { traceAway } = await page();
  const a = card();
  const b = card();
  traceAway(ask(90), a.keep, a.tell);
  traceAway(ask(45), b.keep, b.tell);
  const [worker] = Made.all;
  worker.unloaded();
  expect(worker.ended).toBe(true);
  expect([a.card.told, b.card.told]).toEqual([1, 1]);
  expect(traceAway(ask(135), card().keep, card().tell)).toBeNull();
  expect(Made.all).toHaveLength(1);
});

test("a browser that runs no module workers, or none at all, traces on the page", async () => {
  Made.refused = true;
  expect((await page()).traceAway(ask(90), card().keep, card().tell)).toBeNull();
  vi.stubGlobal("Worker", undefined);
  expect((await page()).traceAway(ask(90), card().keep, card().tell)).toBeNull();
});
