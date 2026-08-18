// Where the requests come from: a dot-matrix world, a globe, and a ranked list.
//
// Two renderings of one dataset. The server emits a flat equirectangular dot map
// as inline SVG, and a small inline script draws the same dots onto a canvas as
// an orthographic globe you can spin. With JavaScript off the SVG and the list
// still say everything the globe says — the globe is the nicer way to read it,
// never the only way.
//
// Nothing here is fetched. The landmask and the country centroids are embedded
// constants, because this worker has no assets binding and no bundler; a map
// that needed a file could not exist in it. The mask is a stylized illustration
// at 4-degree resolution, not a nautical chart: continents are recognizable,
// coastlines are not accurate, and Antarctica is left out because no traffic
// comes from it.
import { dataTable, esc, fmt } from "./html";

// --------------------------------------------------------------- the landmask
//
// One row per 4 degrees of latitude from +80 down to -52, one character per 4
// degrees of longitude from -178 to +178. "1" is land. This is the single source
// of truth for both renderings: the SVG path below is built from it, and the
// same strings are handed to the canvas script, which is why they are strings
// and not a coordinate array — 34 lines of text instead of 946 pairs.
const LAND: readonly string[] = [
  "000000000000000000000000000000111111111000000000000000000000000000000000000000000000000000",
  "000000000000000000000000000001111111111100000000000000000000000000000111000000000000000000",
  "000000000000000000000111111100011111111100000000000000000011011111111111111110000000000000",
  "000111111111111111111111111000011111110000000000001111111111111111111111111111111111111100",
  "000111111111111111111100001110001110000110000000111111111111111111111111111111111111111110",
  "000011111111111111111000001110000000000000000000111111111111111111111111111111111111111000",
  "000000000001111111111000001111000000000000010001111111111111111111111111111111110000110000",
  "000000000000111111111000001111100000000000110011111111111111111111111111111111110000000000",
  "000000000000001111111111111111110000000000000111111111111111111111111111111111101000000000",
  "000000000000001111111111111100000000000000000111111100011011111111111111111111001000000000",
  "000000000000001111111111111000000000000000011000111111111011111111111111111100011000000000",
  "000000000000000111111111110000000000000000000000000000111111111111111111111010010000000000",
  "000000000000000011111111100000000000000000011111000000111111111111111111111000000000000000",
  "000000000000000001111000100000000000000000111111111111111111111111111111111000000000000000",
  "000000000000000001110000000000000000000001111111111110011100011111111111110000000000000000",
  "000000000000000000001000010100000000000001111111111111011100000111001111000000000000000000",
  "000000000000000000000110000000000000000001111111111111001000000010000110000100000000000000",
  "000000000000000000000001000000000000000001111111111111100000000010000111000100000000000000",
  "000000000000000000000000011111100000000000111111111111111000000000000010001100000000000000",
  "000000000000000000000000001111110000000000000011111111111000000000000100000000000000000000",
  "000000000000000000000000011111110000000000000001111111110000000000000000111100000000000000",
  "000000000000000000000000011111111110000000000001111111100000000000000010000100111000000000",
  "000000000000000000000000011111111111000000000000111111100000000000000001110000011100000000",
  "000000000000000000000000001111111110000000000000111111100000000000000000000001111000000000",
  "000000000000000000000000000111111110000000000000111111001000000000000000000011111000000000",
  "000000000000000000000000000111111110000000000000111111001000000000000000000111111100000000",
  "000000000000000000000000000111111100000000000000011110000000000000000000011111111100000000",
  "000000000000000000000000000111111000000000000000011110000000000000000000001111111110000000",
  "000000000000000000000000000111110000000000000000011100000000000000000000001111111110000000",
  "000000000000000000000000000111100000000000000000000000000000000000000000000000011100000011",
  "000000000000000000000000000110000000000000000000000000000000000000000000000000000000000011",
  "000000000000000000000000000110000000000000000000000000000000000000000000000000000000001110",
  "000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000",
  "000000000000000000000000001100000000000000000000000000000000000000000000000000000000000000",
];

/** Latitude of the first row, longitude of the first column, and the cell size. */
const LAT_TOP = 80;
const LON_LEFT = -178;
const CELL = 4;

// Plate carrée, one unit per degree: x = lon + 180, y = 90 - lat. The viewBox
// then crops to the inhabited band, which is the only reason to leave Antarctica
// out — the map gets a third taller for a continent with no rows in the table.
const MAP_W = 360;
const MAP_TOP = 90 - LAT_TOP - CELL / 2;
const MAP_H = LAND.length * CELL;

/**
 * Country centroids, roughly. Approximate on purpose: a dot four degrees wide
 * cannot express a border, and the reader is being told "traffic came from about
 * here", not where a capital is. Codes absent from this table still count in the
 * list and the table view — they just get no dot, which is the honest failure.
 */
const CENTROID: Record<string, readonly [number, number]> = {
  US: [39.8, -98.6], CA: [56.1, -106.3], MX: [23.6, -102.6], GT: [15.8, -90.2],
  BZ: [17.2, -88.5], SV: [13.8, -88.9], HN: [15.2, -86.2], NI: [12.9, -85.2],
  CR: [9.7, -83.8], PA: [8.5, -80.8], CU: [21.5, -79.5], DO: [18.7, -70.2],
  HT: [19.0, -72.3], JM: [18.1, -77.3], PR: [18.2, -66.6], TT: [10.7, -61.2],
  BS: [25.0, -77.4], CO: [4.6, -74.3], VE: [6.4, -66.6], EC: [-1.8, -78.2],
  PE: [-9.2, -75.0], BR: [-14.2, -51.9], BO: [-16.3, -63.6], PY: [-23.4, -58.4],
  UY: [-32.5, -55.8], AR: [-38.4, -63.6], CL: [-35.7, -71.5], GY: [4.9, -58.9],
  SR: [4.0, -56.0],
  GB: [54.0, -2.0], IE: [53.4, -8.2], FR: [46.6, 2.2], ES: [40.4, -3.7],
  PT: [39.4, -8.2], DE: [51.2, 10.4], NL: [52.1, 5.3], BE: [50.5, 4.5],
  LU: [49.8, 6.1], CH: [46.8, 8.2], AT: [47.5, 14.6], IT: [41.9, 12.6],
  GR: [39.1, 21.8], CY: [35.1, 33.4], PL: [51.9, 19.1], CZ: [49.8, 15.5],
  SK: [48.7, 19.7], HU: [47.2, 19.5], RO: [45.9, 25.0], BG: [42.7, 25.5],
  RS: [44.0, 21.0], HR: [45.1, 15.2], SI: [46.2, 14.8], BA: [43.9, 17.7],
  SE: [60.1, 18.6], NO: [60.5, 8.5], FI: [61.9, 25.7], DK: [56.3, 9.5],
  IS: [64.9, -19.0], EE: [58.6, 25.0], LV: [56.9, 24.6], LT: [55.2, 23.9],
  BY: [53.7, 28.0], UA: [48.4, 31.2], MD: [47.4, 28.4], RU: [61.0, 90.0],
  TR: [39.0, 35.2], GE: [42.3, 43.4], AM: [40.1, 45.0], AZ: [40.1, 47.6],
  KZ: [48.0, 66.9], UZ: [41.4, 64.6], KG: [41.2, 74.8], MN: [46.9, 103.8],
  CN: [35.9, 104.2], HK: [22.3, 114.2], TW: [23.7, 121.0], JP: [36.2, 138.3],
  KR: [35.9, 127.8], IN: [20.6, 79.0], PK: [30.4, 69.3], AF: [33.9, 67.7],
  NP: [28.4, 84.1], BD: [23.7, 90.4], LK: [7.9, 80.8], MM: [21.9, 96.0],
  TH: [15.9, 101.0], LA: [19.9, 102.5], KH: [12.6, 105.0], VN: [14.1, 108.3],
  MY: [4.2, 102.0], SG: [1.4, 103.8], ID: [-2.5, 118.0], PH: [12.9, 121.8],
  AU: [-25.3, 133.8], NZ: [-41.0, 174.9], PG: [-6.3, 143.9],
  IL: [31.4, 35.0], JO: [31.3, 36.2], LB: [33.9, 35.9], SY: [34.8, 39.0],
  IQ: [33.2, 43.7], IR: [32.4, 53.7], SA: [23.9, 45.1], AE: [23.4, 53.8],
  QA: [25.4, 51.2], KW: [29.3, 47.5], BH: [26.0, 50.6], OM: [21.5, 55.9],
  YE: [15.6, 48.5],
  EG: [26.8, 30.8], LY: [26.3, 17.2], TN: [33.9, 9.6], DZ: [28.0, 1.7],
  MA: [31.8, -7.1], SD: [12.9, 30.2], ET: [9.1, 40.5], KE: [0.0, 37.9],
  TZ: [-6.4, 34.9], UG: [1.4, 32.3], NG: [9.1, 8.7], GH: [7.9, -1.0],
  CI: [7.5, -5.5], SN: [14.5, -14.5], CM: [5.7, 12.7], CD: [-4.0, 21.8],
  AO: [-11.2, 17.9], ZM: [-13.1, 27.8], ZW: [-19.0, 29.2], MZ: [-18.7, 35.5],
  ZA: [-30.6, 22.9], MG: [-18.8, 46.9],
};

const REGION = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    // A runtime without full ICU. Codes are still readable; names are a nicety.
    return null;
  }
})();

/** "SG" -> "Singapore", and "T1" -> "T1", which is what Cloudflare called it. */
export function countryName(code: string): string {
  const upper = (code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return upper || "Unknown";
  try {
    return REGION?.of(upper) ?? upper;
  } catch {
    return upper;
  }
}

/**
 * A set of dots as one <path>.
 *
 * A zero-length subpath with a round linecap paints a dot, so the whole landmask
 * is one element and about 7KB of path data rather than 946 <circle> tags. Moves
 * are relative because neighbouring dots in a row are always four units apart:
 * "m4,0h0" instead of a fresh coordinate pair. Everything on this page is inlined
 * into the document, so both the byte count and the node count are the budget.
 */
function dotPath(dots: readonly (readonly [number, number])[]): string {
  let d = "";
  let px = 0;
  let py = 0;
  for (let i = 0; i < dots.length; i++) {
    const [x, y] = dots[i]!;
    d += i === 0 ? `M${x},${y}h0` : `m${x - px},${y - py}h0`;
    px = x;
    py = y;
  }
  return d;
}

function landDots(): (readonly [number, number])[] {
  const dots: (readonly [number, number])[] = [];
  LAND.forEach((row, r) => {
    const lat = LAT_TOP - r * CELL;
    for (let c = 0; c < row.length; c++) {
      if (row[c] === "1") dots.push([LON_LEFT + c * CELL + 180, 90 - lat]);
    }
  });
  return dots;
}

/**
 * Four size steps, by the square root of the share.
 *
 * Square root because a dot is read by area, so scaling the radius linearly
 * would make the top country look like ten times its true share. Four steps
 * rather than a continuous scale because past four sizes nobody can tell two
 * dots apart, and the list beside the map carries the exact numbers anyway.
 */
const STEP_RADIUS = [3.2, 4.4, 5.8, 7.4] as const;

function step(requests: number, max: number): number {
  if (max <= 0) return 0;
  const scaled = Math.sqrt(Math.max(0, requests) / max);
  return Math.min(3, Math.max(0, Math.ceil(scaled * STEP_RADIUS.length) - 1));
}

const DEFAULT_NOTE =
  "Every request Cloudflare's edge served, crawlers and scrapers included. " +
  "This is not bot-filtered and it is not a count of people.";

/**
 * The request-distribution card: globe, ranked list, table view.
 *
 * `rows` is ISO-3166 alpha-2 codes with request counts, already sorted
 * descending — the ranking is the caller's, so the same order shows up in the
 * list, the table and the dot sizes.
 */
export function worldDistributionCard(
  rows: Array<{ code: string; requests: number }>,
  opts: { total: number; days: number; note?: string },
): string {
  const note = opts.note ?? DEFAULT_NOTE;
  const max = rows.reduce((best, row) => Math.max(best, row.requests), 0);
  const share = (n: number) => (opts.total > 0 ? (n / opts.total) * 100 : 0);

  // Only the countries we can place get a dot. The rest are still in the list
  // and the table, which is where the numbers actually live.
  const placed = rows
    .map((row) => {
      const at = CENTROID[row.code.toUpperCase()];
      return at
        ? {
            code: row.code.toUpperCase(),
            name: countryName(row.code),
            requests: row.requests,
            lat: at[0],
            lon: at[1],
            step: step(row.requests, max),
          }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    // Biggest last, so the loudest dots sit on top of the quiet ones.
    .sort((a, b) => a.requests - b.requests);

  const litPaths = STEP_RADIUS.map((radius, index) => {
    const dots = placed
      .filter((row) => row.step === index)
      .map((row) => [Math.round(row.lon + 180), Math.round(90 - row.lat)] as const);
    return dots.length
      ? `<path class="globe-dot" stroke-width="${radius}" stroke-opacity="${
          0.55 + index * 0.15
        }" d="${dotPath(dots)}"/>`
      : "";
  }).join("");

  const map =
    `<svg class="globe-map" viewBox="0 ${MAP_TOP} ${MAP_W} ${MAP_H}" role="img" ` +
    `aria-label="World map with the countries sending requests marked, largest first: ${esc(
      rows
        .slice(0, 5)
        .map((row) => countryName(row.code))
        .join(", "),
    )}">` +
    `<path class="globe-land" stroke-width="2.2" d="${dotPath(landDots())}"/>` +
    litPaths +
    `</svg>`;

  // The canvas needs the same dots plus the labels, and the labels are formatted
  // here so the script never has to know about Intl or number formatting.
  const payload = {
    lat0: LAT_TOP,
    lon0: LON_LEFT,
    cell: CELL,
    land: LAND,
    dots: placed.map((row) => ({
      la: row.lat,
      lo: row.lon,
      r: STEP_RADIUS[row.step],
      n: row.name,
      v: `${fmt(row.requests)} requests`,
      s: `${share(row.requests).toFixed(1)}% of all requests`,
    })),
  };
  const json = JSON.stringify(payload).replace(/&/g, "&amp;").replace(/'/g, "&#39;");

  const list = rows.slice(0, 12);
  const listRows = list
    .map((row) => {
      const width = max > 0 ? Math.max(2, (row.requests / max) * 100) : 0;
      return `<li class="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 py-1.5">
    <span class="truncate text-sm">${esc(countryName(row.code))}</span>
    <span class="font-system text-sm tabular-nums text-ink-secondary">${esc(fmt(row.requests))}</span>
    <span class="col-span-2 h-1 w-full rounded-full bg-edge"><span class="block h-1 rounded-full bg-series" style="width:${width.toFixed(1)}%"></span></span>
  </li>`;
    })
    .join("");

  const table = dataTable(
    ["Country", "Requests", "Share"],
    rows.map((row) => [
      `${countryName(row.code)} (${row.code.toUpperCase()})`,
      fmt(row.requests),
      `${share(row.requests).toFixed(1)}%`,
    ]),
  );

  const empty = `<p class="mt-4 text-sm text-ink-secondary">No requests recorded in this window.</p>`;

  return `<section class="flex flex-col rounded-xl border border-edge bg-surface p-5">
  <h2 class="text-base font-bold tracking-tight">Where the requests come from</h2>
  <p class="mt-1.5 text-sm leading-snug text-ink-secondary">${esc(fmt(opts.total))} requests over ${
    opts.days
  } days, by country.</p>
  <p class="mt-1.5 text-xs leading-snug text-ink-muted">${esc(note)}</p>
  ${
    rows.length === 0
      ? empty
      : `<div class="mt-4 grid gap-5 md:grid-cols-[3fr_2fr]">
    <div class="globe-stage" data-globe='${json}'>
      ${map}
      <canvas class="globe-canvas" aria-hidden="true"></canvas>
    </div>
    <div>
      <p class="text-[11px] font-bold tracking-[0.1em] text-ink-muted uppercase">Top ${
        list.length
      } countries</p>
      <ul class="mt-2">${listRows}</ul>
    </div>
  </div>`
  }
  <div class="mt-auto pt-4">
    <details class="border-t border-edge pt-3">
      <summary class="cursor-pointer text-xs font-bold tracking-wide text-ink-muted uppercase hover:text-ink">Table view</summary>
      <div class="mt-3 max-h-64 overflow-auto">${table}</div>
    </details>
  </div>
  <script>${GLOBE_SCRIPT}</script>
</section>`;
}

/**
 * The globe. Hand-written for the same reason CHART_SCRIPT is: a globe library
 * is tens of kilobytes and a bundler, and all this needs is an orthographic
 * projection, which is four lines of trigonometry.
 *
 * It replaces the flat SVG rather than adding to it, and only once it has a
 * canvas context — so any failure leaves the reader with the map that was
 * already in the markup. The script ships inside the card, so a page without one
 * pays nothing for it; the readyState guard is there because the rest of the
 * document has not been parsed yet at the point this runs.
 */
const GLOBE_SCRIPT = String.raw`
(function () {
  if (window.__globe) return;
  window.__globe = 1;
  var RAD = Math.PI / 180;

  function init(root) {
    var cfg, canvas = root.querySelector("canvas"), map = root.querySelector("svg");
    try { cfg = JSON.parse(root.getAttribute("data-globe")); } catch (e) { return; }
    if (!canvas || !cfg) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Land as [lat, lon] pairs, expanded from the row strings the SVG was built
    // from — one dataset, two renderings.
    var land = [];
    for (var r = 0; r < cfg.land.length; r++) {
      var row = cfg.land[r];
      for (var c = 0; c < row.length; c++) {
        if (row.charAt(c) === "1") land.push([cfg.lat0 - r * cfg.cell, cfg.lon0 + c * cfg.cell]);
      }
    }

    // Colors come from the tokens, read at init and again whenever the OS theme
    // flips, so the canvas tracks dark mode the way the CSS-driven charts do.
    var ink, accent, surface;
    function theme() {
      var cs = getComputedStyle(root);
      ink = cs.getPropertyValue("--ink-muted").trim() || "#71717b";
      accent = cs.getPropertyValue("--series-1").trim() || "#2a78d6";
      surface = cs.getPropertyValue("--surface").trim() || "#ffffff";
    }
    theme();

    var tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.setAttribute("role", "status");
    tip.hidden = true;
    root.appendChild(tip);

    var spin = 20, tilt = 18, w = 0, h = 0, cx = 0, cy = 0, radius = 0, hits = [];

    function resize() {
      var rect = root.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w / 2; cy = h / 2; radius = Math.min(w, h) * 0.46;
    }

    // Orthographic: the globe as seen from infinitely far away, which is the
    // projection that looks like a planet rather than like a map bent round one.
    function project(lat, lon) {
      var p = lat * RAD, l = (lon - spin) * RAD, p0 = tilt * RAD;
      var cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
      if (cosc <= 0) return null;
      return [
        cx + radius * Math.cos(p) * Math.sin(l),
        cy - radius * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)),
        cosc,
      ];
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.05;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Dots near the limb fade out, which is the whole depth cue — without it a
      // sphere of evenly bright dots reads as a disc.
      ctx.fillStyle = ink;
      for (var i = 0; i < land.length; i++) {
        var p = project(land[i][0], land[i][1]);
        if (!p) continue;
        ctx.globalAlpha = 0.12 + 0.3 * p[2];
        ctx.beginPath();
        ctx.arc(p[0], p[1], radius * 0.011, 0, Math.PI * 2);
        ctx.fill();
      }

      hits = [];
      for (var j = 0; j < cfg.dots.length; j++) {
        var dot = cfg.dots[j];
        var q = project(dot.la, dot.lo);
        if (!q) continue;
        var size = (dot.r / 360) * radius * 2.6;
        // The 2px surface ring keeps overlapping dots legible, same as the
        // markers on the charts.
        ctx.globalAlpha = 1;
        ctx.strokeStyle = surface;
        ctx.lineWidth = 2;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(q[0], q[1], size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        hits.push([q[0], q[1], j]);
      }
      ctx.globalAlpha = 1;
    }

    function nearest(x, y) {
      var best = -1, bestDistance = 196;
      for (var i = 0; i < hits.length; i++) {
        var dx = hits[i][0] - x, dy = hits[i][1] - y, d = dx * dx + dy * dy;
        if (d < bestDistance) { bestDistance = d; best = hits[i][2]; }
      }
      return best;
    }

    function hover(event) {
      var rect = canvas.getBoundingClientRect();
      var index = nearest(event.clientX - rect.left, event.clientY - rect.top);
      if (index < 0) { tip.hidden = true; return; }
      var dot = cfg.dots[index];
      tip.textContent = "";
      var name = document.createElement("span");
      name.className = "chart-tip-h";
      name.textContent = dot.n;
      var value = document.createElement("span");
      value.className = "chart-tip-v";
      value.textContent = dot.v;
      var pct = document.createElement("span");
      pct.className = "chart-tip-n";
      pct.textContent = dot.s;
      tip.appendChild(name);
      tip.appendChild(value);
      tip.appendChild(pct);
      tip.hidden = false;
      tip.style.left = Math.max(0, Math.min(event.clientX - rect.left - tip.offsetWidth / 2, w - tip.offsetWidth)) + "px";
      tip.style.top = Math.max(0, event.clientY - rect.top - 10) + "px";
    }

    var dragging = false, touched = false, lastX = 0, frame = 0;
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function tick() {
      if (touched || still) return;
      spin = (spin + 0.15) % 360;
      draw();
      frame = requestAnimationFrame(tick);
    }

    canvas.addEventListener("pointerdown", function (event) {
      dragging = true;
      touched = true;
      if (frame) cancelAnimationFrame(frame);
      lastX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", function (event) {
      if (!dragging) { hover(event); return; }
      spin = (spin - (event.clientX - lastX) * 0.35 + 360) % 360;
      lastX = event.clientX;
      tip.hidden = true;
      draw();
    });
    canvas.addEventListener("pointerup", function () { dragging = false; });
    canvas.addEventListener("pointercancel", function () { dragging = false; });
    canvas.addEventListener("pointerleave", function () { dragging = false; tip.hidden = true; });
    window.addEventListener("resize", function () { resize(); draw(); });
    var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (dark && dark.addEventListener) dark.addEventListener("change", function () { theme(); draw(); });

    // Only now is the SVG replaced: everything above could have thrown, and the
    // map in the markup is the fallback.
    root.classList.add("globe-live");
    if (map) map.setAttribute("aria-hidden", "true");
    resize();
    draw();
    tick();
  }

  function boot() { document.querySelectorAll("[data-globe]").forEach(init); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
`;
