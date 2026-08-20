// /dials — the single-source-of-truth page for the deterministic "dials"
// (the classifier's contested numeric gates) and a place to test candidate
// values for vibes.
//
// How the vibes tester stays honest AND cheap: the flywheel precomputes each
// palette's 1-D score for every dial (the exact value the gate compares
// against its threshold), so re-classifying at any slider position is a
// comparison, done client-side over server-rendered strips. No classifier
// code exists in this worker — the palettes, scores and fit evidence arrive
// as one payload (baked module, superseded by POST /dials/payload), and the
// registry in packages/data-ops remains the code-truth the currents mirror.
// Nothing here changes a gate: a promising slider position becomes evidence
// for the re-measure workflow, never an edit.

import { esc, layout, nav, brand } from "./html";
import type { DashboardState } from "./url-state";
import { BAKED_DIALS } from "./dials-baked";

export interface DialFit {
  candidate: number | null;
  ci95: [number, number] | null;
  n: number;
  judgePositives: number;
  verdict: string;
}

export interface Dial {
  id: string;
  label: string;
  area: string;
  meaning: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  direction: "leq" | "geq";
  current: number | null;
  provenance: string;
  fit: DialFit | null;
  palettes: { seed: string; stops: string[]; score: number; boundary: boolean }[];
}

export interface DialsPayload {
  asOf: string;
  source: "live" | "baked";
  note: string;
  dials: Dial[];
}

/** Registry constants the dials sit among — verified against code 2026-08-20. */
const REFERENCE_CONSTANTS: { name: string; value: string; meaning: string }[] = [
  { name: "PROMINENCE_CEILING", value: "0.60", meaning: "A term truer than this of the corpus never spends a chip" },
  { name: "CHIP_SUPPORT_FLOOR", value: "24 / 867", meaning: "A chip's destination page must fill one screen" },
  { name: "HUE_NAME_HALF", value: "15°", meaning: "Extended-name arc half-width (a third of a family band)" },
  { name: "HUE_NAME_SHARE", value: "0.25", meaning: "Share of stops that makes a hue name prominent (2 of 7)" },
  { name: "OMBRE_RANGE", value: "0.34", meaning: "Lightness travel a value-journey word requires (corpus p50)" },
  { name: "NEAR_BLACK_L / NEAR_WHITE_L", value: "0.18 / 0.87", meaning: "Value-band edges" },
  { name: "BLACK_L / WHITE_L", value: "0.08 / 0.95", meaning: "The reserve for the words black and white themselves" },
  { name: "autumn window", value: "[20°, 70°] ≥ 0.5", meaning: "Warm-arc share — the F1 dial below tests its upper edge" },
  { name: "sunset strong", value: "[20°, 100°] ≥ 0.25 + FAMILY_CHROMA", meaning: "Orange-to-yellow mass plus real colour" },
  { name: "ocean strong", value: "[180°, 280°] ≥ 0.95, C̄ ≥ 0.08", meaning: "Nearly all chromatic mass in the cyan–blue window" },
  { name: "warm / cool strong", value: "arc share ≥ 0.85 + concentration", meaning: "Temperature is a mass claim, not a mean-hue claim" },
];

async function readLive(db: D1Database | undefined): Promise<DialsPayload | null> {
  if (!db) return null;
  try {
    const row = await db.prepare(`SELECT json FROM dials_payload WHERE id = 1`).first<{ json: string }>();
    if (!row?.json) return null;
    const parsed = JSON.parse(row.json) as DialsPayload;
    if (!parsed?.dials?.length) return null;
    return { ...parsed, source: "live" };
  } catch {
    return null;
  }
}

export async function loadDials(db: D1Database | undefined): Promise<DialsPayload> {
  return (await readLive(db)) ?? BAKED_DIALS;
}

export async function writeDials(db: D1Database | undefined, json: string): Promise<boolean> {
  if (!db) return false;
  try {
    await db
      .prepare(
        `INSERT INTO dials_payload (id, json, updated_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET json = ?1, updated_at = ?2`,
      )
      .bind(json, Date.now())
      .run();
    return true;
  } catch {
    return false;
  }
}

const DIALS_CSS = `
.dial-gauge { position: relative; height: 8px; border-radius: 4px; background: var(--page); border: 1px solid var(--border); }
.dial-mark { position: absolute; top: -4px; width: 2px; height: 16px; border-radius: 1px; }
.dial-ci { position: absolute; top: 0; height: 100%; border-radius: 4px; opacity: 0.22; }
.dial-strip { height: 15px; border-radius: 3px; transition: opacity 120ms; }
.strip-off .dial-strip { opacity: 0.14; filter: saturate(0.35); }
.strip-off .dial-score { opacity: 0.35; }
.dial-strips { scrollbar-width: thin; }
input.dial-slider { width: 100%; accent-color: var(--ink); }
`;

const DIALS_SCRIPT = String.raw`
(function () {
  function fmt(v, step) { return step < 1 ? (+v).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : String(Math.round(v)); }
  document.querySelectorAll("[data-dial]").forEach(function (root) {
    var cfg;
    try { cfg = JSON.parse(root.getAttribute("data-dial")); } catch (e) { return; }
    var slider = root.querySelector("input.dial-slider");
    var readout = root.querySelector(".dial-count");
    var rows = Array.prototype.slice.call(root.querySelectorAll("[data-score]"));
    if (!slider || !readout || !rows.length) return;
    function firesAt(v) {
      var n = 0;
      rows.forEach(function (row) {
        var s = parseFloat(row.getAttribute("data-score"));
        var on = cfg.dir === "leq" ? s <= v : s >= v;
        row.classList.toggle("strip-off", !on);
        if (on) n++;
      });
      return n;
    }
    // Current = the shipped gate; a null current means "no gate" (everything fires).
    var base = cfg.cur === null ? rows.length : (function () {
      var n = 0;
      rows.forEach(function (row) {
        var s = parseFloat(row.getAttribute("data-score"));
        if (cfg.dir === "leq" ? s <= cfg.cur : s >= cfg.cur) n++;
      });
      return n;
    })();
    function update() {
      var v = parseFloat(slider.value);
      var n = firesAt(v);
      var d = n - base;
      readout.textContent = n + " of " + rows.length + " fire at " + fmt(v, cfg.step) +
        " (" + (d >= 0 ? "+" : "") + d + " vs shipped)";
    }
    slider.addEventListener("input", update);
    update();
  });
})();
`;

const pct = (v: number, d: Dial): number => ((v - d.min) / (d.max - d.min)) * 100;

function verdictChip(d: Dial): string {
  const v = d.fit?.verdict ?? "no fit yet";
  const label =
    v === "PROPOSE_MOVE" ? "move evidence" : v === "KEEP" ? "keep — CI includes current" : v.toLowerCase().replace(/_/g, " ");
  return `<span class="rounded-md border border-edge px-1.5 py-0.5 text-[10px] leading-none font-bold tracking-[0.08em] text-ink-muted uppercase">${esc(label)}</span>`;
}

function dialCard(d: Dial): string {
  const start = d.fit?.candidate ?? d.current ?? (d.min + d.max) / 2;
  const marks: string[] = [];
  if (d.fit?.ci95) {
    const [lo, hi] = d.fit.ci95;
    marks.push(`<div class="dial-ci" style="left:${pct(Math.max(lo, d.min), d)}%;width:${Math.max(1, pct(Math.min(hi, d.max), d) - pct(Math.max(lo, d.min), d))}%;background:var(--ink)"></div>`);
  }
  if (d.current !== null)
    marks.push(`<div class="dial-mark" style="left:${pct(d.current, d)}%;background:var(--ink)" title="shipped: ${d.current}"></div>`);
  if (d.fit?.candidate != null)
    marks.push(`<div class="dial-mark" style="left:${pct(d.fit.candidate, d)}%;background:var(--ink-muted)" title="fitted candidate: ${d.fit.candidate}"></div>`);

  const strips = d.palettes
    .map(
      (p) => `<div class="flex items-center gap-2" data-score="${p.score}">
  <a class="dial-strip block min-w-0 flex-1" style="background:linear-gradient(90deg,${p.stops.join(",")})" href="https://grabient.com/${encodeURIComponent(p.seed)}" target="_blank" rel="noopener" title="${esc(p.seed)}${p.boundary ? " (boundary specimen)" : ""}"></a>
  <span class="dial-score font-system w-12 shrink-0 text-right text-[10px] tabular-nums text-ink-muted">${p.score}${p.boundary ? "·b" : ""}</span>
</div>`,
    )
    .join("");

  const empirical = d.fit
    ? `fitted candidate <b>${d.fit.candidate ?? "—"}</b>${d.fit.ci95 ? ` · 95% CI [${d.fit.ci95[0]}, ${d.fit.ci95[1]}]` : ""} · n=${d.fit.n} palettes, ${d.fit.judgePositives} judge-positive`
    : "no fit yet — votes accumulate via the flywheel";

  return `<section class="rounded-xl border border-edge bg-surface p-5" data-dial='${esc(JSON.stringify({ dir: d.direction, cur: d.current, step: d.step }))}'>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h3 class="text-sm font-bold tracking-tight">${esc(d.label)}</h3>
    ${verdictChip(d)}
  </div>
  <p class="mt-1.5 text-xs leading-snug text-ink-secondary">${esc(d.meaning)}</p>
  <p class="mt-1 text-[11px] leading-snug text-ink-muted">${esc(d.provenance)}</p>
  <div class="mt-4 flex items-baseline justify-between gap-3">
    <span class="text-[11px] font-bold tracking-[0.1em] text-ink-muted uppercase">shipped ${d.current ?? "— (no gate)"} · ${esc(d.unit)}</span>
    <span class="dial-count font-system text-xs tabular-nums"></span>
  </div>
  <div class="dial-gauge mt-2">${marks.join("")}</div>
  <input class="dial-slider mt-2" type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${start}" aria-label="Test value for ${esc(d.label)}">
  <p class="mt-1 text-[11px] leading-snug text-ink-muted">${empirical} · slider starts at the ${d.fit?.candidate != null ? "fitted candidate" : "shipped value"}; strips dim when the tested gate refuses them.</p>
  <div class="dial-strips mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">${strips}</div>
</section>`;
}

export function dialsPage(
  payload: DialsPayload,
  options: { stamp: string; email: string; state: DashboardState },
): string {
  const areas = [...new Set(payload.dials.map((d) => d.area))];
  const sections = areas
    .map(
      (area) => `<h2 class="mt-8 text-base font-bold tracking-tight">${esc(area)}</h2>
  <div class="mt-3 grid gap-4 lg:grid-cols-2">${payload.dials
    .filter((d) => d.area === area)
    .map(dialCard)
    .join("")}</div>`,
    )
    .join("");

  const reference = `<details class="mt-8 rounded-xl border border-edge bg-surface p-5">
  <summary class="cursor-pointer text-sm font-bold tracking-tight">The wider dial inventory — shipped registry constants</summary>
  <p class="mt-2 text-xs leading-snug text-ink-secondary">Mirrors <code>packages/data-ops</code> as of ${esc(payload.asOf)}; the registry code stays the source of truth for these until the parameter store ships. Values verified against source, not estimated.</p>
  <table class="data-table mt-3 w-full text-xs"><thead><tr>
    <th class="border-b border-edge px-2 py-1.5 text-left font-semibold text-ink-muted">Constant</th>
    <th class="border-b border-edge px-2 py-1.5 text-left font-semibold text-ink-muted">Value</th>
    <th class="border-b border-edge px-2 py-1.5 text-left font-semibold text-ink-muted">Meaning</th>
  </tr></thead><tbody>${REFERENCE_CONSTANTS.map(
    (r) => `<tr>
    <td class="border-b border-edge px-2 py-1.5 font-system">${esc(r.name)}</td>
    <td class="border-b border-edge px-2 py-1.5 font-system tabular-nums">${esc(r.value)}</td>
    <td class="border-b border-edge px-2 py-1.5 text-ink-secondary">${esc(r.meaning)}</td>
  </tr>`,
  ).join("")}</tbody></table>
</details>`;

  return layout(
    "Dials — Grabient admin",
    `<style>${DIALS_CSS}</style>
<main class="mx-auto max-w-5xl px-6 py-8 sm:py-10">
  <header>
    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      ${brand()}
      <p class="text-xs text-ink-muted">${esc(options.stamp)} UTC · ${esc(options.email)}</p>
    </div>
    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      ${nav("/dials", options.state)}
      <span class="text-xs text-ink-muted">payload: ${payload.source} · ${esc(payload.asOf)}</span>
    </div>
    <div class="dashed-rule mt-4"></div>
  </header>
  <h1 class="mt-6 text-2xl font-bold tracking-tight">Dials</h1>
  <p class="mt-2 max-w-[70ch] text-sm leading-relaxed text-ink-secondary">The contested numeric gates of the deterministic classifier, with the evidence for moving each one. Drag a slider to test any value for vibes: every strip is a real palette with its gate score precomputed, so what you see flip is exactly what the classifier would flip. Nothing here edits a gate — a promising position becomes input to the re-measure workflow (<a class="underline underline-offset-2 hover:text-ink" href="/contribute">how evidence accumulates</a>).</p>
  ${sections}
  ${reference}
  <p class="mt-6 text-xs leading-snug text-ink-muted">${esc(payload.note)}</p>
</main>
<script>${DIALS_SCRIPT}</script>`,
  );
}
