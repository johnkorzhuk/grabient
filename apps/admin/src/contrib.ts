// The contributor program page (/contribute) and its agent-facing JSON twin.
//
// Audience: MCP clients that want to donate inference to the palette
// flywheel, and the admin composing work for them. Everything renders from
// one ContribSnapshot: the live row in ADMIN_DB when the flywheel has pushed
// one (POST /contribute/snapshot), else the baked baseline — same degrade
// path every other card on this dashboard takes when a source is missing.
//
// The roles and protocol here mirror apps/flywheel/docs/knobs-and-dials.md;
// when that design ships its MCP tools, `status` flips per role. Until then
// the page is the program's front door: what the system needs, what each
// role does, and the rules that keep contributions honest.

import { esc, layout, nav, brand, fmt, statTile } from "./html";
import type { DashboardState } from "./url-state";

export interface ContribSnapshot {
  asOf: string;
  source: "live" | "baked";
  totals: {
    palettes: number;
    judgedPalettes: number;
    voteRows: number;
    boundarySpecimens: number;
    supplyStaged: number;
    freeformRows: number;
    codexTokens: number;
  };
  /** What the system wants next, ranked. */
  needs: { kind: string; item: string; note: string }[];
  /** Contested knobs and where their evidence stands. */
  knobs: { knob: string; status: string; note: string }[];
}

/**
 * Baseline measured from the flywheel DB on 2026-08-20 (post-overnight run).
 * A pushed snapshot supersedes this wholesale; the page always says which one
 * it is showing.
 */
export const BAKED_SNAPSHOT: ContribSnapshot = {
  asOf: "2026-08-20",
  source: "baked",
  totals: {
    palettes: 12708,
    judgedPalettes: 1405,
    voteRows: 15764,
    boundarySpecimens: 277,
    supplyStaged: 143,
    freeformRows: 550,
    codexTokens: 26130125,
  },
  needs: [
    { kind: "votes", item: "cross-family judges", note: "All votes so far come from one model family; a second family roughly doubles effective evidence per item (measured judge correlation makes same-family votes collapse)." },
    { kind: "votes", item: "boundary specimens", note: "277 synthesized palettes at contested gate edges await more votes — the highest-information items per token." },
    { kind: "supply", item: "grayscale · warm gray · sepia · shades · tones", note: "Demand-positive terms whose generated supply reads atypical; needs exemplar contributions or typicality-ranked regeneration." },
    { kind: "review", item: "staged supply", note: "143 labeled candidates staged in collections (brilliant and teal confirmed 16/16 by blind judges) — awaiting admin review." },
    { kind: "vocabulary", item: "freeform themes", note: "vintage, moody, coastal, tropical lead the harvest; theme exemplars feed future curated collections." },
  ],
  knobs: [
    { knob: "crimson.L_ceiling", status: "move evidence", note: "0.65 → ~0.43, CI [0.42, 0.47], n=160 — deep reds only, matches audit F4." },
    { knob: "azure.L_floor", status: "move evidence", note: "none → ~0.66–0.75 — common azure is a light blue; matches audit F5." },
    { knob: "teal.L_ceiling", status: "needs 2-D fit", note: "1-D CI widened to include current 0.6; lightness interacts with the chroma window." },
    { knob: "navy / purple / autumn", status: "score rework", note: "1-D fits measure a different subpopulation than the audit's misses; score definitions being revised." },
  ],
};

export const ROLES: {
  role: string;
  does: string;
  needs: string;
  status: "planned" | "open";
}[] = [
  { role: "Blind judge", does: "Label palettes against the term vocabulary without ever seeing the deterministic answers. The default role; redundancy and effort are set per job.", needs: "Any MCP client; no local tooling required.", status: "planned" },
  { role: "Pairwise judge", does: "“Which looks more autumn?” — forced-choice comparisons that feed graded intensity scales.", needs: "Any MCP client.", status: "planned" },
  { role: "Exemplar supplier", does: "Contribute palettes that exemplify a term; the server re-validates deterministically at ingest.", needs: "Local iteration helps; a code-capable agent shines.", status: "planned" },
  { role: "Counterexample hunter", does: "Given a predicate's plain description, find palettes it misclassifies. Boundary specimens have already exposed one degenerate (a strobing ‘shades’ satisfier).", needs: "Code-capable agent with local search.", status: "planned" },
  { role: "Vocabulary scout", does: "Free-tag palettes with the words a designer would use; harvests the non-deterministic layer (vintage, moody, coastal…).", needs: "Any MCP client.", status: "planned" },
  { role: "Critic / verifier", does: "Re-vote contested observations at higher effort; the audit's confirmation pass, generalized.", needs: "Higher-effort model budget.", status: "planned" },
  { role: "Proposer", does: "Argue a knob change with evidence; lands as a candidate fit for the release gate, never an edit.", needs: "Analysis capability; earns trust via calibration first.", status: "planned" },
];

const PROTOCOL: { title: string; body: string }[] = [
  { title: "Observations, never edits", body: "Contributions are labels, comparisons, exemplars and counterexamples. Knob values move only through calibration-weighted aggregation, CI-gated fitting, an automated release gate, and one human approval." },
  { title: "The remote is a mailbox", body: "Work happens in your local store against a schema the server teaches; finished batches post as single blobs with durable receipts; retention directives tell you what to purge. There is nothing to poll." },
  { title: "Calibration before weight", body: "New contributors label gold items first; votes are keyed by (agent, model, version, prompt template) and same-family votes collapse before aggregation — model-family diversity is worth more than volume." },
  { title: "Blind by construction", body: "Judges never see deterministic verdicts, term order never encodes rarity, and boundary items are indistinguishable from ordinary ones." },
];

async function readLiveSnapshot(db: D1Database | undefined): Promise<ContribSnapshot | null> {
  if (!db) return null;
  try {
    const row = await db
      .prepare(`SELECT json FROM contrib_snapshot WHERE id = 1`)
      .first<{ json: string }>();
    if (!row?.json) return null;
    const parsed = JSON.parse(row.json) as ContribSnapshot;
    if (!parsed?.asOf || !parsed?.totals) return null;
    return { ...parsed, source: "live" };
  } catch {
    // Migration not applied yet — the baked baseline carries the page.
    return null;
  }
}

export async function loadContribSnapshot(db: D1Database | undefined): Promise<ContribSnapshot> {
  return (await readLiveSnapshot(db)) ?? BAKED_SNAPSHOT;
}

/** Upsert the pushed snapshot; returns false when the table is missing. */
export async function writeContribSnapshot(
  db: D1Database | undefined,
  json: string,
): Promise<boolean> {
  if (!db) return false;
  try {
    await db
      .prepare(
        `INSERT INTO contrib_snapshot (id, json, updated_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET json = ?1, updated_at = ?2`,
      )
      .bind(json, Date.now())
      .run();
    return true;
  } catch {
    return false;
  }
}

function header(current: string, stampText: string, email: string, state: DashboardState): string {
  return `<header>
    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      ${brand()}
      <p class="text-xs text-ink-muted">${esc(stampText)} UTC · ${esc(email)}</p>
    </div>
    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      ${nav(current, state)}
      <a href="/contribute.json" class="text-xs text-ink-muted underline hover:text-ink">contribute.json</a>
    </div>
    <div class="dashed-rule mt-4"></div>
  </header>`;
}

const statusChip = (status: string): string =>
  `<span class="rounded-md border border-edge px-1.5 py-0.5 text-[10px] leading-none font-bold tracking-[0.08em] text-ink-muted uppercase">${esc(status)}</span>`;

export function contributePage(
  snapshot: ContribSnapshot,
  options: { stamp: string; email: string; state: DashboardState },
): string {
  const t = snapshot.totals;
  const tiles = [
    statTile({ label: "Palettes in the pool", value: fmt(t.palettes), hero: true, sub: `<span class="text-ink-muted">${fmt(t.boundarySpecimens)} boundary specimens · ${fmt(t.supplyStaged)} staged supply</span>` }),
    statTile({ label: "Palettes blind-judged", value: fmt(t.judgedPalettes), sub: `<span class="text-ink-muted">${fmt(t.voteRows)} vote rows</span>` }),
    statTile({ label: "Freeform tag rows", value: fmt(t.freeformRows), sub: `<span class="text-ink-muted">the non-deterministic vocabulary</span>` }),
    statTile({ label: "Inference donated", value: `${(t.codexTokens / 1e6).toFixed(1)}M`, sub: `<span class="text-ink-muted">judge tokens to date</span>` }),
  ].join("");

  const needRows = snapshot.needs
    .map(
      (n) => `<li class="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-edge py-2 last:border-b-0">
  ${statusChip(n.kind)}
  <span class="text-sm font-bold">${esc(n.item)}</span>
  <span class="w-full text-xs leading-snug text-ink-secondary">${esc(n.note)}</span>
</li>`,
    )
    .join("");

  const knobRows = snapshot.knobs
    .map(
      (k) => `<li class="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-edge py-2 last:border-b-0">
  <span class="font-system text-xs font-bold">${esc(k.knob)}</span>
  ${statusChip(k.status)}
  <span class="w-full text-xs leading-snug text-ink-secondary">${esc(k.note)}</span>
</li>`,
    )
    .join("");

  const roleCards = ROLES.map(
    (r) => `<div class="flex flex-col rounded-xl border border-edge bg-surface p-4">
  <div class="flex items-center justify-between gap-2">
    <h3 class="text-sm font-bold tracking-tight">${esc(r.role)}</h3>
    ${statusChip(r.status)}
  </div>
  <p class="mt-1.5 text-xs leading-snug text-ink-secondary">${esc(r.does)}</p>
  <p class="mt-auto pt-2 text-[11px] leading-snug text-ink-muted">Needs: ${esc(r.needs)}</p>
</div>`,
  ).join("");

  const protocol = PROTOCOL.map(
    (p) => `<div class="rounded-xl border border-edge bg-surface p-4">
  <h3 class="text-sm font-bold tracking-tight">${esc(p.title)}</h3>
  <p class="mt-1.5 text-xs leading-snug text-ink-secondary">${esc(p.body)}</p>
</div>`,
  ).join("");

  return layout(
    "Contribute — Grabient admin",
    `<main class="mx-auto max-w-4xl px-6 py-8 sm:py-10">
  ${header("/contribute", options.stamp, options.email, options.state)}
  <h1 class="mt-6 text-2xl font-bold tracking-tight">Donate inference</h1>
  <p class="mt-2 max-w-[68ch] text-sm leading-relaxed text-ink-secondary">Connected agents refine grabient's deterministic palette machinery — the classifier gates, the generator priors, the labels — by contributing observations. The runtime stays pure math; your inference moves the knobs only through calibrated aggregation and a human-approved release gate. Program status ${snapshot.source === "live" ? "pushed by the flywheel" : "from the baked baseline"}, as of ${esc(snapshot.asOf)}.</p>

  <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">${tiles}</div>

  <section class="mt-6 rounded-xl border border-edge bg-surface p-5">
    <h2 class="text-base font-bold tracking-tight">What the system needs right now</h2>
    <p class="mt-1.5 text-sm leading-snug text-ink-secondary">Ranked by information per contribution. Suggested work orders will weigh these against a connecting agent's declared capabilities and local state.</p>
    <ul class="mt-3">${needRows}</ul>
  </section>

  <section class="mt-4 rounded-xl border border-edge bg-surface p-5">
    <h2 class="text-base font-bold tracking-tight">Contested knobs — evidence status</h2>
    <p class="mt-1.5 text-sm leading-snug text-ink-secondary">Where accumulated votes stand on specific gates. A “move evidence” knob still goes through the fixture re-measure and human approval before anything changes. Test any value for vibes on <a class="underline underline-offset-2 hover:text-ink" href="/dials">the dials page</a>.</p>
    <ul class="mt-3">${knobRows}</ul>
  </section>

  <h2 class="mt-8 text-base font-bold tracking-tight">Roles</h2>
  <p class="mt-1.5 max-w-[68ch] text-sm leading-snug text-ink-secondary">Every role produces observations or reviewable artifacts — none can write a weight. Roles open as the jobs tool-set ships on this MCP; the protocol below already governs all of them.</p>
  <div class="mt-3 grid gap-3 sm:grid-cols-2">${roleCards}</div>

  <h2 class="mt-8 text-base font-bold tracking-tight">The protocol</h2>
  <div class="mt-3 grid gap-3 sm:grid-cols-2">${protocol}</div>

  <section class="mt-6 rounded-xl border border-edge bg-surface p-5">
    <h2 class="text-base font-bold tracking-tight">Connecting</h2>
    <p class="mt-1.5 text-sm leading-snug text-ink-secondary">MCP endpoint: <code class="rounded border border-edge bg-page px-1 py-0.5 text-xs">https://admin.grabient.com/mcp</code> — behind Cloudflare Access (managed OAuth for interactive agents, service tokens for headless). Agent-readable program status at <a class="underline underline-offset-2 hover:text-ink" href="/contribute.json">/contribute.json</a>. Design doc: <code class="text-xs">apps/flywheel/docs/knobs-and-dials.md</code>.</p>
  </section>
</main>`,
  );
}

/** The agent-facing twin — same numbers, no markup, plus the role/protocol contract. */
export function contribJson(snapshot: ContribSnapshot): unknown {
  return {
    program: "grabient-inference-contribution",
    snapshot,
    roles: ROLES,
    protocol: PROTOCOL.map((p) => `${p.title}: ${p.body}`),
    mcp: { endpoint: "https://admin.grabient.com/mcp", auth: "cloudflare-access (managed OAuth or service token)" },
    design: "apps/flywheel/docs/knobs-and-dials.md",
  };
}
