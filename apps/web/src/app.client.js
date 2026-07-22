// Navigation + caching layer porting TanStack Router/Query behaviors to vanilla JS.
// Constants and algorithms mirror @tanstack/router-core 1.141 + query-core 5.90:
// intent preload (mouseenter+50ms / focus / touchstart, WeakMap timers),
// preloadStaleTime 30s, gcTime 5min, SWR navigation (serve stale, reload async),
// in-flight dedup, visibilitychange/online revalidation, retry 3x capped backoff,
// pendingMs 1000 / pendingMinMs 500, sessionStorage scroll restoration.
// Runs in all browsers; Solid islands remount on the "app:swap" event and take
// over in-place param updates via window.__paramsHandler while mounted.
const PRELOAD_DELAY = 50;
const PRELOAD_STALE = 30000;
const GC_TIME = 300000;
const PENDING_MS = 1000;
const PENDING_MIN_MS = 500;
const RETRIES = 3;

const now = () => Date.now();
const rel = (href) => {
  const u = new URL(href, location.href);
  return u.pathname + u.search;
};

const cache = new Map();
let navSeq = 0;
let shownHtml = "";

const gc = () => {
  for (const [k, e] of cache) if (!e.promise && now() - e.at > GC_TIME) cache.delete(k);
};

const retry = async (fn, n = RETRIES) => {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= n) throw err;
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** i, 30000)));
    }
  }
};

function load(href) {
  let e = cache.get(href);
  if (e && e.promise) return e.promise;
  if (!e) {
    e = { at: 0 };
    cache.set(href, e);
  }
  e.promise = fetch(href)
    .then(async (res) => {
      e.html = await res.text();
      e.url = res.url;
      e.at = now();
      const cc = res.headers.get("cache-control") || "";
      e.maxAge = ((cc.match(/max-age=(\d+)/) || [])[1] || 0) * 1000;
      e.promise = null;
      return e;
    })
    .catch((err) => {
      e.promise = null;
      cache.delete(href);
      throw err;
    });
  return e.promise;
}

function preload(href) {
  const e = cache.get(href);
  if (e && (e.promise || now() - e.at < PRELOAD_STALE)) return;
  load(href).catch(() => {});
}

const linkOf = (e) => {
  const a = e.target.closest && e.target.closest("a[href]");
  if (!a || a.target || a.hasAttribute("download")) return null;
  const u = new URL(a.href);
  if (u.origin !== location.origin) return null;
  // Plain files (llms.txt, robots.txt, sitemap.xml, images) are NOT pages —
  // swapping their raw bytes into the styled document renders text "inside"
  // the site. Let the browser load them natively.
  if (/\.(txt|xml|json|png|jpe?g|svg|ico|webmanifest|woff2?)$/i.test(u.pathname)) return null;
  return a;
};

const timers = new WeakMap();
document.addEventListener("mouseover", (e) => {
  const a = linkOf(e);
  if (!a || a.contains(e.relatedTarget) || timers.has(a)) return;
  timers.set(
    a,
    setTimeout(() => {
      timers.delete(a);
      preload(rel(a.href));
    }, PRELOAD_DELAY),
  );
});
document.addEventListener("mouseout", (e) => {
  const a = linkOf(e);
  if (!a || a.contains(e.relatedTarget)) return;
  const t = timers.get(a);
  if (t) {
    clearTimeout(t);
    timers.delete(a);
  }
});
document.addEventListener("focusin", (e) => {
  const a = linkOf(e);
  if (a) preload(rel(a.href));
});
document.addEventListener("touchstart", (e) => {
  const a = linkOf(e);
  if (a) preload(rel(a.href));
}, { passive: true });

// The last list route's search only ever holds USER-set params (palette-derived
// values enter seed URLs via card links, never list URLs). Remembering it lets
// seed pages link back to lists without the palette's values sticking — the
// current site's previousRoute store, persisted so it survives reloads.
const LIST_PATHS = ["/", "/newest", "/oldest", "/saved"];
const LKEY = "gl-list-search";

function syncListMemory(changedField) {
  try {
    if (LIST_PATHS.includes(location.pathname)) {
      sessionStorage.setItem(LKEY, location.search);
    } else if (changedField && changedField.name) {
      // A user edit on a seed page is user-set by definition: merge just that
      // field into the remembered list search (empty value = reset to auto).
      const p = new URLSearchParams((sessionStorage.getItem(LKEY) || "").replace(/^\?/, ""));
      changedField.value ? p.set(changedField.name, changedField.value) : p.delete(changedField.name);
      sessionStorage.setItem(LKEY, p.toString() ? `?${p}` : "");
    }
  } catch {}
  if (!LIST_PATHS.includes(location.pathname)) fixListLinks();
}

function fixListLinks() {
  let stored = "";
  try {
    stored = sessionStorage.getItem(LKEY) || "";
  } catch {}
  const p = new URLSearchParams(stored.replace(/^\?/, ""));
  p.delete("page");
  const qs = p.toString() ? `?${p}` : "";
  document.querySelectorAll("header nav a, header a.logo, a[data-list-link]").forEach((a) => {
    const u = new URL(a.href);
    if (LIST_PATHS.includes(u.pathname)) a.setAttribute("href", u.pathname + qs);
  });
}

// Masked numeric inputs (data-suffix, e.g. angle's "°"): the visible value
// carries the unit; the numeric part is the form truth. rawVal strips the
// suffix for reads, setVal re-applies it and keeps the set/unset text color.
const rawVal = (el) =>
  el.dataset && el.dataset.suffix ? el.value.split(el.dataset.suffix).join("") : el.value;
const setVal = (el, v) => {
  el.value = v === "" ? "" : v + ((el.dataset && el.dataset.suffix) || "");
  el.classList.toggle("text-foreground!", el.value !== "");
};

const entrySrc = () => {
  const s = document.querySelector('script[type="module"][src*="/assets/entry-"]');
  return s ? s.getAttribute("src") : null;
};

function swap(html, afterApply) {
  shownHtml = html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Cross-deploy guard: if the incoming page was built by a different deploy
  // (entry hash differs), its classes may not exist in our inlined stylesheet.
  // A full load keeps HTML/CSS/JS from one deploy — never mix them.
  const incoming = doc.querySelector('script[type="module"][src*="/assets/entry-"]');
  const current = entrySrc();
  if (incoming && current && incoming.getAttribute("src") !== current) {
    location.reload();
    return Promise.resolve();
  }
  const apply = () => {
    document.title = doc.title;
    const icon = document.querySelector('link[rel="icon"]');
    const nextIcon = doc.querySelector('link[rel="icon"]');
    if (icon && nextIcon) icon.setAttribute("href", nextIcon.getAttribute("href"));
    // A swap triggered while an options field is focused (arrow-key stepping,
    // preset pick) must not kick the user out of the input: remember the field
    // and refocus its replacement so key-repeat keeps flowing.
    const ae = document.activeElement;
    const refocus = ae && ae.name && ae.closest && ae.closest("#opts") ? ae.name : null;
    document.body.replaceChildren(...doc.body.childNodes);
    // Scroll restoration must happen INSIDE the view-transition update so the
    // new snapshot is captured at the target scroll position — otherwise the
    // page visibly jumps after the crossfade finishes.
    if (afterApply) afterApply();
    if (refocus) {
      const el = document.querySelector(`#opts [name="${refocus}"]`);
      if (el) el.focus({ preventScroll: true });
    }
    document.dispatchEvent(new CustomEvent("app:swap"));
    syncListMemory();
  };
  if (document.startViewTransition)
    return document.startViewTransition(apply).finished.catch(() => {});
  apply();
  return Promise.resolve();
}

let pendShown = 0;
const showPending = () => {
  pendShown = now();
  document.documentElement.classList.add("pending");
};
const hidePending = () => {
  const wait = pendShown ? Math.max(0, PENDING_MIN_MS - (now() - pendShown)) : 0;
  setTimeout(() => {
    document.documentElement.classList.remove("pending");
    pendShown = 0;
  }, wait);
};

async function revalidate(href, seq) {
  try {
    const e = await retry(() => load(href));
    if (seq === navSeq && rel(location.href) === href && e.html !== shownHtml) swap(e.html);
  } catch {}
}

async function navigate(href, push) {
  const seq = ++navSeq;
  gc();
  if (push) history.pushState({ k: Math.random().toString(36).slice(2, 8) }, "", href);
  const finishScroll = push
    ? () => restoreScroll(null)
    : () => restoreScroll((history.state && history.state.k) || rel(location.href));
  const e = cache.get(href);
  if (e && e.html && !e.promise) {
    // A preloaded entry may have followed a redirect (legacy/decimal seed ->
    // canonical): reflect the canonical URL in the address bar here too.
    if (e.url && rel(e.url) !== href) history.replaceState(history.state, "", rel(e.url));
    await swap(e.html, finishScroll);
    if (now() - e.at >= (e.maxAge || 0)) revalidate(href, seq);
  } else {
    const pend = setTimeout(showPending, PENDING_MS);
    try {
      const r = await load(href);
      if (seq !== navSeq) return;
      if (r.url && rel(r.url) !== href) history.replaceState(history.state, "", rel(r.url));
      await swap(r.html, finishScroll);
    } catch {
      location.assign(href);
      return;
    } finally {
      clearTimeout(pend);
      hidePending();
    }
  }
}

// Subheader reset button: visible only when options have CHANGED from the
// visit's baseline. On a HARD load of a seed page, options already in the
// URL (a shared/card link) are that visit's defaults — not changes — and
// reset restores them. Any real client-side navigation ends that context;
// from then on the baseline is all-auto. Per-field change events keep the
// list-search memory's field-level merge semantics intact.
let seedBoot = null;
if (!LIST_PATHS.includes(location.pathname)) {
  const sp = new URLSearchParams(location.search);
  seedBoot = {
    angle: sp.get("angle") || "",
    steps: sp.get("steps") || "",
    style: sp.get("style") || "",
  };
}
document.addEventListener("app:swap", () => (seedBoot = null));

function optsBaseline() {
  return (!LIST_PATHS.includes(location.pathname) && seedBoot) || { angle: "", steps: "", style: "" };
}

function syncOptsReset() {
  const form = document.getElementById("opts");
  const btn = document.getElementById("opts-reset");
  if (!form || !btn) return;
  const base = optsBaseline();
  let changed = false;
  for (const el of form.elements)
    if (el.name && (base[el.name] ?? "") !== rawVal(el)) changed = true;
  btn.classList.toggle("hidden", !changed);
}
window.__syncOptsReset = syncOptsReset;
document.addEventListener("app:swap", syncOptsReset);

document.addEventListener("change", (e) => {
  // Sort dropdown (NavigationSelect equivalent): navigate to the chosen list
  // route, preserving user params, resetting page.
  if (e.target && e.target.id === "nav-select") {
    const p = new URLSearchParams(location.search);
    p.delete("page");
    navigate(e.target.value + (p.size ? "?" + p : ""), true);
    return;
  }
  const form = e.target.closest("#opts");
  if (!form) return;
  const fields = {};
  for (const el of form.elements) if (el.name) fields[el.name] = rawVal(el);
  if (!LIST_PATHS.includes(location.pathname))
    syncListMemory({ name: e.target.name, value: rawVal(e.target) });
  syncOptsReset();
  if (window.__paramsHandler) return window.__paramsHandler(fields);
  const p = new URLSearchParams(location.search);
  for (const k in fields) fields[k] ? p.set(k, fields[k]) : p.delete(k);
  navigate(location.pathname + (p.size ? "?" + p : ""), true);
});

// Screen-reader announcements for copy/apply feedback (polite live region).
function announce(msg) {
  const live = document.getElementById("live");
  if (!live) return;
  live.textContent = "";
  live.textContent = msg;
}

// WAI-ARIA tabs pattern for the export-code bar: selection follows click or
// arrow keys, with a roving tabindex on the tab buttons.
function selectCodeTab(tab) {
  const sec = tab.closest("section");
  if (!sec) return;
  for (const b of sec.querySelectorAll("[data-code-tab]")) {
    const on = b === tab;
    b.setAttribute("aria-selected", String(on));
    b.setAttribute("tabindex", on ? "0" : "-1");
  }
  for (const p of sec.querySelectorAll("[data-code-panel]"))
    p.classList.toggle("hidden", p.getAttribute("data-code-panel") !== tab.getAttribute("data-code-tab"));
  const code = document.getElementById(tab.getAttribute("data-code-tab"));
  const btn = sec.querySelector("[data-copy]");
  if (btn && code) btn.setAttribute("data-copy", code.textContent);
}
document.addEventListener("keydown", (e) => {
  const tab = e.target.closest && e.target.closest("[data-code-tab]");
  if (!tab) return;
  const tabs = [...tab.closest('[role="tablist"]').querySelectorAll("[data-code-tab]")];
  const idx = tabs.indexOf(tab);
  let next = null;
  if (e.key === "ArrowRight") next = tabs[(idx + 1) % tabs.length];
  else if (e.key === "ArrowLeft") next = tabs[(idx - 1 + tabs.length) % tabs.length];
  else if (e.key === "Home") next = tabs[0];
  else if (e.key === "End") next = tabs[tabs.length - 1];
  if (next) {
    e.preventDefault();
    selectCodeTab(next);
    next.focus();
  }
});

// The theme toggle's label always names the theme it will switch TO.
function syncThemeLabel() {
  const btn = document.getElementById("theme-toggle");
  if (btn)
    btn.setAttribute(
      "aria-label",
      document.documentElement.classList.contains("dark")
        ? "Switch to light theme"
        : "Switch to dark theme",
    );
}

document.addEventListener("click", (e) => {
  const theme = e.target.closest && e.target.closest("#theme-toggle");
  if (theme) {
    const dark = document.documentElement.classList.toggle("dark");
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {}
    syncThemeLabel();
    return;
  }
  const toggle = e.target.closest && e.target.closest("[data-toggle]");
  if (toggle) {
    const panel = document.getElementById(toggle.getAttribute("data-toggle"));
    if (panel) {
      const cls = toggle.getAttribute("data-toggle-class");
      let open;
      if (cls) open = !panel.classList.toggle(cls);
      else {
        panel.hidden = !panel.hidden;
        open = !panel.hidden;
      }
      toggle.setAttribute("aria-expanded", String(open));
    }
    return;
  }
  const resetBtn = e.target.closest && e.target.closest("#opts-reset");
  if (resetBtn) {
    const form = document.getElementById("opts");
    const base = optsBaseline();
    if (form)
      for (const el of [...form.elements])
        if (el.name && rawVal(el) !== (base[el.name] ?? "")) {
          if (el.tagName === "SELECT") {
            el.value = base[el.name] ?? "";
            if (el.__syncLabel) el.__syncLabel();
          } else setVal(el, base[el.name] ?? "");
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
    return;
  }
  // Export-code tab bar: show the matching panel and point the shared copy
  // button at its content.
  const codeTab = e.target.closest && e.target.closest("[data-code-tab]");
  if (codeTab) {
    selectCodeTab(codeTab);
    return;
  }
  const t = e.target.closest && e.target.closest("[data-copy]");
  if (t && navigator.clipboard) {
    navigator.clipboard.writeText(t.getAttribute("data-copy")).then(() => {
      announce("Copied to clipboard");
      // Swap text on the inner label (swatch pill / copy-label) when there is
      // one — writing on the button itself would destroy sibling markup like
      // the pill background span or the copy icon.
      const label = t.querySelector(".swatch-label, .copy-label") || t;
      if (label.dataset.orig == null) label.dataset.orig = label.textContent;
      label.textContent = "Copied!";
      clearTimeout(t.__copyTimer);
      t.__copyTimer = setTimeout(() => {
        label.textContent = label.dataset.orig;
        delete label.dataset.orig;
      }, 1200);
    });
    return;
  }
  // Click/tap on the channels graph copies the hex at that step; the legend
  // becomes the confirmation.
  const plot = e.target.closest && e.target.closest(".graph-plot");
  if (plot && navigator.clipboard) {
    const snap = graphSnap(plot, e.clientX);
    if (snap) {
      const { fig, best } = snap;
      navigator.clipboard.writeText(best.hex).then(() => {
        announce(`Copied ${best.hex}`);
        const tip = fig.querySelector(".graph-tip");
        if (!tip) return;
        graphCopiedUntil = now() + 1200;
        tip.innerHTML =
          '<div class="flex items-center gap-2"><span class="h-5 w-5 shrink-0 rounded border border-black/10 dark:border-white/15" style="background:' +
          best.hex +
          '"></span><span class="font-mono text-sm font-bold text-foreground">' +
          best.hex +
          '</span></div><div class="mt-1.5 font-mono text-[11px] font-semibold text-foreground">Copied!</div>';
        tip.classList.remove("hidden");
        placeGraphTip(fig, tip, e.clientX, e.clientY);
        setTimeout(() => {
          if (now() >= graphCopiedUntil) tip.classList.add("hidden");
        }, 1250);
      });
    }
    return;
  }
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  const a = linkOf(e);
  if (!a) return;
  const u = new URL(a.href);
  e.preventDefault();
  if (u.pathname === location.pathname && u.search === location.search) {
    const el = u.hash && document.getElementById(u.hash.slice(1));
    if (el) el.scrollIntoView();
    return;
  }
  navigate(u.pathname + u.search, true);
});

addEventListener("popstate", () => {
  // A mounted island may own this transition (seed-route undo/redo restores
  // the palette in place); otherwise it's a real navigation.
  if (window.__popstateHandler && window.__popstateHandler()) return;
  navigate(rel(location.href), false);
});

// Number-input keyboard model (current site's StepsInput/AngleInput semantics):
// Arrow up/down ±1, Shift ×3, wrap when data-wrap (angle), Enter commits,
// Escape resets to auto; select-all on focus. Arrow commits are DEBOUNCED:
// the value spins instantly per key-repeat, the change (and any resulting
// navigation) fires once after the last press — so holding the key works.
const COMMIT_MS = 350;
let commitEl = null;
let commitTimer = 0;
function flushCommit() {
  clearTimeout(commitTimer);
  const el = commitEl;
  commitEl = null;
  if (el) el.dispatchEvent(new Event("change", { bubbles: true }));
}
document.addEventListener("keydown", (e) => {
  const el = e.target;
  if (!el || !el.matches || !el.matches("input[data-step-keys]")) return;
  const min = Number(el.getAttribute("data-min") || 0);
  const max = Number(el.getAttribute("data-max") || 100);
  const wrap = el.hasAttribute("data-wrap");
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    const delta = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 3 : 1);
    const raw = rawVal(el);
    let v = raw === "" ? NaN : Number(raw);
    if (!Number.isFinite(v)) v = e.key === "ArrowUp" ? min : max;
    else v += delta;
    if (wrap) v = ((v - min) % (max - min + 1) + (max - min + 1)) % (max - min + 1) + min;
    else v = Math.max(min, Math.min(max, v));
    setVal(el, String(v));
    // Palettes preview the stepped value live; the commit follows on release.
    if (el.name && el.closest("#opts")) previewOpts(el.name, rawVal(el));
    if (commitEl && commitEl !== el) flushCommit();
    commitEl = el;
    clearTimeout(commitTimer);
    commitTimer = setTimeout(flushCommit, COMMIT_MS);
  } else if (e.key === "Enter") {
    e.preventDefault();
    commitEl = el;
    flushCommit();
    el.blur();
  } else if (e.key === "Escape") {
    e.preventDefault();
    setVal(el, "");
    commitEl = el;
    flushCommit();
    el.blur();
  }
});
// Leaving the field with an uncommitted arrow-stepped value commits it
// (programmatic value writes don't fire the native blur-change).
document.addEventListener("focusout", (e) => {
  if (commitEl && e.target === commitEl) flushCommit();
});
document.addEventListener("focusin", (e) => {
  if (e.target && e.target.matches && e.target.matches("input[data-step-keys]")) e.target.select();
});
// Suffix mask (angle "45°"): keep digits + suffix as the value, caret ahead
// of the unit when the mask rewrites what was typed.
document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el || !el.matches || !el.matches("input[data-suffix]")) return;
  const digits = el.value.replace(/\D/g, "");
  const next = digits ? digits + el.dataset.suffix : "";
  if (el.value !== next) {
    el.value = next;
    try {
      el.setSelectionRange(digits.length, digits.length);
    } catch {}
  }
  el.classList.toggle("text-foreground!", next !== "");
});
// Typing in an options input previews live (high-velocity state; the URL
// commit still waits for change/Enter/blur).
document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el || !el.matches || !el.matches("#opts input[name]")) return;
  previewOpts(el.name, rawVal(el));
});

// Channels-graph hover: crosshair + tooltip snapped to the nearest step sample.
let graphCopiedUntil = 0;

function graphSnap(plot, clientX) {
  const fig = plot.closest("figure[data-samples]");
  if (!fig) return null;
  const samples = JSON.parse(fig.getAttribute("data-samples") || "[]");
  if (!samples.length) return null;
  const rect = plot.getBoundingClientRect();
  const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  let best = samples[0];
  let idx = 0;
  samples.forEach((s, i) => {
    if (Math.abs(s.t - t) < Math.abs(best.t - t)) {
      best = s;
      idx = i;
    }
  });
  return { fig, best, idx };
}

// Hovering a fused swatch resolves by exact INDEX (not nearest-x) so the
// legend always matches the pill under the finger/cursor.
function stripSnap(target, plot) {
  const li = target.closest && target.closest("ul.swatches > li");
  if (!li) return null;
  const fig = plot.closest("figure[data-samples]");
  if (!fig) return null;
  const samples = JSON.parse(fig.getAttribute("data-samples") || "[]");
  const idx = Array.prototype.indexOf.call(li.parentElement.children, li);
  return samples[idx] ? { fig, best: samples[idx], idx } : null;
}


// Position the tip trailing the cursor on BOTH axes, flipped inside the figure.
function placeGraphTip(fig, tip, clientX, clientY) {
  const figRect = fig.getBoundingClientRect();
  let x = clientX - figRect.left + 14;
  let y = clientY - figRect.top + 14;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  if (x + tw > figRect.width - 4) x = clientX - figRect.left - tw - 14;
  if (y + th > figRect.height - 4) y = clientY - figRect.top - th - 14;
  tip.style.left = Math.max(4, x) + "px";
  tip.style.top = Math.max(4, y) + "px";
}

// Canvas-mode floating controls (dock, back, reset) reveal while the mouse
// is over the gradient area — anywhere in the hero except the sliders sheet
// — and toggle with a tap on the gradient background for touch. Body-portal
// panels/menus/tooltips don't count as "leaving".
let lastPointerType = "mouse";
document.addEventListener(
  "pointerdown",
  (e) => {
    if (e.pointerType) lastPointerType = e.pointerType;
  },
  true,
);
document.addEventListener("pointermove", (e) => {
  if (e.pointerType && e.pointerType !== "mouse") return;
  const hero = document.getElementById("seed-hero");
  if (!hero || !e.target || !e.target.closest) return;
  if (e.target.closest('.menu-pop, [role="dialog"], [role="menu"], .ui-tip')) return;
  hero.classList.toggle(
    "ui-show",
    hero.contains(e.target) && !e.target.closest("#editor-card"),
  );
});
document.addEventListener("click", (e) => {
  if (lastPointerType === "mouse") return;
  const hero = document.getElementById("seed-hero");
  const t = e.target;
  if (!hero || !t || !t.closest || !hero.contains(t)) return;
  // Only a tap on the gradient itself toggles — not taps on controls.
  if (t.closest("button, a, input, select, label, #editor-card, #mobile-dock, #graph-panel, #swatches-strip"))
    return;
  hero.classList.toggle("ui-show");
});

// The fused swatch strip (canvas mode, graph open) is x-aligned with the
// plot — hovering it drives the same legend/crosshair.
function fusedStripPlot(target) {
  if (!target.closest) return null;
  const strip = target.closest("#swatches-strip");
  return strip && strip.closest(".seed-hero.show-graph")
    ? document.querySelector("#graph-panel .graph-plot")
    : null;
}

document.addEventListener("pointermove", (e) => {
  const direct = e.target.closest && e.target.closest(".graph-plot");
  const stripPlot = direct ? null : fusedStripPlot(e.target);
  const plot = direct || stripPlot;
  if (!plot) return;
  const snap = (stripPlot && stripSnap(e.target, plot)) || graphSnap(plot, e.clientX);
  if (!snap) return;
  const { fig, best } = snap;
  const tip = fig.querySelector(".graph-tip");
  const cross = plot.querySelector(".graph-crosshair");
  if (!tip || !cross) return;
  cross.style.left = best.t * 100 + "%";
  cross.style.opacity = "0.6";
  // Channel dots appear only at the hovered step, one per RGB curve.
  plot.querySelectorAll(".graph-dot").forEach((d, ch) => {
    d.style.left = best.t * 100 + "%";
    d.style.top = 100 - (best.rgb[ch] / 255) * 100 + "%";
    d.style.opacity = "1";
  });
  // While the click-copied confirmation shows, leave the tip alone (the next
  // move after it expires repaints); crosshair and dots keep tracking.
  if (now() < graphCopiedUntil) return;
  tip.innerHTML =
    '<div class="flex items-center gap-2"><span class="h-5 w-5 shrink-0 rounded border border-black/10 dark:border-white/15" style="background:' +
    best.hex +
    '"></span><span class="font-mono text-sm font-bold text-foreground">' +
    best.hex +
    '</span></div><div class="mt-1.5 flex gap-2.5 font-mono text-[11px] font-semibold">' +
    '<span style="color:var(--chart-red)">R ' +
    best.rgb[0] +
    '</span><span style="color:var(--chart-green)">G ' +
    best.rgb[1] +
    '</span><span style="color:var(--chart-blue)">B ' +
    best.rgb[2] +
    "</span></div>";
  tip.classList.remove("hidden");
  placeGraphTip(fig, tip, e.clientX, e.clientY);
  // From the strip, pin the legend just above the swatch row (bottom edge
  // of the figure) instead of trailing a cursor that's outside it.
  if (stripPlot) {
    const figR = fig.getBoundingClientRect();
    tip.style.top = Math.max(4, figR.height - tip.offsetHeight - 6) + "px";
  }
});
document.addEventListener("pointerleave", (e) => {
  // Capture-phase fires for child leaves too; only react when leaving the
  // plot itself or the fused swatch strip.
  const t = e.target;
  if (!t || !t.classList) return;
  const isPlot = t.classList.contains("graph-plot");
  const plot = isPlot ? t : t.id === "swatches-strip" ? fusedStripPlot(t) : null;
  if (!plot) return;
  const fig = plot.closest("figure[data-samples]");
  const tip = fig && fig.querySelector(".graph-tip");
  const cross = plot.querySelector(".graph-crosshair");
  if (tip) tip.classList.add("hidden");
  if (cross) cross.style.opacity = "0";
  plot.querySelectorAll(".graph-dot").forEach((d) => (d.style.opacity = "0"));
  markActiveSwatch(-1);
}, true);

history.scrollRestoration = "manual";
const SKEY = "gl-scroll-v1";
let scrolls;
try {
  scrolls = JSON.parse(sessionStorage.getItem(SKEY)) || {};
} catch {
  scrolls = {};
}
let ignoreScroll = false;
let scrollT = 0;
addEventListener(
  "scroll",
  () => {
    if (ignoreScroll || scrollT) return;
    scrollT = setTimeout(() => {
      scrollT = 0;
      const k = (history.state && history.state.k) || rel(location.href);
      scrolls[k] = [scrollX, scrollY];
      try {
        sessionStorage.setItem(SKEY, JSON.stringify(scrolls));
      } catch {}
    }, 100);
  },
  { capture: true, passive: true },
);

function restoreScroll(key) {
  ignoreScroll = true;
  const pos = key && scrolls[key];
  if (pos) scrollTo(pos[0], pos[1]);
  else if (location.hash && document.getElementById(location.hash.slice(1)))
    document.getElementById(location.hash.slice(1)).scrollIntoView();
  else scrollTo(0, 0);
  setTimeout(() => (ignoreScroll = false), 0);
}

function refetchCurrent() {
  const href = rel(location.href);
  const e = cache.get(href);
  if (e && e.html && now() - e.at < (e.maxAge || 0)) return;
  revalidate(href, navSeq);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden") refetchCurrent();
});
addEventListener("online", refetchCurrent);

// Swatch strip fitting: decide row count (1 or 2) and hex-label orientation
// from measured chip width. Re-run on resize, swaps, and island updates.
function fitSwatches() {
  document.querySelectorAll("ul.swatches").forEach((ul) => {
    const n = ul.children.length;
    if (!n) return;
    const w = ul.clientWidth;
    if (!w) return;
    const cs = getComputedStyle(ul);
    const gap = parseFloat(cs.columnGap) || 0;
    const chip1 = (w - gap * (n - 1)) / n;
    // Canvas mode (seed hero below lg): the strip is fused under the graph
    // and must stay a single row — chips shrink and labels drop instead.
    const oneRow =
      !!ul.closest(".seed-hero") && matchMedia("(width < 64rem)").matches;
    const cols = !oneRow && chip1 < 56 ? Math.ceil(n / 2) : n;
    const chip = (w - gap * (cols - 1)) / cols;
    ul.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`;
    // Prefer horizontal labels: shrink them first (sw-compact) and rotate
    // vertical only when a chip is genuinely too narrow for 7 hex chars.
    // MEASURE the rendered label width (font stacks and user font scaling
    // vary too much for px-constant thresholds) with a hidden probe.
    let wNormal = 62;
    let wCompact = 48;
    const btn = ul.querySelector("button");
    if (btn) {
      const probe = document.createElement("span");
      probe.className = "swatch-label";
      probe.textContent = "#000000";
      probe.style.cssText =
        "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;writing-mode:horizontal-tb;font-size:.75rem;padding:2px 6px;letter-spacing:normal";
      btn.appendChild(probe);
      wNormal = probe.offsetWidth || wNormal;
      probe.style.fontSize = "10px";
      probe.style.padding = "2px 3px";
      wCompact = probe.offsetWidth || wCompact;
      probe.remove();
    }
    const fitsNormal = chip >= wNormal + 6;
    const fitsCompact = chip >= wCompact + 4;
    // Vertical labels are ~as tall as a compact label is wide — a short chip
    // (e.g. the strip inside the mobile graph card) can't fit one either.
    const chipH = (btn && btn.offsetHeight) || 56;
    const fitsVertical = chip >= 26 && chipH >= wCompact + 4;
    ul.classList.toggle("sw-compact", !fitsNormal && fitsCompact);
    ul.classList.toggle("sw-vertical", !fitsNormal && !fitsCompact && fitsVertical);
    ul.classList.toggle("sw-hide", !fitsNormal && !fitsCompact && !fitsVertical);
    // Two rows flow serpentine (row 2 right-to-left) so the color sequence
    // continues directly beneath where row 1 ended — following the gradient.
    const wrapped = cols !== n;
    Array.prototype.forEach.call(ul.children, (li, idx) => {
      if (!wrapped) {
        li.style.gridRowStart = "";
        li.style.gridColumnStart = "";
        return;
      }
      const row = Math.floor(idx / cols);
      const col = row % 2 === 0 ? idx % cols : cols - 1 - (idx % cols);
      li.style.gridRowStart = String(row + 1);
      li.style.gridColumnStart = String(col + 1);
    });
  });
}
window.__fitSwatches = fitSwatches;

// Transient view preview: hand the island the full #opts field set with one
// hovered/typed override so the rendered palettes update WITHOUT committing
// (the current site's hover-preview). null clears the overlay.
function previewOpts(name, value) {
  if (!window.__previewHandler) return;
  if (name === null) return window.__previewHandler(null);
  const form = document.getElementById("opts");
  if (!form) return;
  const fields = {};
  for (const el of form.elements) if (el.name) fields[el.name] = rawVal(el);
  fields[name] = value;
  window.__previewHandler(fields);
}

// ---- Tooltips: ported from Base UI Tooltip (mui/base-ui) as a delegated
// singleton over [data-tip]: hover opens after 600ms — instantly inside the
// 400ms skip-delay window after another tip closed (Provider grouping);
// keyboard focus-visible opens instantly; touch never opens; closes on
// leave/blur/pointerdown/Escape/scroll. role=tooltip + aria-describedby.
const TIP_DELAY = 600;
const TIP_SKIP = 400;
let tipEl = null;
let tipTimer = 0;
let tipTarget = null;
let tipClosedAt = 0;
let tipSuppressed = null;

function tipNode() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "ui-tip";
    tipEl.id = "ui-tip";
    tipEl.setAttribute("role", "tooltip");
  }
  // swap() replaces document.body's children on client-side nav, orphaning the
  // singleton — re-append whenever it's disconnected.
  if (!tipEl.isConnected) document.body.append(tipEl);
  return tipEl;
}

function showTip(target) {
  const text = target.getAttribute("data-tip");
  if (!text || !target.isConnected) return;
  const el = tipNode();
  el.textContent = text;
  el.dataset.open = "";
  const r = target.getBoundingClientRect();
  const pw = el.offsetWidth;
  const ph = el.offsetHeight;
  const side = target.getAttribute("data-tip-side") || "top";
  let top = side === "bottom" ? r.bottom + 6 : r.top - ph - 6;
  if (top < 8) top = r.bottom + 6;
  else if (top + ph > innerHeight - 8) top = r.top - ph - 6;
  el.style.top = top + "px";
  el.style.left = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, innerWidth - pw - 8)) + "px";
  tipTarget = target;
  target.setAttribute("aria-describedby", "ui-tip");
}

function hideTip() {
  clearTimeout(tipTimer);
  tipTimer = 0;
  if (tipTarget) {
    tipTarget.removeAttribute("aria-describedby");
    tipTarget = null;
    tipClosedAt = now();
  }
  if (tipEl) delete tipEl.dataset.open;
}

document.addEventListener("pointerover", (e) => {
  if (e.pointerType && e.pointerType !== "mouse") return;
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t || t === tipTarget || t === tipSuppressed) return;
  clearTimeout(tipTimer);
  const wait = now() - tipClosedAt < TIP_SKIP ? 0 : TIP_DELAY;
  tipTimer = setTimeout(() => showTip(t), wait);
});
document.addEventListener("pointerout", (e) => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t || t.contains(e.relatedTarget)) return;
  if (t === tipSuppressed) tipSuppressed = null;
  hideTip();
});
document.addEventListener("focusin", (e) => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t) return;
  let visible = true;
  try {
    visible = t.matches(":focus-visible");
  } catch {}
  if (visible) showTip(t);
});
document.addEventListener("focusout", (e) => {
  if (tipTarget && e.target === tipTarget) hideTip();
});
document.addEventListener("pointerdown", (e) => {
  // A clicked trigger keeps its tooltip closed until the pointer leaves it
  // (Base UI's closed-by-click behavior).
  tipSuppressed = (e.target.closest && e.target.closest("[data-tip]")) || null;
  hideTip();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideTip();
});
addEventListener("scroll", hideTip, true);
document.addEventListener("app:swap", hideTip);

// ---- Menus: ported from Base UI Select (mui/base-ui): trigger is a
// combobox opening on mousedown (mouseup-outside cancels the gesture), the
// popup renders in a PORTAL on document.body with fixed positioning (never
// clipped by scroll containers — the previous in-place popup was clipped by
// the subheader's overflow-x-auto and looked "dead"), flips above when space
// below runs out, roving focus + typeahead. Native selects stay hidden as
// the form/no-JS source of truth.
let openMenu = null;
let menuId = 0;

function positionPop(pop, trigger) {
  const r = trigger.getBoundingClientRect();
  pop.style.minWidth = r.width + "px";
  const ph = pop.offsetHeight;
  const pw = pop.offsetWidth;
  let top = r.bottom + 8;
  if (top + ph > innerHeight - 8 && r.top - ph - 8 > 0) top = r.top - ph - 8;
  let left = r.left;
  if (left + pw > innerWidth - 8) left = Math.max(8, r.right - pw);
  pop.style.top = top + "px";
  pop.style.left = left + "px";
}

function closeMenu(refocus) {
  if (!openMenu) return;
  const m = openMenu;
  openMenu = null;
  m.pop.remove();
  m.trigger.setAttribute("aria-expanded", "false");
  m.trigger.removeAttribute("aria-controls");
  removeEventListener("scroll", m.reposition, true);
  removeEventListener("resize", m.reposition);
  if (m.onHover) m.onHover(null);
  if (refocus) m.trigger.focus();
}

function showMenu(trigger, items, onPick, anchor, onHover) {
  anchor = anchor || trigger;
  closeMenu();
  const pop = document.createElement("div");
  pop.id = "menu-pop-" + ++menuId;
  pop.className = "menu-pop";
  pop.setAttribute("role", "listbox");
  let typeahead = "";
  let typeTimer;
  items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "menu-item";
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", String(!!it.selected));
    b.textContent = it.label;
    b.addEventListener("click", () => {
      // The commit supersedes the hover preview — closing must not clear it
      // (a clear would flash the old state until the commit applies).
      if (openMenu) openMenu.onHover = null;
      onPick(it.value);
      closeMenu(true);
    });
    if (onHover) {
      b.addEventListener("mouseenter", () => onHover(it.value));
      b.addEventListener("focus", () => onHover(it.value));
    }
    b.addEventListener("keydown", (e) => {
      const opts = [...pop.children];
      const idx = opts.indexOf(document.activeElement);
      if (e.key === "ArrowDown") (opts[Math.min(idx + 1, opts.length - 1)] || b).focus();
      else if (e.key === "ArrowUp") (opts[Math.max(idx - 1, 0)] || b).focus();
      else if (e.key === "Home") opts[0].focus();
      else if (e.key === "End") opts[opts.length - 1].focus();
      else if (e.key === "Escape") closeMenu(true);
      else if (e.key === "Tab") closeMenu();
      else if (e.key.length === 1 && /\S/.test(e.key)) {
        typeahead += e.key.toLowerCase();
        clearTimeout(typeTimer);
        typeTimer = setTimeout(() => (typeahead = ""), 1000);
        const hit = opts.find((o) => o.textContent.toLowerCase().startsWith(typeahead));
        if (hit) hit.focus();
        return;
      } else return;
      e.preventDefault();
    });
    pop.append(b);
  });
  document.body.append(pop);
  const reposition = () => positionPop(pop, anchor);
  reposition();
  addEventListener("scroll", reposition, true);
  addEventListener("resize", reposition);
  if (onHover) pop.addEventListener("mouseleave", () => onHover(null));
  trigger.setAttribute("aria-expanded", "true");
  trigger.setAttribute("aria-controls", pop.id);
  openMenu = { pop, trigger, reposition, justOpened: false, onHover };
  const sel = pop.querySelector('[aria-selected="true"]') || pop.firstElementChild;
  if (sel) sel.focus();
}

document.addEventListener("pointerdown", (e) => {
  if (openMenu && !openMenu.pop.contains(e.target) && !openMenu.trigger.contains(e.target))
    closeMenu();
});

function menuTrigger(trigger, buildItems, onPick, anchor, onHover) {
  const open = () => {
    showMenu(trigger, buildItems(), onPick, anchor, onHover);
    return openMenu;
  };
  trigger.addEventListener("pointerdown", (e) => {
    // Mouse-only fast open (Base UI feel); touch must not block scroll and
    // opens via the click that follows the tap.
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if (!openMenu || openMenu.trigger !== trigger) {
      e.preventDefault();
      const m = open();
      if (m) m.justOpened = true;
    }
  });
  trigger.addEventListener("click", () => {
    if (openMenu && openMenu.trigger === trigger) {
      if (openMenu.justOpened) openMenu.justOpened = false;
      else closeMenu();
    } else open();
  });
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
}

function enhanceMenus() {
  closeMenu();
  document.querySelectorAll("select[data-enhance-select]").forEach((sel) => {
    if (sel.dataset.enhanced) return;
    sel.dataset.enhanced = "1";
    const wrap = sel.closest("span");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className =
      sel.className.replace("appearance-none", "") +
      " inline-flex items-center justify-between text-left";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", sel.getAttribute("aria-label") || "");
    const syncLabel = () => {
      const opt = sel.options[sel.selectedIndex];
      const text = sel.value && opt ? opt.textContent : sel.dataset.placeholder || "";
      trigger.innerHTML =
        '<span class="truncate">' +
        text +
        '</span><svg class="ml-1.5 h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>';
      trigger.classList.toggle("text-foreground!", !!sel.value && sel.value !== "");
    };
    syncLabel();
    // Islands restoring URL state (seed undo/redo) re-sync the trigger label.
    sel.__syncLabel = syncLabel;
    menuTrigger(
      trigger,
      () =>
        [...sel.options]
          .filter((o) => !o.hidden)
          .map((o) => ({
            value: o.value,
            label: o.textContent,
            selected: o.selected,
          })),
      (v) => {
        // Picking the already-selected value resets to auto (clearable selects).
        sel.value = sel.dataset.allowClear !== undefined && sel.value === v ? "" : v;
        syncLabel();
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      },
      undefined,
      sel.name && sel.closest("#opts")
        ? (v) => (v === null ? previewOpts(null) : previewOpts(sel.name, v))
        : undefined,
    );
    sel.classList.add("native-hidden");
    const chev = wrap && wrap.querySelector(".native-chevron");
    if (chev) chev.remove();
    (wrap || sel.parentElement).insertBefore(trigger, sel);
  });

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    if (btn.dataset.enhanced) return;
    btn.dataset.enhanced = "1";
    const input = btn.parentElement.querySelector("input");
    const suffix = btn.getAttribute("data-preset-suffix") || "";
    const presets = (btn.getAttribute("data-presets") || "").split(",");
    menuTrigger(
      btn,
      () => presets.map((v) => ({ value: v, label: v + suffix, selected: rawVal(input) === v })),
      (v) => {
        setVal(input, rawVal(input) === v ? "" : v);
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      input,
      input.name && input.closest("#opts")
        ? (v) => (v === null ? previewOpts(null) : previewOpts(input.name, v))
        : undefined,
    );
  });
}

document.addEventListener("app:swap", enhanceMenus);
enhanceMenus();

// Sticky subheader gains a translucent blur once the page scrolls (the
// current site's isScrolled behavior).
let scrolledRaf = 0;
function syncScrolled() {
  // Only sticky subheaders compact/blur on scroll; the seed page's scrolls
  // away with the content and keeps its rest-state spacing.
  // HYSTERESIS: compacting removes 12px of document height, which can pull
  // scrollY back under a single threshold and oscillate. Enter at >24px
  // (more than the height delta), leave at <4px — the collapse can never
  // flip its own condition.
  const sub = document.querySelector(".subheader.sticky");
  if (!sub) return;
  const on = sub.classList.contains("is-scrolled");
  sub.classList.toggle("is-scrolled", scrollY > (on ? 4 : 24));
}
addEventListener(
  "scroll",
  () => {
    cancelAnimationFrame(scrolledRaf);
    scrolledRaf = requestAnimationFrame(syncScrolled);
  },
  { passive: true },
);
document.addEventListener("app:swap", syncScrolled);
syncScrolled();
let fitRaf = 0;
addEventListener("resize", () => {
  cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(fitSwatches);
});
document.addEventListener("app:swap", fitSwatches);
fitSwatches();
document.addEventListener("app:swap", syncThemeLabel);
syncThemeLabel();

// Contact form: no email backend in this worker (the original submits through
// Turnstile + Resend), so compose a mailto to the same inbox the original
// sends to, carrying subject and message.
document.addEventListener("submit", (e) => {
  const form = e.target.closest && e.target.closest("#contact-form");
  if (!form) return;
  e.preventDefault();
  const message = form.querySelector("#contact-message")?.value?.trim() ?? "";
  if (message.length < 10) {
    announce("Message must be at least 10 characters");
    form.querySelector("#contact-message")?.focus();
    return;
  }
  const subject = form.querySelector("#contact-subject")?.value || "Contact";
  const from = form.querySelector("#contact-email")?.value?.trim();
  const body = message + (from ? `\n\nFrom: ${from}` : "");
  location.href = `mailto:john@grabient.com?subject=${encodeURIComponent(
    `Grabient Contact: ${subject}`,
  )}&body=${encodeURIComponent(body)}`;
});

// ---------------------------------------------------------------------------
// Auth + saved palettes. Cached pages are identical for every visitor, so ALL
// session-dependent UI is applied here: the header's Sign in link becomes an
// avatar menu, and liked hearts get their fill from a generated stylesheet
// keyed on data-like-seed (a <style> survives body swaps and island
// re-renders, unlike classes patched onto card DOM).
const LIKED_COLOR = "oklch(50.5% 0.213 27.518)"; // tailwind red-700, matches the original's fill-red-700

let sessionUser; // undefined = unknown, null = signed out, object = signed in
let sessionPromise = null;
let likedSeeds = new Set();

const escHtml = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function fetchSession() {
  if (!sessionPromise) {
    sessionPromise = fetch("/api/auth/get-session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (sessionUser = d && d.user ? d.user : null))
      .catch(() => (sessionUser = null));
  }
  return sessionPromise;
}

function renderLiked() {
  let el = document.getElementById("liked-style");
  if (!el) {
    el = document.createElement("style");
    el.id = "liked-style";
    document.head.append(el);
  }
  el.textContent = likedSeeds.size
    ? [...likedSeeds].map((s) => `[data-like-seed=${JSON.stringify(s)}] .heart-i`).join(",") +
      `{fill:${LIKED_COLOR};stroke:${LIKED_COLOR}}`
    : "";
}

let likesFetchedAt = 0;
async function refreshLikes() {
  // Mirrors the original's 2-minute staleTime on user-liked-seeds — swaps
  // within that window reuse the in-memory set.
  if (!sessionUser || now() - likesFetchedAt < 120000) return;
  likesFetchedAt = now();
  try {
    const r = await fetch("/api/likes");
    if (r.ok) {
      likedSeeds = new Set((await r.json()).seeds || []);
      renderLiked();
    }
  } catch {
    likesFetchedAt = 0;
  }
}

// The seed page can't SSR its like count (its HTML is edge-cached): fill count
// + liked state per view. Uses the URL's seed, which tracks live edits.
async function initSeedLike() {
  const btn = document.querySelector("[data-like-info]");
  if (!btn) return;
  const seed = decodeURIComponent(location.pathname.slice(1));
  try {
    const r = await fetch(`/api/like-info?seed=${encodeURIComponent(seed)}`);
    if (!r.ok) return;
    const info = await r.json();
    // The page may have swapped while the fetch was in flight.
    if (!btn.isConnected) return;
    btn.dataset.count = info.likesCount;
    const span = btn.querySelector(".like-count");
    if (span) {
      span.textContent = info.likesCount > 0 ? info.likesCount : 1;
      span.classList.toggle("opacity-0", !(info.likesCount > 0));
    }
    if (info.isLiked) likedSeeds.add(seed);
    else likedSeeds.delete(seed);
    renderLiked();
  } catch {}
}

// Header slot: swap the SSR Sign in link for the avatar + dropdown once the
// session is known. Runs again after every body swap (cached session).
function applyAuthUi() {
  const slot = document.getElementById("auth-slot");
  if (!slot || !sessionUser) return;
  const u = sessionUser;
  const face = u.image
    ? `<img src="${escHtml(u.image)}" alt="" referrerpolicy="no-referrer" class="h-full w-full rounded-full object-cover">`
    : `<span class="flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">${escHtml((u.username || u.email || "?").charAt(0).toUpperCase())}</span>`;
  slot.innerHTML = `<button id="avatar-btn" type="button" aria-label="User menu" aria-haspopup="menu" aria-expanded="false" class="h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-solid border-input outline-none transition-colors duration-200 hover:border-muted-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/70">${face}</button>`;
  const btn = slot.querySelector("#avatar-btn");
  btn.addEventListener("click", () => {
    if (document.getElementById("avatar-pop")) return closeAvatarMenu();
    openAvatarMenu(btn);
  });
}

function closeAvatarMenu() {
  const pop = document.getElementById("avatar-pop");
  if (pop) pop.remove();
  const btn = document.getElementById("avatar-btn");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function openAvatarMenu(btn) {
  const u = sessionUser;
  const pop = document.createElement("div");
  pop.id = "avatar-pop";
  pop.className = "menu-pop";
  pop.setAttribute("role", "menu");
  pop.style.minWidth = "14rem";
  pop.innerHTML =
    `<div class="px-3 py-2">` +
    (u.username ? `<p class="text-sm font-medium text-foreground">${escHtml(u.username)}</p>` : "") +
    (u.email ? `<p class="pt-1 text-xs text-muted-foreground">${escHtml(u.email)}</p>` : "") +
    `</div><div class="my-1 h-px bg-border/40"></div>` +
    `<a href="/saved" role="menuitem" class="menu-item block">Saved palettes</a>` +
    `<button type="button" id="signout-btn" role="menuitem" class="menu-item w-full text-left">Sign out</button>`;
  document.body.append(pop);
  positionPop(pop, btn);
  btn.setAttribute("aria-expanded", "true");
  pop.querySelector("#signout-btn").addEventListener("click", async () => {
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {}
    // Full load: clears every piece of per-session state at once.
    location.href = "/";
  });
  pop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAvatarMenu();
      btn.focus();
    }
  });
  const first = pop.querySelector(".menu-item");
  if (first) first.focus();
}

document.addEventListener("pointerdown", (e) => {
  const pop = document.getElementById("avatar-pop");
  if (pop && !pop.contains(e.target) && !e.target.closest("#avatar-btn")) closeAvatarMenu();
});
document.addEventListener("app:swap", closeAvatarMenu);

// Sign-in links carry the current location so login can bounce back — the
// same redirect search param the original passes to /login. Capture phase, so
// the href is final before the nav layer reads it.
document.addEventListener(
  "click",
  (e) => {
    const a = e.target.closest && e.target.closest("a[data-auth-signin]");
    if (!a) return;
    const here = location.pathname + location.search;
    a.setAttribute(
      "href",
      here === "/" ? "/login" : `/login?redirect=${encodeURIComponent(here)}`,
    );
  },
  true,
);

// Heart clicks: optimistic toggle, server reconcile, rollback on failure.
// Signed out -> /login with a redirect back here (like the original mutation).
function bumpCount(btn, delta) {
  const n = Math.max(0, (parseInt(btn.dataset.count, 10) || 0) + delta);
  btn.dataset.count = n;
  const span = btn.querySelector(".like-count");
  if (span) {
    span.textContent = n > 0 ? n : 1;
    span.classList.toggle("opacity-0", !(n > 0));
  }
}

function heartPop(btn) {
  const heart = btn.querySelector(".heart-i");
  if (!heart) return;
  heart.classList.remove("heart-pop");
  void heart.getBoundingClientRect().width; // restart the animation
  heart.classList.add("heart-pop");
}

let likeBusy = false;
document.addEventListener("click", async (e) => {
  const btn = e.target.closest && e.target.closest("[data-like-seed]");
  if (!btn) return;
  e.preventDefault();
  await fetchSession();
  if (!sessionUser) {
    const here = location.pathname + location.search;
    navigate(`/login?redirect=${encodeURIComponent(here)}`, true);
    return;
  }
  if (likeBusy) return;
  likeBusy = true;
  // Seed-page button: the URL is the seed's source of truth (it follows live
  // edits); user-set search params override the SSR'd data attrs.
  const seed = btn.hasAttribute("data-like-current")
    ? decodeURIComponent(location.pathname.slice(1))
    : btn.dataset.likeSeed;
  const sp = new URLSearchParams(location.search);
  const style = sp.get("style") || btn.dataset.likeStyle;
  const steps = parseInt(sp.get("steps") || btn.dataset.likeSteps, 10);
  const angle = parseFloat(sp.get("angle") || btn.dataset.likeAngle);
  const wasLiked = likedSeeds.has(seed);
  wasLiked ? likedSeeds.delete(seed) : likedSeeds.add(seed);
  renderLiked();
  bumpCount(btn, wasLiked ? -1 : 1);
  if (!wasLiked) heartPop(btn);
  try {
    const r = await fetch("/api/likes/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed, steps, style, angle }),
    });
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    if (data.liked) likedSeeds.add(seed);
    else likedSeeds.delete(seed);
    renderLiked();
    announce(data.liked ? "Palette saved" : "Palette removed from saved");
  } catch {
    wasLiked ? likedSeeds.add(seed) : likedSeeds.delete(seed);
    renderLiked();
    bumpCount(btn, wasLiked ? 1 : -1);
    announce("Could not update saved palettes");
  } finally {
    likeBusy = false;
  }
});

// Login page: Google OAuth + magic link against better-auth's REST endpoints.
const loginRedirect = () => {
  const form = document.getElementById("login-form");
  return (form && form.dataset.redirect) || "/";
};

function loginStatus(text, isError) {
  const divider = document.getElementById("login-divider");
  if (!divider) return;
  divider.textContent = text;
  divider.classList.toggle("text-red-500", !!isError);
  divider.classList.toggle("text-muted-foreground", !isError);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let retryTimer = 0;
let retryLeft = 0;
let lastSentEmail = "";

function syncLoginSend() {
  const send = document.getElementById("login-send");
  const email = document.getElementById("login-email");
  if (!send || !email) return;
  send.disabled = !EMAIL_RE.test(email.value.trim()) || retryLeft > 0;
  send.textContent =
    retryLeft > 0 ? `Retry (${retryLeft}s)` : lastSentEmail ? "Retry" : "Send magic link";
}

document.addEventListener("input", (e) => {
  if (!e.target || e.target.id !== "login-email") return;
  if (lastSentEmail && e.target.value.trim() !== lastSentEmail) {
    lastSentEmail = "";
    clearInterval(retryTimer);
    retryLeft = 0;
    loginStatus("Or continue with email");
  }
  syncLoginSend();
});

document.addEventListener("submit", async (e) => {
  const form = e.target.closest && e.target.closest("#login-form");
  if (!form) return;
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  if (!EMAIL_RE.test(email)) return loginStatus("Enter a valid email", true);
  const send = document.getElementById("login-send");
  send.disabled = true;
  send.textContent = "Sending...";
  try {
    const r = await fetch("/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, callbackURL: loginRedirect() }),
    });
    if (!r.ok) throw new Error(String(r.status));
    lastSentEmail = email;
    loginStatus("Check your email");
    retryLeft = 30;
    clearInterval(retryTimer);
    retryTimer = setInterval(() => {
      retryLeft -= 1;
      if (retryLeft <= 0) clearInterval(retryTimer);
      syncLoginSend();
    }, 1000);
  } catch {
    loginStatus("Failed to send magic link", true);
  }
  syncLoginSend();
});

document.addEventListener("click", async (e) => {
  const g = e.target.closest && e.target.closest("#login-google");
  if (!g) return;
  g.disabled = true;
  try {
    const r = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: loginRedirect() }),
    });
    const data = await r.json();
    if (!r.ok || !data.url) throw new Error(String(r.status));
    location.href = data.url;
  } catch {
    loginStatus("Failed to sign in with Google", true);
    g.disabled = false;
  }
});

// Session boot is gated on the header's auth slot being present: every real
// page has one, while bare test/embed documents skip the network entirely.
function bootAuth() {
  if (!document.getElementById("auth-slot")) return;
  fetchSession().then(() => {
    applyAuthUi();
    refreshLikes();
  });
}

document.addEventListener("app:swap", () => {
  bootAuth();
  initSeedLike();
  syncLoginSend();
});

bootAuth();
initSeedLike();
syncLoginSend();

syncListMemory();
syncOptsReset();
