import styles from "../dist/styles.css";
// The island bundle, inlined rather than served. This worker has no assets
// binding on purpose (wrangler.jsonc), so a <script src> would have nothing to
// fetch — and static assets are served BEFORE worker code, which would skip
// the second Access gate. Inlining keeps the page one self-contained response
// with both gates applying to every byte. ~18KB gzipped, for one reader.
import islandBundle from "../dist/islands.js";
import { href, type DashboardState } from "./url-state";

/**
 * Escapes a value for HTML text or an attribute of either quote style.
 *
 * The apostrophe matters: several payloads ride in SINGLE-quoted attributes
 * (data-chart, data-globe), and before this each of those hand-rolled its own
 * apostrophe replace. Three copies happened to agree; the fourth would not.
 */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The three gradient stops under the wordmark.
 *
 * On grabient.com these are sampled live from the site's default palette seed
 * (`DEFAULT_LOGO_COLORS` in apps/web/src/palette.ts — start, middle and end of
 * the rendered ramp). Reproducing that here would mean pulling the whole
 * serialization + cosine-gradient stack into a worker that has no other use for
 * it, so the current values of that computation are frozen as constants instead.
 * They are what grabient.com is serving today; if the site's default seed
 * changes these drift, which is cosmetic and only affects this one underline.
 */
const LOGO_STOPS = ["#4159d0", "#ab35d3", "#ffcd70"] as const;

const stops = (colors: readonly string[]): string =>
  colors
    .map(
      (c, i) =>
        `<stop offset="${
          colors.length > 1 ? ((i / (colors.length - 1)) * 100).toFixed(1) : 0
        }%" stop-color="${c}"/>`,
    )
    .join("");

/**
 * The Grabient wordmark, ported from apps/web/src/icons.ts.
 *
 * Inline SVG, so it needs no asset file — which is the only reason a logo is
 * possible at all in a worker with no assets binding. The lettering is
 * `currentColor` so it inherits the ink token and flips with the OS theme; only
 * the underline rect is painted, from the gradient above.
 */
export const logo = (cls = "h-9 w-auto"): string =>
  `<svg class="${cls}" viewBox="0 0 220 50" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Grabient"><defs><linearGradient id="logoG" x1="0%" y1="0%" x2="100%" y2="0%">${stops(
    LOGO_STOPS,
  )}</linearGradient></defs><g fill="none" fill-rule="evenodd"><path fill="currentColor" d="M17.0015787 16.3699871v7.4230271h10.7969796c-.9771022 3.5394567-4.0549742 5.8499353-8.6473547 5.8499353-4.5435253 0-9.91758758-3.293661-9.91758758-10.9133247 0-7.1772315 5.32520708-10.56921083 9.86873248-10.56921083 3.9084089 0 6.5465849 2.16300133 7.9633831 4.71927553h10.3572836C35.4199556 5.84993532 27.9939787 0 19.3466241 0 8.6962098 0 0 7.86545925 0 18.7296248c0 10.4708927 8.2565138 19.0737387 19.2000587 19.0737387 10.0152978 0 19.297769-7.3247089 19.297769-19.5161707 0-.7373868 0-1.2781372-.0488552-1.9172057H17.0015787zm26.0056541 20.6959896h8.1099485V22.072445c0-4.1293661 2.638176-4.915912 6.4000195-5.0142303V8.84864166c-4.6900906 0-6.1068889 2.50711514-6.7908604 3.83441134h-.0977103V9.78266494h-7.6213973V37.0659767zM89.3854683 9.78266494V37.0659767h-8.1099485v-2.9495472h-.0977102C79.8098665 36.771022 76.4388638 38 73.2632816 38c-8.5984996 0-13.6305761-6.7839586-13.6305761-14.6002587 0-8.9469599 6.4000196-14.55109964 13.6305761-14.55109964 4.4458151 0 6.9374257 2.16300124 7.914528 3.83441134h.0977102V9.78266494h8.1099485zM67.742654 23.4980595c0 2.5562743 1.8564942 6.8822769 6.7420053 6.8822769 5.0809316 0 6.7908605-4.3260026 6.7908605-6.9805951 0-3.2936611-2.2473351-6.931436-6.8397156-6.931436-4.6412355 0-6.6931502 3.9327296-6.6931502 7.0297542zm27.9110034 13.5679172V.68822768h8.1099486V11.9456662c2.882451-3.09702454 6.742005-3.09702454 7.865673-3.09702454 5.667193 0 13.337445 4.08020694 13.337445 14.40362224C124.966724 33.084088 118.175864 38 111.287293 38c-3.810699 0-6.742005-1.8680466-7.767963-3.8344114h-.09771v2.9003881h-7.7679626zm7.8168176-13.7153946c0 3.7852523 2.540466 7.0297543 6.59544 7.0297543 4.152685 0 6.790861-3.3919793 6.790861-6.9805951 0-3.5394567-2.638176-6.931436-6.644295-6.931436-4.29925 0-6.742006 3.4902975-6.742006 6.8822768zm34.262168-13.56791716h-8.109948V37.0659767h8.109948V9.78266494zm0-9.09443726h-8.109948v6.19404916h8.109948V.68822768zm23.807174 27.82406212h8.305369c-1.319088 3.0478654-3.224437 5.4075032-5.520628 6.9805951-2.247335 1.6222509-4.934366 2.457956-7.719107 2.457956-7.767963 0-14.363403-6.3415265-14.363403-14.4527814 0-7.6196636 5.960324-14.64941784 14.216838-14.64941784 8.256513 0 14.314547 6.58732214 14.314547 14.89521344 0 1.0815007-.09771 1.5239327-.19542 2.1630013h-20.323727c.488552 3.2445019 3.175583 5.1617076 6.351165 5.1617076 2.491611 0 3.810699-1.1306597 4.934366-2.5562742zm-11.18782-8.1112549h12.311488c-.341986-1.6222509-1.954205-4.6701164-6.155744-4.6701164-4.20154 0-5.813759 3.0478655-6.155744 4.6701164zm25.028552 16.6649418h8.109948V22.2199224c0-1.6714101 0-5.702458 4.641236-5.702458 4.250394 0 4.250394 3.7360932 4.250394 5.6532989v14.8952134h8.109949V20.007762c0-5.3583441-1.661074-7.5213454-3.126727-8.7994826-1.465654-1.2781371-4.348105-2.35963774-6.937426-2.35963774-4.836656 0-6.546585 2.50711514-7.377122 3.83441134h-.09771V9.78266494h-7.572542V37.0659767zM216.091591.68822768h-8.109948v9.09443726h-4.006119v6.19404916h4.006119v21.0892626h8.109948V15.9767141H220V9.78266494h-3.908409V.68822768z"/><rect x="93" y="43" width="34" height="7" fill="url(#logoG)"/></g></svg>`;

/** Same three stops as the wordmark's underline, on a rounded tile. */
const FAVICON =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<defs><linearGradient id="f" x1="0" y1="1" x2="1" y2="0">${stops(LOGO_STOPS)}</linearGradient></defs>` +
  `<rect width="32" height="32" rx="8" fill="url(#f)"/></svg>`;

/**
 * The only JavaScript on the page: a crosshair-and-tooltip layer over the
 * server-rendered chart SVGs.
 *
 * Written by hand rather than by shipping the charting library's client build.
 * The server already resolved every datum to a pixel position and preformatted
 * its label, so all this does is nearest-x lookup and DOM positioning — a few
 * hundred bytes against the ~100KB the library's runtime would cost, and no
 * bundler or assets directory, which this worker deliberately does not have.
 *
 * The dashboard sits behind Cloudflare Access, so this is served to exactly one
 * authenticated person; the "no client code" rule that shaped the rest of the
 * app was about grabient.com's visitors, and none of them can reach this page.
 *
 * Tooltips enhance, they never gate: every value is also in the table view under
 * each chart, and arrow keys drive the same readout as the pointer.
 */
const CHART_SCRIPT = String.raw`
(function () {
  var NS = "http://www.w3.org/2000/svg";
  document.querySelectorAll("[data-chart]").forEach(function (root) {
    var cfg;
    try { cfg = JSON.parse(root.getAttribute("data-chart")); } catch (e) { return; }
    var svg = root.querySelector("svg");
    if (!svg || !cfg.points || !cfg.points.length) return;

    // Horizontal charts (ranked bars) put the categories on y, so the whole
    // cursor works off whichever axis is categorical.
    var vertical = cfg.axis !== "y";
    var axisOf = function (p) { return vertical ? p.x : p.y; };

    var byX = {}, xs = [];
    cfg.points.forEach(function (p) {
      var k = axisOf(p);
      if (!byX[k]) { byX[k] = []; xs.push(k); }
      byX[k].push(p);
    });
    xs.sort(function (a, b) { return a - b; });

    var layer = document.createElementNS(NS, "g");
    layer.setAttribute("class", "chart-cursor");
    layer.style.display = "none";
    var line = document.createElementNS(NS, "line");
    if (vertical) {
      line.setAttribute("y1", cfg.plot.y);
      line.setAttribute("y2", cfg.plot.y + cfg.plot.height);
    } else {
      line.setAttribute("x1", cfg.plot.x);
      line.setAttribute("x2", cfg.plot.x + cfg.plot.width);
    }
    layer.appendChild(line);
    svg.appendChild(layer);

    var tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.setAttribute("role", "status");
    tip.hidden = true;
    root.appendChild(tip);

    var dots = [], index = -1;

    function hide() {
      index = -1;
      layer.style.display = "none";
      tip.hidden = true;
    }

    function show(i) {
      if (i < 0 || i >= xs.length) return;
      index = i;
      var x = xs[i], group = byX[x];
      if (vertical) {
        line.setAttribute("x1", x);
        line.setAttribute("x2", x);
      } else {
        line.setAttribute("y1", x);
        line.setAttribute("y2", x);
      }
      while (dots.length < group.length) {
        var dot = document.createElementNS(NS, "circle");
        dot.setAttribute("r", "4");
        layer.appendChild(dot);
        dots.push(dot);
      }
      dots.forEach(function (dot, j) {
        if (j < group.length) {
          dot.setAttribute("cx", group[j].x);
          dot.setAttribute("cy", group[j].y);
          dot.setAttribute("fill", group[j].c);
          dot.style.display = "";
        } else {
          dot.style.display = "none";
        }
      });
      layer.style.display = "";

      var html = '<span class="chart-tip-h">' + group[0].l + "</span>";
      group.forEach(function (p) {
        html +=
          '<span class="chart-tip-r">' +
          (p.m ? '<span class="chart-tip-s" style="background:' + p.c + '"></span>' : "") +
          '<span class="chart-tip-v">' + p.v + "</span>" +
          (p.m ? '<span class="chart-tip-n">' + p.m + "</span>" : "") +
          "</span>";
      });
      // Event markers, if this chart has any. They hang under the series rows
      // with no swatch: an annotation is not a measurement, and it must not look
      // like one more thing that was counted. Hit-tested against the snapped
      // position rather than the raw pointer, so arrow keys reach them too.
      if (vertical && cfg.markers) {
        cfg.markers.forEach(function (m) {
          if (m.x1 == null ? Math.abs(m.x - x) > 8 : x < m.x1 || x > m.x2) return;
          html +=
            '<span class="chart-tip-m">' + m.label +
            (m.detail ? '<span class="chart-tip-n"> — ' + m.detail.join("; ") + "</span>" : "") +
            "</span>";
        });
      }
      tip.innerHTML = html;
      tip.hidden = false;

      // The SVG is scaled to its container, so viewBox units must be converted
      // before positioning an HTML element over it.
      var rect = svg.getBoundingClientRect();
      var scale = rect.width / cfg.w;
      var width = tip.offsetWidth;
      var left = (vertical ? x : group[0].x) * scale - width / 2;
      tip.style.left = Math.max(0, Math.min(left, rect.width - width)) + "px";
      tip.style.top = Math.max(0, (vertical ? cfg.plot.y : x) * scale - 8) + "px";
    }

    function nearest(clientX, clientY) {
      var rect = svg.getBoundingClientRect();
      var x = vertical
        ? ((clientX - rect.left) / rect.width) * cfg.w
        : ((clientY - rect.top) / rect.height) * cfg.h;
      var best = 0, bestDistance = Infinity;
      for (var i = 0; i < xs.length; i++) {
        var distance = Math.abs(xs[i] - x);
        if (distance < bestDistance) { bestDistance = distance; best = i; }
      }
      return best;
    }

    // Pointer events on the whole box, not the marks: a 2px line is an
    // impossible hit target, and nearest-x means the pointer never has to land
    // on anything precisely.
    root.addEventListener("pointermove", function (event) { show(nearest(event.clientX, event.clientY)); });
    root.addEventListener("pointerleave", hide);
    root.addEventListener("blur", hide);
    root.addEventListener("keydown", function (event) {
      var key = event.key;
      if (key === "ArrowRight") show(index < 0 ? 0 : Math.min(index + 1, xs.length - 1));
      else if (key === "ArrowLeft") show(index < 0 ? xs.length - 1 : Math.max(index - 1, 0));
      else if (key === "Home") show(0);
      else if (key === "End") show(xs.length - 1);
      else if (key === "Escape") hide();
      else return;
      event.preventDefault();
    });
  });
})();
`;

/** Top-level pages, in nav order. */
export const PAGES = [
  { href: "/", label: "Overview" },
  { href: "/trends", label: "Trends" },
  { href: "/search", label: "Search" },
  { href: "/indexation", label: "Indexation" },
  { href: "/acquisition", label: "Acquisition" },
  { href: "/goals", label: "Goals" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/reports", label: "Reports" },
  { href: "/brief", label: "Brief" },
  { href: "/dials", label: "Dials" },
  { href: "/contribute", label: "Contribute" },
  { href: "/ops", label: "Ops" },
] as const;

/**
 * The nav CARRIES state; it never resets it.
 *
 * Every href goes through url-state's `href()`, which merges the current
 * store into the target and emits only the keys that target actually reads.
 * That is the whole reason the builder exists: a hand-written link here was
 * silently dropping ?range= on navigation.
 */
export function nav(current: string, state: DashboardState): string {
  return `<nav class="flex flex-wrap items-center gap-1" aria-label="Sections">${PAGES.map((page) => {
    const active = page.href === current;
    return `<a href="${esc(href(page.href, state))}"${active ? ' aria-current="page"' : ""} class="rounded-md px-2.5 py-1 text-xs font-bold tracking-wide uppercase transition-colors ${
      active ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"
    }">${esc(page.label)}</a>`;
  }).join("")}</nav>`;
}

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(FAVICON)}">
<style>${styles}</style>
</head>
<body class="min-h-dvh bg-page font-sans text-ink antialiased">
${body}
<script>${CHART_SCRIPT}</script>
<script type="module">${islandBundle}</script>
</body>
</html>`;
}

/**
 * The wordmark plus the badge that says this is not grabient.com. The lettering
 * inherits the ink token, so it needs no per-theme handling.
 */
export function brand(): string {
  return `<span class="flex items-center gap-2.5">
  ${logo()}
  <span class="rounded-md border border-edge px-1.5 py-0.5 text-[10px] leading-none font-bold tracking-[0.14em] text-ink-muted uppercase">admin</span>
</span>`;
}

export const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * The one range control, rendered once in the header.
 *
 * Each option is a link to THIS page with only `range` overridden, so
 * switching the window preserves everything else in the store — the globe
 * layer, the archive filter — rather than resetting the page to defaults.
 */
export function rangeSelector(
  path: string,
  state: DashboardState,
  options: readonly { key: string; label: string }[],
): string {
  return `<div class="flex flex-wrap items-center gap-2">
  <span class="text-[11px] font-bold tracking-[0.1em] text-ink-muted uppercase">Range</span>
  <div class="flex items-center gap-1">${options
    .map((option) => {
      const active = option.key === state.range.key;
      return `<a href="${esc(href(path, state, { range: option.key as never }))}"${active ? ' aria-current="true"' : ""} class="rounded-md px-2 py-0.5 text-xs font-bold transition-colors ${
        active ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"
      }">${esc(option.label)}</a>`;
    })
    .join("")}</div>
</div>`;
}

/**
 * A period-over-period badge that refuses to overclaim.
 *
 * When the movement is inside one standard deviation of a counting process it
 * is rendered in muted ink as "flat" rather than as a coloured arrow. On a site
 * doing ~160 signups a month, ordinary variance produces double-digit percent
 * swings; painting those green or red invites decisions the data cannot support.
 */
export function changeBadge(
  result: { pct: number | null; withinNoise: boolean },
  label: string,
): string {
  if (result.pct === null) {
    return `<span class="text-ink-muted">no prior period to compare</span>`;
  }
  if (result.withinNoise) {
    return `<span class="text-ink-muted">flat (${result.pct > 0 ? "+" : ""}${result.pct}%, within noise) ${esc(label)}</span>`;
  }
  const up = result.pct > 0;
  return `<span class="delta ${up ? "text-good" : "text-critical"} font-bold">${up ? "▲" : "▼"} ${Math.abs(result.pct)}%</span> <span class="text-ink-muted">${esc(label)}</span>`;
}

/**
 * A delta never relies on hue alone — the arrow and the trailing label carry the
 * same information for anyone who cannot separate the two colors.
 */
export function delta(current: number, previous: number, label: string): string {
  if (previous === 0) return "";
  const change = Math.round(((current - previous) / previous) * 1000) / 10;
  if (change === 0) return `<span class="text-ink-muted">no change ${esc(label)}</span>`;
  const up = change > 0;
  return `<span class="delta ${up ? "text-good" : "text-critical"} font-bold">${
    up ? "▲" : "▼"
  } ${Math.abs(change)}%</span> <span class="text-ink-muted">${esc(label)}</span>`;
}

/**
 * The lead number gets the hero treatment; the rest are ordinary tiles. The
 * value keeps Poppins (`.stat-value`) — a glanceable figure, not running text
 * — while everything around it reads in Inter. Poppins is a wide geometric
 * face, so the large sizes are tracked in to stop them sprawling.
 */
export function statTile(opts: {
  label: string;
  value: string;
  sub?: string;
  hero?: boolean;
}): string {
  return `<div class="flex flex-col rounded-xl border border-edge bg-surface p-5">
  <p class="text-[11px] font-bold tracking-[0.1em] text-ink-muted uppercase">${esc(opts.label)}</p>
  <p class="stat-value mt-2.5 ${
    opts.hero ? "text-5xl" : "text-3xl"
  } leading-none font-bold tracking-tight">${esc(opts.value)}</p>
  ${opts.sub ? `<p class="mt-auto pt-2.5 text-sm leading-snug">${opts.sub}</p>` : ""}
</div>`;
}

/** Swatch + label pairs, so identity is never carried by color alone. */
export function legend(
  items: readonly { color: string; label: string; faint?: boolean }[],
): string {
  return `<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">${items
    .map(
      (i) =>
        `<span class="flex items-center gap-1.5 text-xs text-ink-secondary"><span aria-hidden="true" class="inline-block h-2 w-2 rounded-full" style="background:${i.color}${
          i.faint ? ";opacity:0.35" : ""
        }"></span>${esc(i.label)}</span>`,
    )
    .join("")}</div>`;
}

export function chartCard(opts: {
  title: string;
  note: string;
  svg: string;
  table: string;
  /** Rendered between the notes and the plot, for multi-series charts. */
  legend?: string;
  /** Rendered under the note, for caveats about what the series excludes. */
  caveat?: string;
}): string {
  // A flex column so the table-view disclosure sits on the card's bottom edge.
  // The cards in a row are stretched to a common height by the grid, and their
  // notes differ by a line or two — without this the rules under each chart land
  // at different heights and the row reads as misaligned.
  return `<section class="flex flex-col rounded-xl border border-edge bg-surface p-5">
  <h2 class="text-base font-bold tracking-tight">${esc(opts.title)}</h2>
  <p class="mt-1.5 text-sm leading-snug text-ink-secondary">${esc(opts.note)}</p>
  ${opts.caveat ? `<p class="mt-1.5 text-xs leading-snug text-ink-muted">${esc(opts.caveat)}</p>` : ""}
  ${opts.legend ?? ""}
  <div class="mt-4">${opts.svg}</div>
  <div class="mt-auto pt-4">
    <details class="border-t border-edge pt-3">
      <summary class="cursor-pointer text-xs font-bold tracking-wide text-ink-muted uppercase hover:text-ink">Table view</summary>
      <div class="mt-3 max-h-64 overflow-auto">${opts.table}</div>
    </details>
  </div>
</section>`;
}

/**
 * The events behind a chart's markers, spelled out.
 *
 * A marker on a plot is a hairline and three words, and a cluster is just "4
 * changes" — this is where the reader finds out what actually happened. Real
 * HTML, no script, same disclosure shape as "Table view" so the two read as a
 * pair. An empty window renders nothing rather than an empty box.
 *
 * Rows are events, not causes. The chart puts a date beside a line; the
 * inference that one moved the other is the reader's to make.
 */
export function eventsDisclosure(
  events: readonly {
    on: string;
    endsOn?: string | null;
    kind: string;
    label: string;
    detail?: string | null;
  }[],
): string {
  if (events.length === 0) return "";
  const rows = events
    .map((event) => {
      const when =
        event.endsOn && event.endsOn !== event.on ? `${event.on} → ${event.endsOn}` : event.on;
      return `<li class="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-edge py-2 last:border-b-0">
  <span class="font-system text-xs tabular-nums text-ink-muted">${esc(when)}</span>
  <span class="rounded-md border border-edge px-1.5 py-0.5 text-[10px] leading-none font-bold tracking-[0.08em] text-ink-muted uppercase">${esc(event.kind)}</span>
  <span class="text-xs font-bold">${esc(event.label)}</span>${
    event.detail
      ? `\n  <span class="w-full text-xs leading-snug text-ink-secondary">${esc(event.detail)}</span>`
      : ""
  }
</li>`;
    })
    .join("");
  return `<details class="mt-4 border-t border-edge pt-3">
  <summary class="cursor-pointer text-xs font-bold tracking-wide text-ink-muted uppercase hover:text-ink">Events in this window (${events.length})</summary>
  <ul class="mt-2 max-h-64 overflow-auto">${rows}</ul>
</details>`;
}

/**
 * The table view is not a nicety here. These charts are static SVG with no
 * tooltips, so without it there is no way to read an exact value.
 *
 * With `enhance`, the finished static table is wrapped in an island host and
 * shipped alongside a JSON copy of its own cells; the Solid island swaps in a
 * TanStack table with sortable headers and a filter box. The static markup is
 * what renders first and what remains if the bundle never runs, so sorting is
 * strictly an upgrade — the accessible path is the one the server drew.
 */
export function dataTable(
  headers: readonly string[],
  rows: readonly string[][],
  enhance = false,
): string {
  const head = headers
    .map(
      (h, i) =>
        `<th scope="col" class="border-b border-edge px-2 py-1.5 font-semibold text-ink-muted ${
          i === 0 ? "text-left" : "text-right"
        }">${esc(h)}</th>`,
    )
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, i) =>
              `<td class="border-b border-edge px-2 py-1.5 ${
                i === 0 ? "text-left text-ink-secondary" : "text-right"
              }">${esc(cell)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  const table = `<table class="data-table w-full text-xs"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  // Below a handful of rows, sorting and filtering are noise.
  if (!enhance || rows.length < 6) return table;

  // Which columns are numeric decides how they sort. Judged from the rendered
  // values rather than declared by every caller: a column is numeric when
  // every non-placeholder cell in it parses as one.
  const numeric = headers
    .map((_, column) => column)
    .filter((column) =>
      rows.every((row) => {
        const cell = row[column] ?? "";
        return cell === "" || cell === "—" || /^[-+]?[\d,.]+\s*(%|B|KB|MB|GB|TB)?$/.test(cell.trim());
      }),
    );

  const payload = JSON.stringify({ headers, rows, numeric })
    // The JSON sits inside a <script>, where the parser reads raw text — so
    // markup in a cell is inert and the only sequences that matter are the
    // ones that end that state. `</script` closes it; `<!--<script` flips the
    // tokenizer into script-data-double-escaped, after which a later
    // `</script>` no longer closes the element. Both are neutralised, and
    // JSON.parse reads the backslash form back as the original text.
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--")
    .replace(/<script/gi, "<\\script");
  return `<div data-island="table">${table}<script type="application/json">${payload}</script></div>`;
}

export function errorPage(status: number, heading: string, detail: string): string {
  return layout(
    `${status} — Grabient admin`,
    `<main class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
  ${brand()}
  <div class="dashed-rule mt-7 mb-7"></div>
  <p class="text-xs font-bold tracking-[0.1em] text-ink-muted uppercase">${status}</p>
  <h1 class="mt-2 text-2xl font-bold tracking-tight">${esc(heading)}</h1>
  <p class="mt-3 text-sm leading-snug text-ink-secondary">${esc(detail)}</p>
</main>`,
  );
}
