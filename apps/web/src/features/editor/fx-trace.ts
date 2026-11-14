/* The vector effects' stills traced in a Web Worker of the reader's browser (still-worker.ts), where their steps on the
   page's thread would hold it however finely they are cut: the strings' threads at a view no still has traced yet,
   some 85 to 150 ms on a desktop and four times that on a phone, whose last step fits every thread's curves at once
   (engine/strings-svg.ts), so a strings list stuttered as cards at new angles scrolled in. A card at such a view waits
   out of turn while the worker traces (FxArt.tsx), then writes its still from the threads kept, in under a millisecond,
   as every other card at that view then does.
   One worker for the page, started by the first card that needs it, one ask in it at a time, the first asked first,
   and an ask no card waits for any more is never sent. A browser that runs no module workers, or a worker whose file
   did not load (no connection, or a deploy since that retired it), leaves the tracing to the page, in steps, as before.
   Loaded on demand with the stills' code (fx-draw.ts loadFx). */
import type { FxTraceAsk } from "@grabient/engine/fx-still.ts";

/** What the worker answers an ask: its threads, each level and its path data, or none where tracing failed. */
export interface TraceSaid {
  key: string;
  threads: [number, string][] | null;
}

/** An ask and the cards waiting on it: what keeps its answer, and what each card does once it is kept. */
interface Asked {
  ask: FxTraceAsk;
  keep: (threads: [number, string][]) => void;
  cards: Set<() => void>;
}

/* every ask not yet answered, in the order asked; `sent` names the one in the worker */
const asks = new Map<string, Asked>();
let sent: string | null = null;
/* the worker: undefined until the first ask starts it, null where none runs (none made, or it failed) */
let worker: Worker | null | undefined;

/* the next ask a card waits for, into the worker */
function send() {
  if (sent !== null || !worker) return;
  const next = asks.entries().next();
  if (next.done) return;
  sent = next.value[0];
  worker.postMessage(next.value[1].ask);
}

/* an ask's end: kept where the worker traced it, and each card waiting on it told */
function answered(key: string, threads: TraceSaid["threads"]) {
  const asked = asks.get(key);
  asks.delete(key);
  if (sent === key) sent = null;
  if (asked) {
    if (threads) asked.keep(threads);
    for (const tell of asked.cards) tell();
  }
  send();
}

/* a worker that failed: ended, and every card waiting told, each then tracing its own on the page */
function failed() {
  worker?.terminate();
  worker = null;
  sent = null;
  for (const key of [...asks.keys()]) answered(key, null);
}

function started(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker =
      typeof Worker === "function"
        ? new Worker(new URL("./still-worker.ts", import.meta.url), {
            type: "module",
            name: "Stills"
          })
        : null;
  } catch {
    /* a browser that runs no module workers refuses one at once */
    worker = null;
  }
  worker?.addEventListener("message", (event: MessageEvent<TraceSaid>) =>
    answered(event.data.key, event.data.threads)
  );
  worker?.addEventListener("error", event => {
    event.preventDefault();
    failed();
  });
  return worker;
}

/** A still's trace handed to the worker: `keep` keeps the threads it answers, then the card is told (`tell`), as it is
    where the worker failed (the card then traces on the page). The function returned forgets the card: an ask no card
    waits on is never sent. Null where no worker takes it, so the card traces on the page. */
export function traceAway(
  ask: FxTraceAsk,
  keep: Asked["keep"],
  tell: () => void
): (() => void) | null {
  if (!started()) return null;
  let asked = asks.get(ask.key);
  if (!asked) {
    asked = { ask, keep, cards: new Set() };
    asks.set(ask.key, asked);
  }
  /* its own function, so two cards of one view are told and forgotten apart */
  const card = () => tell();
  asked.cards.add(card);
  send();
  return () => {
    const now = asks.get(ask.key);
    if (!now) return;
    now.cards.delete(card);
    if (!now.cards.size && sent !== ask.key) asks.delete(ask.key);
  };
}
