/* Time and chance under the driver's hand, installed before any module runs: requestAnimationFrame only queues, and the
   driver's __tick(ms) sets the clock (performance.now and Date.now), runs the timeouts that have come due by then (the
   bar's cycle waits out each dwell on one), and runs what is queued with that timestamp, so the water, the bar's cycle
   and every tween see exactly the frame's time however slowly the frame is drawn. Math.random is a seeded mulberry32,
   so the water's dithering is the same on every run. */
(() => {
  const q = new URLSearchParams(location.search);
  document.documentElement.dataset.theme = q.get("theme") === "light" ? "light" : "dark";
  document.documentElement.dataset.motion = "full";
  try {
    localStorage.setItem("grabient-water", "software");
    localStorage.removeItem("grabient-motion");
  } catch {}
  let now = 1000;
  let id = 0;
  const queue = new Map();
  window.requestAnimationFrame = cb => {
    queue.set(++id, cb);
    return id;
  };
  window.cancelAnimationFrame = n => {
    queue.delete(n);
  };
  Object.defineProperty(performance, "now", { value: () => now, configurable: true });
  const epoch = Date.UTC(2026, 9, 14, 16);
  Date.now = () => epoch + Math.round(now);
  /* timeouts on the same clock: each runs in the first tick at or past its time, in the order they fall due */
  let timer = 0;
  const timers = new Map();
  window.setTimeout = (cb, ms = 0, ...args) => {
    timers.set(++timer, { at: now + Math.max(0, Number(ms) || 0), cb, args });
    return timer;
  };
  window.clearTimeout = n => {
    timers.delete(n);
  };
  window.__tick = t => {
    now = t;
    for (;;) {
      let next = null;
      for (const [n, entry] of timers) if (entry.at <= t && (!next || entry.at < next[1].at)) next = [n, entry];
      if (!next) break;
      timers.delete(next[0]);
      if (typeof next[1].cb === "function") next[1].cb(...next[1].args);
    }
    const due = [...queue.values()];
    queue.clear();
    for (const cb of due) cb(t);
    return due.length;
  };
  let s = Number(q.get("seed") ?? 0x2f6b9e4d) | 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
