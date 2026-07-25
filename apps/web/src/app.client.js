import { copyPaletteCard, downloadPaletteCard } from "./islands/card-actions";
import { paletteCoeffKey } from "./palette";
import { parseSearchInput, searchRouteSegment } from "./search-input";
import {
  getSearchFeedback,
  toggleSearchFeedback,
} from "./search-feedback";
import {
  setAnalyticsUser,
  syncAnalyticsConsent,
  trackEvent,
  trackPageView,
} from "./analytics";

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
const isPaletteListPath = (path = location.pathname) =>
  LIST_PATHS.includes(path) || path.startsWith("/palettes/");
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

const ROUTE_HEAD_SELECTOR = [
  'meta[name="description"]',
  'meta[name="keywords"]',
  'meta[name="robots"]',
  'meta[name="theme-color"]',
  'meta[property^="og:"]',
  'meta[name^="twitter:"]',
  'link[rel="canonical"]',
  "link[data-route-icon]",
  'script[type="application/ld+json"]',
].join(",");

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
    // Route navigation must update the complete document head, not only the
    // title. Keeping stale canonicals, social metadata, robots directives, or
    // JSON-LD after a body swap gives crawlers and link previews the metadata
    // of the page the visitor came from.
    const nextHead = [...doc.head.querySelectorAll(ROUTE_HEAD_SELECTOR)];
    document.head.querySelectorAll(ROUTE_HEAD_SELECTOR).forEach((node) => node.remove());
    nextHead.forEach((node) => document.head.append(node.cloneNode(true)));

    // Backwards-compatible fallback for cached pre-marker HTML during a
    // rolling deploy. Fresh pages use data-route-icon and are already synced.
    if (!nextHead.some((node) => node.hasAttribute("data-route-icon"))) {
      const icon = document.querySelector('link[rel="icon"]');
      const nextIcon = doc.querySelector('link[rel="icon"]');
      if (icon && nextIcon) icon.setAttribute("href", nextIcon.getAttribute("href"));
    }
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

async function navigate(href, push, { preserveScroll = false } = {}) {
  const seq = ++navSeq;
  gc();
  const preservedScroll = preserveScroll ? [scrollX, scrollY] : null;
  if (push) history.pushState({ k: Math.random().toString(36).slice(2, 8) }, "", href);
  const finishScroll = preservedScroll
    ? () => {
        ignoreScroll = true;
        scrollTo(preservedScroll[0], preservedScroll[1]);
        setTimeout(() => (ignoreScroll = false), 0);
      }
    : push
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
if (!isPaletteListPath()) {
  const sp = new URLSearchParams(location.search);
  seedBoot = {
    angle: sp.get("angle") || "",
    steps: sp.get("steps") || "",
    style: sp.get("style") || "",
  };
}
document.addEventListener("app:swap", () => (seedBoot = null));

function optsBaseline() {
  return (!isPaletteListPath() && seedBoot) || { angle: "", steps: "", style: "" };
}

function syncOptsReset() {
  const form = document.getElementById("opts");
  const btn = document.getElementById("opts-reset");
  if (!form || !btn) return;
  const base = optsBaseline();
  let changed = false;
  for (const el of form.elements)
    if (el.name && el.type !== "hidden" && (base[el.name] ?? "") !== rawVal(el))
      changed = true;
  btn.classList.toggle("hidden", !changed);
}
window.__syncOptsReset = syncOptsReset;
document.addEventListener("app:swap", syncOptsReset);

document.addEventListener("change", (e) => {
  // Semantic result pages sort the same result set without leaving the query.
  if (e.target && e.target.id === "query-sort") {
    const p = new URLSearchParams(location.search);
    const fromSort = p.get("sort") || "popular";
    const toSort = e.target.value;
    p.delete("page");
    e.target.value === "popular"
      ? p.delete("sort")
      : p.set("sort", e.target.value);
    trackEvent("change_sort", { fromSort, toSort });
    navigate(location.pathname + (p.size ? `?${p}` : ""), true, {
      preserveScroll: true,
    });
    return;
  }
  // Sort dropdown (NavigationSelect equivalent): navigate to the chosen list
  // route, preserving user params, resetting page.
  if (e.target && e.target.id === "nav-select") {
    const p = new URLSearchParams(location.search);
    const fromSort =
      location.pathname === "/" ? "popular" : location.pathname.slice(1);
    const toSort =
      e.target.value === "/" ? "popular" : e.target.value.replace(/^\//, "");
    p.delete("page");
    trackEvent("change_sort", { fromSort, toSort });
    navigate(e.target.value + (p.size ? "?" + p : ""), true);
    return;
  }
  const form = e.target.closest("#opts");
  if (!form) return;
  if (["angle", "steps", "style"].includes(e.target.name)) {
    const eventName = {
      angle: "change_angle",
      steps: "change_steps",
      style: "change_style",
    }[e.target.name];
    trackEvent(eventName, {
      [`new${e.target.name[0].toUpperCase()}${e.target.name.slice(1)}`]:
        rawVal(e.target),
    });
  }
  const fields = {};
  for (const el of form.elements) if (el.name) fields[el.name] = rawVal(el);
  if (!LIST_PATHS.includes(location.pathname))
    syncListMemory({ name: e.target.name, value: rawVal(e.target) });
  syncOptsReset();
  if (window.__paramsHandler) return window.__paramsHandler(fields);
  const p = new URLSearchParams(location.search);
  for (const k in fields) fields[k] ? p.set(k, fields[k]) : p.delete(k);
  navigate(location.pathname + (p.size ? "?" + p : ""), true, {
    preserveScroll: isPaletteListPath(),
  });
});

document.addEventListener("submit", (e) => {
  const form = e.target;
  if (!form || form.id !== "palette-search") return;
  const input = form.querySelector('input[name="q"]');
  const parsed = parseSearchInput(input?.value ?? "", location.origin);
  if (!parsed) return;
  e.preventDefault();
  const p = new URLSearchParams(location.search);
  p.delete("page");
  p.delete("limit");
  p.delete("export");
  p.delete("q");
  if (location.pathname === "/newest") p.set("sort", "newest");
  else if (location.pathname === "/oldest") p.set("sort", "oldest");
  for (const [key, value] of Object.entries(parsed.searchParams)) p.set(key, value);
  trackEvent("search_query", {
    query: parsed.query,
    isCustomQuery: true,
  });
  const slug = searchRouteSegment(parsed.query);
  navigate(`/palettes/${slug}${p.size ? `?${p}` : ""}`, true);
});

document.addEventListener("input", (e) => {
  if (e.target?.id !== "palette-search-input") return;
  e.target
    .closest("form")
    ?.querySelector("[data-search-clear]")
    ?.classList.toggle("hidden", !e.target.value);
});

document.addEventListener("click", (e) => {
  const clear = e.target.closest && e.target.closest("[data-search-clear]");
  if (!clear) return;
  const input = clear.closest("form")?.querySelector("#palette-search-input");
  if (!input) return;
  input.value = "";
  clear.classList.add("hidden");
  input.focus();
});

// Horizontally overflowing chip rails use native touch panning, plus
// mouse/pen drag-to-scroll on desktop. A moved pointer must not activate the
// link it started over; a stationary press remains a normal click.
const DRAG_SCROLL_THRESHOLD = 8;
let dragScrollState = null;
let suppressDragScrollClick = null;
let suppressDragScrollTimer = 0;

document.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "touch" || e.button !== 0) return;
  const rail = e.target.closest && e.target.closest("[data-drag-scroll]");
  if (!rail) return;
  dragScrollState = {
    rail,
    pointerId: e.pointerId,
    startX: e.clientX,
    startScrollLeft: rail.scrollLeft,
    moved: false,
  };
});

document.addEventListener("pointermove", (e) => {
  const state = dragScrollState;
  if (!state || state.pointerId !== e.pointerId) return;
  const delta = e.clientX - state.startX;
  if (!state.moved) {
    if (Math.abs(delta) < DRAG_SCROLL_THRESHOLD) return;
    state.moved = true;
    // Capturing on pointerdown can retarget an ordinary anchor click to the
    // rail. Wait until this is unquestionably a drag so links stay links.
    if (state.rail.setPointerCapture) {
      try {
        state.rail.setPointerCapture(e.pointerId);
      } catch {}
    }
  }
  e.preventDefault();
  state.rail.classList.add("is-dragging");
  state.rail.scrollLeft = state.startScrollLeft - delta;
});

function finishDragScroll(e) {
  const state = dragScrollState;
  if (!state || state.pointerId !== e.pointerId) return;
  if (state.moved) {
    suppressDragScrollClick = state.rail;
    clearTimeout(suppressDragScrollTimer);
    suppressDragScrollTimer = setTimeout(() => {
      suppressDragScrollClick = null;
    }, 0);
  }
  state.rail.classList.remove("is-dragging");
  if (state.moved && state.rail.releasePointerCapture) {
    try {
      state.rail.releasePointerCapture(e.pointerId);
    } catch {}
  }
  dragScrollState = null;
}

document.addEventListener("pointerup", finishDragScroll);
document.addEventListener("pointercancel", finishDragScroll);
document.addEventListener("dragstart", (e) => {
  if (e.target.closest && e.target.closest("[data-drag-scroll]")) e.preventDefault();
});
document.addEventListener(
  "click",
  (e) => {
    const rail = e.target.closest && e.target.closest("[data-drag-scroll]");
    if (!rail || rail !== suppressDragScrollClick) return;
    suppressDragScrollClick = null;
    clearTimeout(suppressDragScrollTimer);
    e.preventDefault();
    e.stopImmediatePropagation();
  },
  true,
);

// Screen-reader announcements for copy/apply feedback (polite live region).
function announce(msg) {
  const live = document.getElementById("live");
  if (!live) return;
  live.textContent = "";
  live.textContent = msg;
}
// Islands without access to this module's scope (export view) announce via
// a CustomEvent instead.
document.addEventListener("app:announce", (e) => announce(e.detail));

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

function toggleTheme() {
  const dark = document.documentElement.classList.toggle("dark");
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {}
  syncThemeLabel();
}

function hotkeyTargetIsEditable(target) {
  return !!(
    target &&
    target.closest &&
    target.closest("input, textarea, select, [contenteditable]")
  );
}

async function pickColorWithEyeDropper() {
  if (typeof window.EyeDropper !== "function") return;
  try {
    const result = await new window.EyeDropper().open();
    if (!result?.sRGBHex) return;
    await navigator.clipboard.writeText(result.sRGBHex);
    trackEvent("eyedropper_select_color", { color: result.sRGBHex });
    announce(`${result.sRGBHex} copied`);
  } catch {
    // The native picker rejects when the user cancels; that is not an error.
  }
}

function renderSearchFeedback(group) {
  const current = getSearchFeedback(group.dataset.query, group.dataset.seed);
  group.querySelectorAll("[data-search-feedback]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.searchFeedback === current),
    );
  });
}

function syncSearchFeedback() {
  document
    .querySelectorAll("[data-search-feedback-group]")
    .forEach(renderSearchFeedback);
}

// Current Grabient global shortcuts. Inputs keep their native editing
// shortcuts; these fire only from the page chrome/content.
document.addEventListener("keydown", (e) => {
  if (
    e.defaultPrevented ||
    e.repeat ||
    !(e.metaKey || e.ctrlKey) ||
    e.altKey ||
    e.shiftKey ||
    hotkeyTargetIsEditable(e.target)
  )
    return;
  const key = e.key.toLowerCase();
  if (key === "k") {
    e.preventDefault();
    toggleTheme();
  } else if (key === "e") {
    e.preventDefault();
    void pickColorWithEyeDropper();
  }
});

document.addEventListener("click", (e) => {
  const feedback =
    e.target.closest && e.target.closest("[data-search-feedback]");
  if (feedback) {
    e.preventDefault();
    const group = feedback.closest("[data-search-feedback-group]");
    const card = feedback.closest("[data-palette-card]");
    if (!group || !card) return;
    const result = toggleSearchFeedback(
      group.dataset.query,
      group.dataset.seed,
      feedback.dataset.searchFeedback,
    );
    renderSearchFeedback(group);
    trackEvent("search_feedback", {
      query: group.dataset.query,
      seed: group.dataset.seed,
      style: card.dataset.paletteStyle,
      steps: Number(card.dataset.paletteSteps),
      angle: Number(card.dataset.paletteAngle),
      feedback: result.event,
    });
    announce(
      result.event === "clear"
        ? "Palette feedback cleared"
        : result.event === "good"
          ? "Marked as a good match"
          : "Marked as a poor match",
    );
    return;
  }
  const exportToggle =
    e.target.closest && e.target.closest("[data-export-toggle]");
  if (exportToggle) {
    trackEvent(
      exportToggle.getAttribute("aria-pressed") === "true"
        ? "remove_from_export"
        : "add_to_export",
      {
        seed: exportToggle.dataset.exportSeed,
        style: exportToggle.dataset.exportStyle,
        steps: Number(exportToggle.dataset.exportSteps),
        angle: Number(exportToggle.dataset.exportAngle),
      },
    );
  }
  const theme = e.target.closest && e.target.closest("#theme-toggle");
  if (theme) {
    toggleTheme();
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
  const paletteCopy = e.target.closest && e.target.closest("[data-palette-copy]");
  if (paletteCopy) {
    const card = paletteCopy.closest("[data-palette-card]");
    const kind = paletteCopy.dataset.paletteCopy;
    trackEvent(kind === "url" ? "copy_link" : `copy_${kind}`, {
      seed: card?.dataset.paletteSeed,
      style: card?.dataset.paletteStyle,
      steps: Number(card?.dataset.paletteSteps),
      angle: Number(card?.dataset.paletteAngle),
    });
    void copyPaletteCard(paletteCopy);
    return;
  }
  const paletteDownload =
    e.target.closest && e.target.closest("[data-palette-download]");
  if (paletteDownload) {
    e.preventDefault();
    if (paletteDownload.getAttribute("aria-expanded") === "true") {
      closeMenu();
    } else {
      showMenu(
        paletteDownload,
        [
          { value: "svg", label: "SVG" },
          { value: "png", label: "PNG" },
        ],
        (kind) => {
          const card = paletteDownload.closest("[data-palette-card]");
          trackEvent(`download_${kind}`, {
            seed: card?.dataset.paletteSeed,
            style: card?.dataset.paletteStyle,
            steps: Number(card?.dataset.paletteSteps),
            angle: Number(card?.dataset.paletteAngle),
          });
          void downloadPaletteCard(paletteDownload, kind);
        },
      );
    }
    return;
  }
  const t = e.target.closest && e.target.closest("[data-copy]");
  if (t && navigator.clipboard) {
    navigator.clipboard.writeText(t.getAttribute("data-copy")).then(() => {
      const info = document.querySelector("[data-like-info]");
      const current = info
        ? {
            seed: heartSeed(info),
            style: info.dataset.likeStyle,
            steps: Number(info.dataset.likeSteps),
            angle: Number(info.dataset.likeAngle),
          }
        : {};
      const codePanel = t.closest("#export-code");
      if (codePanel) {
        const activeId = codePanel
          .querySelector("[data-code-panel]:not(.hidden)")
          ?.getAttribute("data-code-panel");
        const eventName = {
          "css-code": "copy_css",
          "svg-code": "copy_svg",
          "colors-code": "copy_colors",
          "shader-code": "copy_vectors",
          "coeffs-code": "copy_vectors",
        }[activeId];
        if (eventName) trackEvent(eventName, current);
      } else if (t.closest(".swatch-item")) {
        trackEvent("copy_colors", {
          ...current,
          color: t.getAttribute("data-copy"),
        });
      }
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
        const info = document.querySelector("[data-like-info]");
        trackEvent("copy_colors", {
          seed: info ? heartSeed(info) : undefined,
          style: info?.dataset.likeStyle,
          steps: Number(info?.dataset.likeSteps),
          angle: Number(info?.dataset.likeAngle),
          color: best.hex,
        });
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
  const sourceRoute = location.pathname;
  const sourceSearch = new URLSearchParams(location.search);
  const paletteEdit = a.closest("[data-palette-card]")?.querySelector(
    "a.palette-card-edit",
  );
  if (paletteEdit === a) {
    const card = a.closest("[data-palette-card]");
    trackEvent("view_gradient", {
      seed: card?.dataset.paletteSeed,
      style: card?.dataset.paletteStyle,
      steps: Number(card?.dataset.paletteSteps),
      angle: Number(card?.dataset.paletteAngle),
      sourceRoute,
    });
  }
  if (a.closest(".pages")) {
    trackEvent("paginate", {
      sourceRoute,
      fromPage: Number(sourceSearch.get("page") || 1),
      toPage: Number(u.searchParams.get("page") || 1),
    });
  }
  if (a.hasAttribute("data-search-tag")) {
    const current = new URLSearchParams(location.search);
    for (const key of ["style", "steps", "angle"]) {
      const value = current.get(key);
      value ? u.searchParams.set(key, value) : u.searchParams.delete(key);
    }
    u.searchParams.delete("page");
    trackEvent("search_query", {
      query: decodeURIComponent(u.pathname.replace(/^\/palettes\//, "")).replace(
        /-/g,
        " ",
      ),
      isCustomQuery: false,
    });
  }
  e.preventDefault();
  if (u.pathname === location.pathname && u.search === location.search) {
    const el = u.hash && document.getElementById(u.hash.slice(1));
    if (el) el.scrollIntoView();
    return;
  }
  navigate(u.pathname + u.search, true);
});

addEventListener("storage", (event) => {
  if (event.key === "search-feedback") syncSearchFeedback();
});
document.addEventListener("app:swap", syncSearchFeedback);
syncSearchFeedback();

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
document.addEventListener(
  "pointerdown",
  (e) => {
    if (e.pointerType === "mouse") return;
    const target = e.target;
    if (!target || !target.closest) return;

    const card = target.closest("[data-palette-card]");
    document.querySelectorAll("[data-palette-card].actions-open").forEach((open) => {
      if (open !== card) {
        if (open.contains(document.activeElement) && document.activeElement.blur)
          document.activeElement.blur();
        open.classList.remove("actions-open");
      }
    });
    if (card && !target.closest("[data-palette-card-action]")) {
      if (
        card.classList.contains("actions-open") &&
        card.contains(document.activeElement) &&
        document.activeElement.blur
      )
        document.activeElement.blur();
      card.classList.toggle("actions-open");
      return;
    }

    const hero = document.getElementById("seed-hero");
    if (hero && target.closest("#edit-preview")) hero.classList.toggle("ui-show");
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
  let left = trigger.dataset.menuAlign === "end" ? r.right - pw : r.left;
  left = Math.max(8, Math.min(left, innerWidth - pw - 8));
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
    // Non-interactive category header (export size presets).
    if (it.header) {
      const d = document.createElement("div");
      d.className = "menu-header";
      d.textContent = it.label;
      pop.append(d);
      return;
    }
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
      const opts = [...pop.querySelectorAll(".menu-item")];
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
  const sel = pop.querySelector('[aria-selected="true"]') || pop.querySelector(".menu-item");
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

// Cross-module access for islands that render their own triggers (the export
// view's Copy/Download/presets menus) — same window-hook pattern as
// __paramsHandler/__popstateHandler.
window.__menu = { showMenu, menuTrigger, closeMenu };

function enhanceMenus() {
  closeMenu();
  document.querySelectorAll("select[data-enhance-select]").forEach((sel) => {
    if (sel.dataset.enhanced) return;
    sel.dataset.enhanced = "1";
    const wrap = sel.closest("span");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.dataset.selectTrigger = "1";
    trigger.className =
      sel.className.replace("appearance-none", "") +
      " inline-flex items-center justify-between text-left";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", sel.getAttribute("aria-label") || "");
    trigger.disabled = sel.disabled;
    const syncLabel = () => {
      const opt =
        sel.options[sel.selectedIndex] ||
        [...sel.options].find((o) => o.selected || o.defaultSelected) ||
        sel.options[0];
      const value = sel.value || (opt && opt.value) || "";
      const text = value && opt ? opt.textContent : sel.dataset.placeholder || "";
      trigger.innerHTML =
        '<span class="truncate">' +
        text +
        '</span><svg class="ml-1.5 h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>';
      trigger.classList.toggle("text-foreground!", value !== "");
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

// Export mode keeps the subheader geometry stable: browse + palette options
// remain rendered but disabled, while Reset is removed until export closes.
window.__renderNavSelectForExport = (open) => {
  // Tests and client swaps can mount fresh SSR markup after the initial boot.
  // Ensure its select triggers exist before applying the shared disabled state.
  enhanceMenus();
  closeMenu();
  const controls = document.querySelectorAll(
    '#nav-select, #query-sort, button[data-select-trigger][aria-label="Browse palettes"], button[data-select-trigger][aria-label="Sort search results"], #opts input, #opts select, #opts button[data-select-trigger], #opts .preset-btn',
  );
  for (const control of controls) {
    if ("disabled" in control) control.disabled = open;
  }
  const reset = document.getElementById("opts-reset");
  if (reset) reset.classList.toggle("hidden", open);
  if (!open) syncOptsReset();
};

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

// Contact form: explicitly render Turnstile so it survives SPA body swaps,
// then submit to the Worker's validated, rate-limited Resend endpoint.
let turnstileLoader = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileLoader) return turnstileLoader;
  turnstileLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-grabient-turnstile]');
    const script = existing || document.createElement("script");
    script.addEventListener("load", () => resolve(window.turnstile), {
      once: true,
    });
    script.addEventListener("error", reject, { once: true });
    if (!existing) {
      script.dataset.grabientTurnstile = "1";
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  });
  return turnstileLoader;
}

function bootContact() {
  const form = document.getElementById("contact-form");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "1";
  const submit = form.querySelector('button[type="submit"]');
  const status = form.querySelector("#contact-status");
  const widget = form.querySelector("#contact-turnstile");
  let token = "";
  let widgetId;
  const showError = (message) => {
    status.textContent = message;
    status.classList.remove("hidden");
    announce(message);
  };
  const syncSubmit = () => {
    submit.disabled = !token || !form.checkValidity();
  };
  form.addEventListener("input", syncSubmit);
  loadTurnstile()
    .then((turnstile) => {
      if (!turnstile || !widget?.isConnected) throw new Error("Unavailable");
      widgetId = turnstile.render(widget, {
        sitekey: form.dataset.turnstileSiteKey,
        theme: "auto",
        appearance: "interaction-only",
        callback: (value) => {
          token = value;
          status.classList.add("hidden");
          syncSubmit();
        },
        "expired-callback": () => {
          token = "";
          syncSubmit();
        },
        "error-callback": () => {
          token = "";
          syncSubmit();
          showError("Verification failed. Please try again.");
        },
      });
    })
    .catch(() => showError("Verification could not load. Please refresh and try again."));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!token) {
      showError("Please complete the verification.");
      return;
    }
    status.classList.add("hidden");
    submit.disabled = true;
    submit.textContent = "Sending...";
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.querySelector("#contact-email")?.value.trim() || undefined,
          subject: form.querySelector("#contact-subject")?.value || undefined,
          message: form.querySelector("#contact-message")?.value.trim(),
          turnstileToken: token,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to send message.");
      trackEvent("contact_form_submit");
      document.getElementById("contact-heading").innerHTML =
        '<div class="mb-4 flex items-center justify-center text-4xl" aria-hidden="true">✓</div>' +
        '<h1 class="text-3xl font-bold text-foreground">Message Sent</h1>' +
        '<p class="text-muted-foreground">Thank you!</p>' +
        '<a href="/" class="mt-6 inline-flex h-10 items-center justify-center rounded-md border border-solid border-input bg-background px-4 text-sm font-medium text-muted-foreground hover:text-foreground">Back to Home</a>';
      form.remove();
      announce("Message sent");
    } catch (error) {
      token = "";
      if (window.turnstile && widgetId != null) window.turnstile.reset(widgetId);
      submit.textContent = "Send Message";
      syncSubmit();
      showError(error.message || "Failed to send message. Please try again later.");
    }
  });
}

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
    sessionPromise = fetch("/api/auth/get-session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        sessionUser = d && d.user ? d.user : null;
        setAnalyticsUser(sessionUser);
        return sessionUser;
      })
      .catch(() => {
        // A transient failure must not latch "signed out" for the whole tab —
        // clear the memo so the next boot/swap retries.
        sessionUser = null;
        sessionPromise = null;
      });
  }
  return sessionPromise;
}

// A heart button has TWO seed values. data-like-seed is the coefficient key —
// the palette's identity across all its stored seed aliases (legacy ids embed
// view params, v3 ids embed tweaked globals); heart fill, labels and the
// liked set all match on it. The STORAGE seed is what a like insert records:
// the card's palettes-row id (data-like-row) so counts keep joining the row
// they display on, or the live URL seed on the seed page (tracks edits).
function heartKey(btn) {
  return btn.dataset.likeSeed;
}

function heartSeed(btn) {
  return btn.hasAttribute("data-like-current")
    ? btn.dataset.likeRow || decodeURIComponent(location.pathname.slice(1))
    : btn.dataset.likeRow || btn.dataset.likeSeed;
}

// Liked hearts get "Unsave palette", others "Save palette" — the original's
// aria-label + tooltip pair. Patched on renderLiked and whenever island
// re-renders swap in fresh heart DOM (observer below); the tooltip singleton
// reads data-tip at hover time, so it follows automatically.
function syncHeartLabels() {
  document.querySelectorAll("[data-like-seed]").forEach((b) => {
    const label = likedSeeds.has(heartKey(b)) ? "Unsave palette" : "Save palette";
    if (b.getAttribute("aria-label") !== label) b.setAttribute("aria-label", label);
    if (b.getAttribute("data-tip") !== label) b.setAttribute("data-tip", label);
  });
}

let labelRaf = 0;
new MutationObserver((recs) => {
  for (const r of recs)
    for (const n of r.addedNodes)
      if (
        n.nodeType === 1 &&
        (n.hasAttribute?.("data-like-seed") || n.querySelector?.("[data-like-seed]"))
      ) {
        cancelAnimationFrame(labelRaf);
        labelRaf = requestAnimationFrame(syncHeartLabels);
        return;
      }
}).observe(document.body, { childList: true, subtree: true });

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
  syncHeartLabels();
}

let likesFetchedAt = 0;
let likeMutationVersion = 0;
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

// List HTML is no-store so SSR paints current counts. Reconcile every visible
// coefficient key as a safety net for a mutation racing the list query.
// Schedule in a microtask so the Solid grid replaces #grid-ssr first.
async function initListLikeCounts() {
  const buttons = [
    ...document.querySelectorAll("[data-like-seed]:not([data-like-info])"),
  ];
  if (!buttons.length) return;
  const keys = [...new Set(buttons.map((btn) => heartKey(btn)).filter(Boolean))];
  if (!keys.length) return;
  const mutationVersion = likeMutationVersion;
  try {
    const r = await fetch(
      `/api/like-counts?keys=${encodeURIComponent(keys.join(","))}`,
    );
    if (!r.ok) return;
    const { counts = {} } = await r.json();
    // Never let a response started before a click overwrite the authoritative
    // toggle response or its optimistic state.
    if (mutationVersion !== likeMutationVersion) return;
    for (const btn of buttons) {
      if (!btn.isConnected) continue;
      const count = counts[heartKey(btn)];
      if (typeof count === "number") setCount(btn, count);
    }
  } catch {}
}

function scheduleListLikeCounts() {
  queueMicrotask(initListLikeCounts);
}
document.addEventListener("likes:refresh-counts", scheduleListLikeCounts);

// The seed page can't SSR its like count (its HTML is edge-cached): fill count
// + liked state per view. isLiked matches by coefficient key server-side, so
// any alias of this palette lights the heart.
let seedLikeRequestVersion = 0;
let seedLikeTimer = 0;

async function fetchSeedLikeInfo(btn, seed) {
  const requestVersion = ++seedLikeRequestVersion;
  try {
    const r = await fetch(`/api/like-info?seed=${encodeURIComponent(seed)}`);
    if (!r.ok) return;
    const info = await r.json();
    // The palette may have changed, or the page may have swapped, while the
    // request was in flight.
    if (
      requestVersion !== seedLikeRequestVersion ||
      !btn.isConnected ||
      btn.dataset.likeRow !== seed
    )
      return;
    setCount(btn, info.likesCount);
    if (info.isLiked) likedSeeds.add(heartKey(btn));
    else likedSeeds.delete(heartKey(btn));
    renderLiked();
  } catch {}
}

function syncSeedLikePalette(detail, fetchNow = false) {
  const btn = document.querySelector("[data-like-info]");
  if (!btn || !detail?.seed) return;
  const key = paletteCoeffKey(detail.seed) || detail.seed;
  const changed = heartKey(btn) !== key;
  btn.dataset.likeSeed = key;
  btn.dataset.likeRow = detail.seed;
  if (detail.style) btn.dataset.likeStyle = detail.style;
  if (Number.isFinite(detail.steps)) btn.dataset.likeSteps = String(detail.steps);
  if (Number.isFinite(detail.angle)) btn.dataset.likeAngle = String(detail.angle);
  if (changed) setCount(btn, 0);
  renderLiked();
  clearTimeout(seedLikeTimer);
  seedLikeTimer = setTimeout(
    () => void fetchSeedLikeInfo(btn, detail.seed),
    fetchNow ? 0 : 250,
  );
}

function initSeedLike() {
  const btn = document.querySelector("[data-like-info]");
  if (!btn) return;
  const seed = decodeURIComponent(location.pathname.slice(1));
  const sp = new URLSearchParams(location.search);
  syncSeedLikePalette(
    {
      seed,
      style: sp.get("style") || btn.dataset.likeStyle,
      steps: Number(sp.get("steps") || btn.dataset.likeSteps),
      angle: Number(sp.get("angle") || btn.dataset.likeAngle),
    },
    true,
  );
}

document.addEventListener("palette:change", (event) => {
  syncSeedLikePalette(event.detail);
});

// Header slot: the SSR placeholder circle becomes the avatar + dropdown when
// signed in, or the Sign in button when signed out. Runs again after every
// body swap (cached session). Per-user pages (/saved, /settings) SSR the
// avatar themselves — then there's nothing to swap.
const SIGNIN_HTML = `<a href="/login" data-auth-signin class="inline-flex h-8 cursor-pointer select-none items-center rounded-md border border-transparent bg-foreground/80 px-2.5 text-xs font-medium text-background transition-colors duration-200 outline-none hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring/70">Sign in</a>`;

function applyAuthUi() {
  const slot = document.getElementById("auth-slot");
  if (!slot) return;
  if (!sessionUser) {
    if (slot.querySelector("[data-auth-placeholder]")) slot.innerHTML = SIGNIN_HTML;
    return;
  }
  const u = sessionUser;
  const existing = slot.querySelector("#avatar-btn");
  if (existing) {
    // SSR'd avatar (per-user pages): rewire the click, skip the re-render.
    if (!existing.dataset.wired) {
      existing.dataset.wired = "1";
      existing.addEventListener("click", () => {
        if (document.getElementById("avatar-pop")) return closeAvatarMenu();
        openAvatarMenu(existing);
      });
    }
    return;
  }
  const face = u.image
    ? `<img src="${escHtml(u.image)}" alt="" referrerpolicy="no-referrer" class="h-full w-full rounded-full object-cover">`
    : `<span class="flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">${escHtml((u.username || u.email || "?").charAt(0).toUpperCase())}</span>`;
  slot.innerHTML = `<button id="avatar-btn" type="button" aria-label="User menu" aria-haspopup="menu" aria-expanded="false" class="h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-solid border-input outline-none transition-colors duration-200 hover:border-muted-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/70">${face}</button>`;
  const btn = slot.querySelector("#avatar-btn");
  btn.dataset.wired = "1";
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

async function signOut() {
  try {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {}
  trackEvent("logout");
  // Full load: clears every piece of per-session state at once.
  location.href = "/";
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
    `<a href="/settings" role="menuitem" class="menu-item block">Settings</a>` +
    `<a href="/saved" role="menuitem" class="menu-item block">Saved palettes</a>` +
    `<button type="button" id="signout-btn" role="menuitem" class="menu-item w-full text-left">Sign out</button>`;
  document.body.append(pop);
  positionPop(pop, btn);
  btn.setAttribute("aria-expanded", "true");
  pop.querySelector("#signout-btn").addEventListener("click", signOut);
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
// The server response carries the AUTHORITATIVE count: optimistic bumps are
// corrected from it (a misjudged wasLiked used to leave the count off by 2 —
// an "unlike" that displayed +1).
function setCount(btn, n) {
  n = Math.max(0, n | 0);
  btn.dataset.count = n;
  const span = btn.querySelector(".like-count");
  if (span) {
    span.textContent = n > 0 ? n : 1;
    span.classList.toggle("opacity-0", !(n > 0));
  }
}

function bumpCount(btn, delta) {
  setCount(btn, (parseInt(btn.dataset.count, 10) || 0) + delta);
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
  likeMutationVersion += 1;
  // key = identity (fill/labels); seed = what a like insert stores (the card's
  // palettes-row id, or the live URL seed on the seed page). User-set search
  // params override the SSR'd data attrs, like the original's effective*.
  const key = heartKey(btn);
  const seed = heartSeed(btn);
  const sp = new URLSearchParams(location.search);
  const style = sp.get("style") || btn.dataset.likeStyle;
  const steps = parseInt(sp.get("steps") || btn.dataset.likeSteps, 10);
  const angle = parseFloat(sp.get("angle") || btn.dataset.likeAngle);
  const wasLiked = likedSeeds.has(key);
  wasLiked ? likedSeeds.delete(key) : likedSeeds.add(key);
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
    const serverKey = data.key || key;
    if (data.liked) likedSeeds.add(serverKey);
    else likedSeeds.delete(serverKey);
    renderLiked();
    if (typeof data.likesCount === "number") setCount(btn, data.likesCount);
    trackEvent(data.liked ? "save_gradient" : "unsave_gradient", {
      seed,
      style,
      steps,
      angle,
    });
    announce(data.liked ? "Palette saved" : "Palette removed from saved");
    // Unsaving on /saved removes the card with a 10s undo (the original's
    // UndoButton + ⌘Z); undo re-likes and reinserts it.
    if (!data.liked && location.pathname === "/saved")
      showUndo({ seed, steps, style, angle, key: serverKey, ...removeCard(btn) });
  } catch {
    wasLiked ? likedSeeds.add(key) : likedSeeds.delete(key);
    renderLiked();
    bumpCount(btn, wasLiked ? 1 : -1);
    announce("Could not update saved palettes");
  } finally {
    likeBusy = false;
  }
});

// Undo-unsave: fixed toast with an Undo button, 10s window, ⌘Z hotkey. On
// /saved the unliked card leaves the grid (that's the point of the page);
// undo re-likes AND reinserts the stored <li> at its original position.
let undoSaved = null; // { seed, steps, style, angle, key, node, parent, next, emptyNote, timer }

// Remove the card <li> holding btn; returns the refs needed to reinsert it.
// When the grid empties, swap in the SSR empty-state <p> (the <ol> stays in
// the DOM, hidden, so reinsertion is trivial).
function removeCard(btn) {
  const li = btn.closest("li");
  const parent = li && li.parentNode;
  if (!li || !parent) return {};
  const next = li.nextSibling;
  li.remove();
  let emptyNote = null;
  if (!parent.querySelector("li")) {
    emptyNote = document.createElement("p");
    emptyNote.className = "py-16 text-center text-muted-foreground";
    emptyNote.textContent = "You haven't saved any palettes yet.";
    parent.style.display = "none";
    parent.after(emptyNote);
  }
  return { node: li, parent, next, emptyNote };
}

function hideUndo() {
  if (undoSaved) clearTimeout(undoSaved.timer);
  undoSaved = null;
  const el = document.getElementById("undo-unsave");
  if (el) el.remove();
}

function showUndo(payload) {
  hideUndo();
  const el = document.createElement("div");
  el.id = "undo-unsave";
  el.className =
    "fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-solid border-input bg-background py-2 pl-4 pr-2 text-sm text-foreground shadow-lg";
  el.innerHTML =
    `<span class="whitespace-nowrap">Palette removed</span>` +
    `<button type="button" id="undo-unsave-btn" aria-keyshortcuts="Control+Z Meta+Z" data-tip="Undo (Ctrl/⌘ Z)" data-tip-side="top" class="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-3 text-sm font-medium text-background transition-colors duration-200 hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">` +
    `<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/></svg>Undo</button>`;
  document.body.append(el);
  el.querySelector("#undo-unsave-btn").addEventListener("click", doUndo);
  undoSaved = { ...payload, timer: setTimeout(hideUndo, 10000) };
}

async function doUndo() {
  const item = undoSaved;
  if (!item || likeBusy) return;
  hideUndo();
  likeBusy = true;
  likeMutationVersion += 1;
  try {
    const r = await fetch("/api/likes/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seed: item.seed,
        steps: item.steps,
        style: item.style,
        angle: item.angle,
      }),
    });
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    if (data.liked) {
      // Reinsert the card at its old spot (undoing the removeCard above).
      if (item.node && item.parent) {
        if (item.emptyNote) {
          item.emptyNote.remove();
          item.parent.style.display = "";
        }
        item.parent.insertBefore(
          item.node,
          item.next && item.next.isConnected ? item.next : null,
        );
      }
      const serverKey = data.key || item.key || item.seed;
      likedSeeds.add(serverKey);
      renderLiked();
      const btn = item.node && item.node.querySelector("[data-like-seed]");
      if (btn) {
        if (typeof data.likesCount === "number") setCount(btn, data.likesCount);
        else bumpCount(btn, 1);
      }
      announce("Palette saved");
    }
  } catch {
    announce("Could not update saved palettes");
  } finally {
    likeBusy = false;
  }
}

document.addEventListener("keydown", (e) => {
  if (
    (e.metaKey || e.ctrlKey) &&
    !e.shiftKey &&
    e.key.toLowerCase() === "z" &&
    undoSaved &&
    !(e.target.closest && e.target.closest("input, textarea, select, [contenteditable]"))
  ) {
    e.preventDefault();
    doUndo();
  }
});
// Body swaps drop the toast element; navigating away abandons the undo window.
document.addEventListener("app:swap", hideUndo);

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

// ---------------------------------------------------------------------------
// Settings page: username editing (inline validation + 500ms-debounced
// availability probe, the original's TanStack Form behavior), sign out, and
// the two-step account delete (request -> emailed token link -> confirm).
const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

function usernameError(v) {
  if (!v) return "";
  if (v.length < 3) return "Username must be at least 3 characters";
  if (v.length > 30) return "Username must be no more than 30 characters";
  if (!USERNAME_RE.test(v))
    return "Username can only contain letters, numbers, underscores, and hyphens";
  return "";
}

// Avatar upload, ported from the original's AvatarUpload.tsx: client-side
// canvas center-crop to a 256x256 webp (the original's imageCompression step
// is redundant once the canvas downsamples), staged until "Save changes".
let stagedAvatar = null; // { blob, previewUrl }
let syncSaveBtn = () => {}; // wireUsernameForm installs its sync() here

function processAvatarFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const size = 256;
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(
          img,
          (img.naturalWidth - s) / 2,
          (img.naturalHeight - s) / 2,
          s, s, 0, 0, size, size,
        );
        canvas.toBlob(
          (b) => {
            URL.revokeObjectURL(url);
            if (b) resolve(b);
            else reject(new Error("Failed to create blob"));
          },
          "image/webp",
          0.9,
        );
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

function clearStagedAvatar() {
  if (!stagedAvatar) return;
  URL.revokeObjectURL(stagedAvatar.previewUrl);
  stagedAvatar = null;
  const face = document.getElementById("settings-avatar");
  if (face && face.dataset.original) face.innerHTML = face.dataset.original;
  const btn = document.getElementById("avatar-change");
  if (btn) btn.textContent = "Change avatar";
}

function wireAvatarUpload() {
  const input = document.getElementById("avatar-upload");
  const btn = document.getElementById("avatar-change");
  const face = document.getElementById("settings-avatar");
  if (!input || !btn || !face) return;
  if (!face.dataset.original) face.dataset.original = face.innerHTML;
  if (btn.dataset.wired) return;
  btn.dataset.wired = "1";
  btn.addEventListener("click", () => {
    if (stagedAvatar) {
      clearStagedAvatar();
      syncSaveBtn();
    } else {
      input.click();
    }
  });
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type))
      return announce("Please select a valid image file (JPEG, PNG, or WebP)");
    if (file.size > 5 * 1024 * 1024)
      return announce("File size must be less than 5MB");
    try {
      const blob = await processAvatarFile(file);
      clearStagedAvatar();
      stagedAvatar = { blob, previewUrl: URL.createObjectURL(blob) };
      face.innerHTML = `<img src="${stagedAvatar.previewUrl}" alt="Avatar preview" class="h-full w-full rounded-full object-cover">`;
      btn.textContent = "Cancel";
    } catch {
      announce("Failed to process image. Please try again.");
    }
    syncSaveBtn();
  });
}

async function uploadStagedAvatar() {
  const r = await fetch("/api/settings/avatar", {
    method: "POST",
    headers: { "Content-Type": "image/webp" },
    body: stagedAvatar.blob,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Avatar upload failed");
  // Point the profile preview at the stored URL and make it the new restore
  // point, then rebuild the header avatar with the new image.
  const face = document.getElementById("settings-avatar");
  if (face) {
    face.innerHTML = `<img src="${d.imageUrl}" alt="Avatar" class="h-full w-full rounded-full object-cover">`;
    face.dataset.original = face.innerHTML;
  }
  URL.revokeObjectURL(stagedAvatar.previewUrl);
  stagedAvatar = null;
  const changeBtn = document.getElementById("avatar-change");
  if (changeBtn) changeBtn.textContent = "Change avatar";
  if (sessionUser) sessionUser.image = d.imageUrl;
  const headerBtn = document.getElementById("avatar-btn");
  if (headerBtn) {
    headerBtn.remove();
    applyAuthUi();
  }
  return d.imageUrl;
}

function wireUsernameForm(form) {
  const input = document.getElementById("settings-username");
  const save = document.getElementById("settings-save");
  const status = document.getElementById("username-status");
  if (!input || !save || !status) return;
  let checkTimer = 0;
  let checkSeq = 0;
  let checking = false;
  let available = true;

  const setStatus = (text, tone) => {
    status.textContent = text;
    status.className =
      "font-system text-sm font-medium " +
      (tone === "error"
        ? "text-red-500"
        : tone === "ok"
          ? "text-green-600 dark:text-green-400"
          : "text-muted-foreground");
  };

  const sync = () => {
    const v = input.value.trim();
    const changed = v !== (form.dataset.current || "");
    const err = usernameError(v);
    // A staged avatar also makes the form submittable (upload rides along).
    save.disabled = (!changed || !!err || checking || !available) && !stagedAvatar;
    return { v, changed, err };
  };
  syncSaveBtn = sync;

  input.addEventListener("input", () => {
    const { v, changed, err } = sync();
    clearTimeout(checkTimer);
    available = true;
    if (status.textContent && status.textContent !== "Checking availability...")
      setStatus("", null);
    if (!v || err || !changed) return;
    checkTimer = setTimeout(async () => {
      const seq = ++checkSeq;
      checking = true;
      setStatus("Checking availability...", null);
      sync();
      try {
        const r = await fetch("/api/settings/username/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: v }),
        });
        const d = await r.json();
        if (seq !== checkSeq) return;
        available = !!d.available;
        setStatus(available ? "" : "Username already taken", available ? null : "error");
      } catch {
        if (seq !== checkSeq) return;
        setStatus("Unable to check username availability", "error");
      } finally {
        if (seq === checkSeq) {
          checking = false;
          sync();
        }
      }
    }, 500);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { v, changed, err } = sync();
    const canUsername = changed && !err && !checking && available;
    if (!canUsername && !stagedAvatar) return;
    save.disabled = true;
    save.textContent = "Saving...";
    try {
      // Avatar first, then the username — the original's submit order.
      if (stagedAvatar) {
        await uploadStagedAvatar();
        setStatus("Avatar updated successfully", "ok");
        announce("Avatar updated");
      }
      if (canUsername) {
        const r = await fetch("/api/settings/username", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: v }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.status === 409) {
          available = false;
          setStatus("Username already taken", "error");
        } else if (!r.ok) {
          setStatus(d.error || "Failed to update username", "error");
        } else {
          form.dataset.current = v;
          if (sessionUser) sessionUser.username = v;
          applyAuthUi();
          setStatus("Username updated successfully", "ok");
          announce("Username updated");
        }
      }
    } catch (e2) {
      setStatus((e2 && e2.message) || "Failed to save changes", "error");
    } finally {
      save.textContent = "Save changes";
      sync();
    }
  });
}

async function onDeleteAccount(e) {
  const btn = e.currentTarget;
  const title = document.getElementById("delete-title");
  const desc = document.getElementById("delete-desc");
  const setState = (t, d) => {
    if (title) title.textContent = t;
    if (desc) desc.textContent = d;
  };
  const token = btn.dataset.token;
  btn.disabled = true;
  if (!token) {
    // Step 1: better-auth emails the confirmation link (/settings?token=…).
    try {
      const r = await fetch("/api/auth/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) throw new Error(String(r.status));
      setState("Check your email", "We sent a confirmation link to your email address");
    } catch {
      btn.disabled = false;
      setState("Delete account", "Failed to send the confirmation email — try again");
    }
    return;
  }
  // Step 2: back from the email with ?token= — confirm the deletion.
  setState("Verifying...", "Deleting your account...");
  try {
    const r = await fetch("/api/settings/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!r.ok) throw new Error(String(r.status));
    // The user no longer exists; clear the dead session cookie and leave.
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {}
    location.href = "/";
  } catch {
    btn.disabled = false;
    setState("Verification failed", "This link may have expired or is invalid");
  }
}

function bootSettings() {
  // Arriving via the emailed deletion link: bring the danger zone into view.
  const dz = document.getElementById("danger-zone");
  if (dz && !dz.dataset.scrolled && new URLSearchParams(location.search).has("token")) {
    dz.dataset.scrolled = "1";
    dz.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  const signoutBtn = document.getElementById("settings-signout");
  if (signoutBtn && !signoutBtn.dataset.wired) {
    signoutBtn.dataset.wired = "1";
    signoutBtn.addEventListener("click", signOut);
  }
  const deleteBtn = document.getElementById("delete-account-btn");
  if (deleteBtn && !deleteBtn.dataset.wired) {
    deleteBtn.dataset.wired = "1";
    deleteBtn.addEventListener("click", onDeleteAccount);
  }
  const form = document.getElementById("settings-username-form");
  if (form && !form.dataset.wired) {
    form.dataset.wired = "1";
    wireUsernameForm(form);
  }
  wireAvatarUpload();
}

// ---------------------------------------------------------------------------
// Consent preferences — port of the original's stores/consent-store.ts. Same
// localStorage key + schema version so a visitor's choice carries between
// this frontend and the React app; same Zaraz purpose IDs and sync semantics
// (no-op where Zaraz isn't loaded, e.g. workers.dev).
const CONSENT_KEY = "consent-preferences";
const CONSENT_VERSION = 3;
const ZARAZ_PURPOSE_IDS = { analytics: "HdWd", sessionReplay: "mxdH", advertising: "daJQ" };

function consentDefaults(isGdpr) {
  return {
    version: CONSENT_VERSION,
    timestamp: Date.now(),
    categories: {
      necessary: true,
      analytics: !isGdpr,
      sessionReplay: false,
      advertising: !isGdpr,
    },
    hasInteracted: false,
    isGdprRegion: isGdpr,
  };
}

function loadConsent() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const cats = s && s.categories;
    if (
      !s ||
      s.version !== CONSENT_VERSION ||
      !cats ||
      typeof cats.analytics !== "boolean" ||
      typeof cats.sessionReplay !== "boolean" ||
      typeof cats.advertising !== "boolean"
    ) {
      localStorage.removeItem(CONSENT_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

let consentState = loadConsent();

function saveConsent() {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consentState));
  } catch {}
}

function syncConsentToZaraz() {
  if (typeof zaraz === "undefined" || !zaraz.consent || !zaraz.consent.APIReady) return;
  if (!consentState) return;
  const available = zaraz.consent.purposes || {};
  const useDefaults = consentState.isGdprRegion && !consentState.hasInteracted;
  const prefs = {};
  for (const name of Object.keys(ZARAZ_PURPOSE_IDS)) {
    const id = ZARAZ_PURPOSE_IDS[name];
    if (id in available) prefs[id] = useDefaults ? false : consentState.categories[name];
  }
  if (!Object.keys(prefs).length) return;
  try {
    zaraz.consent.set(prefs);
    // Non-GDPR defaults are an affirmative resolved choice too. Flush events
    // Zaraz queued while /api/geo was resolving; GDPR defaults stay queued
    // until the visitor explicitly opts in.
    if (consentState.hasInteracted || !useDefaults)
      zaraz.consent.sendQueuedEvents();
  } catch {}
}

function syncConsentToAnalytics() {
  if (!consentState) return;
  const analytics =
    consentState.isGdprRegion && !consentState.hasInteracted
      ? false
      : consentState.categories.analytics;
  syncAnalyticsConsent(analytics, analytics && consentState.categories.sessionReplay);
}

document.addEventListener("zarazConsentAPIReady", syncConsentToZaraz);

function renderConsentToggles() {
  if (!consentState) return;
  for (const btn of document.querySelectorAll("[data-consent]")) {
    const on = !!consentState.categories[btn.dataset.consent];
    btn.dataset.state = on ? "checked" : "unchecked";
    btn.setAttribute("aria-checked", on ? "true" : "false");
    const thumb = btn.firstElementChild;
    if (thumb) thumb.dataset.state = on ? "checked" : "unchecked";
  }
}

// First-visit defaults come from the request's geo. The settings page carries
// it in #privacy[data-gdpr] (per-user SSR); elsewhere we ask /api/geo — but
// only when nothing is stored, so regular page loads never pay the fetch.
function bootConsent() {
  // Same gate as bootAuth: bare test/embed documents skip the network.
  if (!document.getElementById("auth-slot")) return;
  const privacy = document.getElementById("privacy");
  // Wiring must run on every boot path — the hasInteracted early-return below
  // used to skip it, leaving dead toggles for anyone with a stored choice.
  for (const btn of document.querySelectorAll("[data-consent]")) {
    if (btn.dataset.wired) continue;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      if (!consentState)
        consentState = consentDefaults(
          !!(privacy && privacy.dataset.gdpr === "1"),
        );
      const key = btn.dataset.consent;
      consentState = {
        ...consentState,
        timestamp: Date.now(),
        categories: { ...consentState.categories, [key]: !consentState.categories[key] },
        hasInteracted: true,
      };
      saveConsent();
      renderConsentToggles();
      syncConsentToZaraz();
      syncConsentToAnalytics();
    });
  }
  if (consentState && consentState.hasInteracted) {
    renderConsentToggles();
    syncConsentToZaraz();
    syncConsentToAnalytics();
    return;
  }
  const apply = (isGdpr) => {
    if (consentState && consentState.hasInteracted) return; // raced a toggle click
    consentState = consentDefaults(isGdpr);
    saveConsent();
    renderConsentToggles();
    syncConsentToZaraz();
    syncConsentToAnalytics();
  };
  if (privacy && privacy.dataset.gdpr != null) {
    apply(privacy.dataset.gdpr === "1");
  } else if (!consentState) {
    fetch("/api/geo")
      .then((r) => r.json())
      .then((d) => apply(!!d.isGdprRegion))
      .catch(() => apply(false));
  } else {
    renderConsentToggles();
    syncConsentToZaraz();
    syncConsentToAnalytics();
  }
}

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
  stagedAvatar = null; // staged file + preview die with the swapped-out DOM
  bootAuth();
  initSeedLike();
  scheduleListLikeCounts();
  syncLoginSend();
  bootSettings();
  bootConsent();
  bootContact();
  trackPageView();
});

bootAuth();
initSeedLike();
scheduleListLikeCounts();
syncLoginSend();
bootSettings();
bootConsent();
bootContact();
trackPageView();

syncListMemory();
syncOptsReset();
