// The report archive and rendered report pages, plus /ops.
//
// Report bodies are agent-authored markdown rendered by markdown.ts with raw
// HTML disabled; the styles ride inline with the page rather than in app.css
// so they stay scoped to report bodies and cannot drift the dashboard.

import { esc, layout, nav, brand } from "./html";
import type { Heading } from "./markdown";
import type { ReportMeta } from "./reports";

const MD_CSS = `
.md { max-width: 68ch; }
.md > * + * { margin-top: 1rem; }
.md h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; }
.md h2 { margin-top: 2.25rem; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.01em; }
.md h3 { margin-top: 1.75rem; font-size: 1rem; font-weight: 700; }
.md h4 { margin-top: 1.5rem; font-size: 0.875rem; font-weight: 700; color: var(--ink-secondary); }
.md p, .md li { line-height: 1.65; color: var(--ink-secondary); font-size: 0.925rem; }
.md strong { color: var(--ink); }
.md a { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }
.md ul, .md ol { padding-left: 1.35rem; }
.md ul { list-style: disc; } .md ol { list-style: decimal; }
.md li + li, .md li > ul, .md li > ol { margin-top: 0.35rem; }
.md blockquote { border-left: 2px solid var(--border); padding-left: 1rem; color: var(--ink-muted); }
.md code { font-size: 0.85em; background: var(--page); border: 1px solid var(--border); border-radius: 0.25rem; padding: 0.1em 0.3em; }
.md pre { overflow-x: auto; background: var(--page); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.85rem 1rem; }
.md pre code { border: 0; background: none; padding: 0; font-size: 0.8rem; line-height: 1.55; }
.md hr { border: 0; border-top: 1px solid var(--border); margin: 2rem 0; }
.md .md-scroll { overflow-x: auto; }
.md table { width: 100%; font-family: var(--font-system); font-variant-numeric: tabular-nums; font-size: 0.8rem; border-collapse: collapse; }
.md th, .md td { border-bottom: 1px solid var(--border); padding: 0.35rem 0.5rem; text-align: left; }
.md th { font-weight: 600; color: var(--ink-muted); }
.md s, .md del { color: var(--ink-muted); }
@media print {
  header nav, .md-toc, .report-actions { display: none; }
  .md { max-width: none; }
  .md a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 0.75em; }
}`;

function chip(label: string): string {
  return `<span class="rounded-md border border-edge px-1.5 py-0.5 text-[10px] leading-none font-bold tracking-wide text-ink-muted uppercase">${esc(label)}</span>`;
}

function pageHeader(current: string, stampText: string, email: string): string {
  return `<header>
    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      ${brand()}
      <p class="text-xs text-ink-muted">${esc(stampText)} UTC · ${esc(email)}</p>
    </div>
    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      ${nav(current)}
      <a href="/brief.json" class="text-xs text-ink-muted underline hover:text-ink">brief.json</a>
    </div>
    <div class="dashed-rule mt-4"></div>
  </header>`;
}

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export function reportsArchivePage(
  items: ReportMeta[],
  options: { kind?: string; nextCursor: string | null; stamp: string; email: string },
): string {
  const filters = [
    { key: "", label: "All" },
    { key: "report", label: "Reports" },
    { key: "digest", label: "Digests" },
  ]
    .map((f) => {
      const active = (options.kind ?? "") === f.key;
      return `<a href="/reports${f.key ? `?kind=${f.key}` : ""}"${active ? ' aria-current="true"' : ""} class="rounded-md px-2 py-0.5 text-xs font-bold transition-colors ${active ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"}">${f.label}</a>`;
    })
    .join("");

  const rows =
    items.length === 0
      ? `<p class="mt-4 rounded-lg border border-edge bg-page p-4 text-sm text-ink-secondary">No reports yet. Agents write these through the MCP <code class="text-xs">report_write</code> tool; weekly and monthly digests appear once the cron has run.</p>`
      : items
          .map(
            (r) => `<a href="/reports/${esc(r.slug)}" class="block rounded-xl border border-edge bg-surface p-4 transition-colors hover:border-ink-muted">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <span class="text-sm font-bold tracking-tight">${esc(r.title)}</span>
    <span class="text-xs text-ink-muted">${esc(fmtDate(r.created_at))}</span>
  </div>
  <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
    ${chip(r.kind)}${chip(r.author)}${r.period ? chip(`${r.period.start} → ${r.period.end}`) : ""}${r.revision > 1 ? chip(`rev ${r.revision}`) : ""}
  </div>
  ${r.summary ? `<p class="mt-2 text-xs leading-snug text-ink-secondary">${esc(r.summary)}</p>` : ""}
</a>`,
          )
          .join("\n");

  return layout(
    "Reports — Grabient admin",
    `<main class="mx-auto max-w-4xl px-6 py-8 sm:py-10">
  ${pageHeader("/reports", options.stamp, options.email)}
  <div class="mt-5 flex items-center gap-2">
    <span class="text-[11px] font-bold tracking-[0.1em] text-ink-muted uppercase">Kind</span>
    <div class="flex items-center gap-1">${filters}</div>
  </div>
  <div class="mt-4 grid gap-3">${rows}</div>
  ${
    options.nextCursor
      ? `<p class="mt-6"><a href="/reports?${options.kind ? `kind=${esc(options.kind)}&` : ""}before=${esc(options.nextCursor)}" class="text-xs text-ink-muted underline hover:text-ink">Older →</a></p>`
      : ""
  }
</main>`,
  );
}

export function reportPage(
  meta: ReportMeta,
  bodyHtml: string,
  headings: Heading[],
  options: { stamp: string; email: string },
): string {
  const provenance = [
    meta.author === "cron" ? "generated by cron" : meta.author === "agent" ? "written by agent via MCP" : "written by hand",
    meta.author_ref && meta.author_ref !== "cron" ? meta.author_ref : null,
    fmtDate(meta.updated_at),
    meta.revision > 1 ? `revision ${meta.revision}` : null,
    `${(meta.bytes / 1024).toFixed(1)} KB`,
    meta.period ? `covers ${meta.period.start} → ${meta.period.end}` : null,
  ]
    .filter(Boolean)
    .map((part) => esc(String(part)))
    .join(" · ");

  const toc =
    headings.length >= 4
      ? `<details class="md-toc mt-4 rounded-lg border border-edge bg-surface p-3">
  <summary class="cursor-pointer text-xs font-bold tracking-wide text-ink-muted uppercase hover:text-ink">Contents</summary>
  <ul class="mt-2 space-y-1 text-sm">${headings
    .map(
      (h) =>
        `<li class="${h.level === 3 ? "pl-4" : ""}"><a class="text-ink-secondary underline-offset-2 hover:text-ink hover:underline" href="#${esc(h.id)}">${esc(h.text)}</a></li>`,
    )
    .join("")}</ul>
</details>`
      : "";

  return layout(
    `${meta.title} — Grabient admin`,
    `<style>${MD_CSS}</style>
<main class="mx-auto max-w-4xl px-6 py-8 sm:py-10">
  ${pageHeader("/reports", options.stamp, options.email)}
  <div class="report-actions mt-5 flex items-center justify-between gap-3">
    <a href="/reports" class="text-xs text-ink-muted underline hover:text-ink">← All reports</a>
    <a href="${esc(meta.raw_url.replace("https://admin.grabient.com", ""))}" class="text-xs text-ink-muted underline hover:text-ink">raw markdown</a>
  </div>
  <h1 class="mt-4 text-2xl font-bold tracking-tight">${esc(meta.title)}</h1>
  <p class="mt-1.5 text-xs text-ink-muted">${provenance}</p>
  ${toc}
  <article class="md mt-6">${bodyHtml}</article>
</main>`,
  );
}

export function opsPage(
  jobs: Array<{ job: string; started_at: number; finished_at: number | null; ok: number | null; rows_written: number; detail: string | null }>,
  options: { stamp: string; email: string },
): string {
  const rows =
    jobs.length === 0
      ? `<p class="mt-3 text-sm text-ink-secondary">No job runs recorded yet — the crons write here (snapshot 04:20, sweep 05:40, digests 06:10 UTC), and so does the backfill.</p>`
      : `<table class="data-table mt-3 w-full text-xs"><thead>
  <tr><th class="border-b border-edge px-2 py-1.5 text-left font-semibold text-ink-muted">Job</th>
  <th class="border-b border-edge px-2 py-1.5 text-left font-semibold text-ink-muted">Started</th>
  <th class="border-b border-edge px-2 py-1.5 text-right font-semibold text-ink-muted">Status</th>
  <th class="border-b border-edge px-2 py-1.5 text-right font-semibold text-ink-muted">Rows</th>
  <th class="border-b border-edge px-2 py-1.5 text-left font-semibold text-ink-muted">Detail</th></tr>
</thead><tbody>${jobs
          .map(
            (j) => `<tr>
  <td class="border-b border-edge px-2 py-1.5 font-bold">${esc(j.job)}</td>
  <td class="border-b border-edge px-2 py-1.5">${esc(fmtDate(j.started_at))}</td>
  <td class="border-b border-edge px-2 py-1.5 text-right">${j.ok === null ? "running" : j.ok ? '<span class="text-good font-bold">ok</span>' : '<span class="text-critical font-bold">failed</span>'}</td>
  <td class="border-b border-edge px-2 py-1.5 text-right">${j.rows_written}</td>
  <td class="border-b border-edge px-2 py-1.5 text-ink-muted">${esc((j.detail ?? "").slice(0, 120))}</td>
</tr>`,
          )
          .join("")}</tbody></table>`;

  return layout(
    "Ops — Grabient admin",
    `<main class="mx-auto max-w-4xl px-6 py-8 sm:py-10">
  ${pageHeader("/ops", options.stamp, options.email)}
  <section class="mt-6 rounded-xl border border-edge bg-surface p-5">
    <h2 class="text-base font-bold tracking-tight">Job runs</h2>
    <p class="mt-1.5 text-sm leading-snug text-ink-secondary">The failure mode this page exists for is a cron that silently stopped — "last successful snapshot" should never be older than a day.</p>
    ${rows}
  </section>
  <section class="mt-4 rounded-xl border border-edge bg-surface p-5">
    <h2 class="text-base font-bold tracking-tight">Backfill</h2>
    <p class="mt-1.5 text-sm leading-snug text-ink-secondary">Reconstructs the metric archive from the upstream APIs — idempotent, safe to re-run; a no-op re-run writes zero rows. Dry run first shows the plan.</p>
    <div class="mt-4 flex flex-wrap gap-2">
      <form method="post" action="/ops/backfill?dry=1"><button class="rounded-md border border-edge px-3 py-1.5 text-xs font-bold hover:border-ink-muted">Dry run</button></form>
      <form method="post" action="/ops/backfill"><button class="rounded-md bg-ink px-3 py-1.5 text-xs font-bold text-surface">Run full backfill</button></form>
    </div>
  </section>
</main>`,
  );
}
