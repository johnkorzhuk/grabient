/* A tab left open across a deploy keeps running the scripts it opened with, against a Worker whose answers may now
   have another shape. Every Worker answer names its build (Server-Timing); once one names another build than the
   page's own, the next page loads whole, with the build that serves it (routes/__root.tsx). A tab back after a minute
   away, or out of the back-forward cache, asks once (/api/build). A page no Worker answered names no build, and then
   nothing is watched. Browser only. */

const AWAY_MS = 60_000;
let newer = false;

const buildOf = (entry: PerformanceEntry | undefined) =>
  (entry as PerformanceResourceTiming | undefined)?.serverTiming?.find(
    timing => timing.name === "build"
  )?.description ?? "";

/** Whether the Worker has answered from another build than this page's. */
export const newerBuild = () => newer;

export function watchBuild(): void {
  const own = buildOf(performance.getEntriesByType("navigation")[0]);
  if (!own) return;
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      const build = buildOf(entry);
      if (build && build !== own) newer = true;
    }
  }).observe({ type: "resource", buffered: true });
  const ask = () => {
    if (!newer) fetch("/api/build", { cache: "no-store", credentials: "omit" }).catch(() => {});
  };
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) ask();
  });
  addEventListener("pageshow", event => {
    if (event.persisted) ask();
  });
}
