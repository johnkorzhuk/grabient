/* The Web Worker that traces the vector effects' stills for a page, where tracing them on the page's thread would hold
   it (fx-trace.ts starts one with the first such still and keeps it for the page): the strings' threads at a view no
   still has traced yet (engine/strings-svg.ts stringsTrace). It answers each ask with the threads, each level and its
   path data, or with none where tracing failed, so the page traces them itself. */
import type { FxTraceAsk } from "@grabient/engine/fx-still.ts";
import { stringsTrace } from "@grabient/engine/strings-svg.ts";
import type { TraceSaid } from "./fx-trace.ts";

addEventListener("message", (event: MessageEvent<FxTraceAsk>) => {
  const ask = event.data;
  let threads: TraceSaid["threads"] = null;
  try {
    threads = stringsTrace(ask);
  } catch {
    /* the page traces it in steps, as it would without a worker */
  }
  postMessage({ key: ask.key, threads } satisfies TraceSaid);
});
