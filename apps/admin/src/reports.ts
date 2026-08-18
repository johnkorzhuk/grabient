// The report store: agent-authored markdown documents and cron-generated
// period digests, one table, one URL space (/reports/{slug}).
//
// Slugs are IMMUTABLE and human-readable (2026-08-17-seo-week-3): the URL is
// delivered into a chat message and may already be open in the owner's
// browser, so a revision overwrites the row in place and appends the previous
// version to report_revisions — the link never goes stale, and an agent
// replacing a good report with a worse one is recoverable.

import type { Brief } from "./brief";
import { isoDay } from "./range";

export const BODY_CAP_BYTES = 262_144; // 256 KB — see the CHECK in 0004
const REVISIONS_KEPT = 20;

export type ReportKind = "report" | "digest";
export type PeriodType = "day" | "week" | "month" | "quarter";

export interface ReportRow {
  id: string;
  slug: string;
  kind: ReportKind;
  title: string;
  summary: string | null;
  body_md: string;
  payload_json: string | null;
  period_type: PeriodType | null;
  period_start: string | null;
  period_end: string | null;
  author: "agent" | "cron" | "human";
  author_ref: string | null;
  tags: string | null;
  revision: number;
  bytes: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface ReportMeta {
  slug: string;
  kind: ReportKind;
  title: string;
  summary: string | null;
  author: string;
  author_ref: string | null;
  period: { type: PeriodType; start: string; end: string } | null;
  tags: string[];
  revision: number;
  bytes: number;
  created_at: number;
  updated_at: number;
  url: string;
  raw_url: string;
}

const BASE_URL = "https://admin.grabient.com";

export function toMeta(row: ReportRow): ReportMeta {
  return {
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    author: row.author,
    author_ref: row.author_ref,
    period:
      row.period_type && row.period_start && row.period_end
        ? { type: row.period_type, start: row.period_start, end: row.period_end }
        : null,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
    revision: row.revision,
    bytes: row.bytes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    url: `${BASE_URL}/reports/${row.slug}`,
    raw_url: `${BASE_URL}/reports/${row.slug}.md`,
  };
}

const kebab = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "report";

/** Time-sortable opaque id — the revision-log key, never the URL. */
const newId = () => `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;

export interface WriteReportInput {
  title: string;
  markdown: string;
  slug?: string;
  summary?: string;
  tags?: string[];
  kind?: ReportKind;
  period?: { type: PeriodType; start: string; end: string };
  payload?: unknown;
  author: "agent" | "cron" | "human";
  authorRef: string;
}

export interface WriteReportResult {
  ok: true;
  slug: string;
  revision: number;
  created: boolean;
  bytes: number;
  url: string;
  raw_url: string;
}

export interface WriteReportRefusal {
  ok: false;
  error: string;
}

export async function writeReport(
  db: D1Database,
  input: WriteReportInput,
  now: Date,
): Promise<WriteReportResult | WriteReportRefusal> {
  const bytes = new TextEncoder().encode(input.markdown).length;
  if (bytes > BODY_CAP_BYTES) {
    return {
      ok: false,
      error: `Body is ${bytes.toLocaleString("en-US")} bytes; the cap is 262,144 (256 KB). This is a hard limit — split the report or cut the appendix. Nothing was written.`,
    };
  }
  const ts = now.getTime();
  const kind = input.kind ?? "report";
  const summary =
    input.summary ??
    input.markdown
      .split(/\n{2,}/)
      .map((p) => p.replace(/^#+\s*/, "").replace(/\s+/g, " ").trim())
      .find((p) => p.length > 0)
      ?.slice(0, 280) ??
    null;

  // Digests are addressed by period, not by caller-chosen slug — re-running
  // Monday's cron must revise the same weekly digest. Ordinary reports revise
  // only when the caller passes the slug back.
  let existing: ReportRow | null = null;
  if (kind === "digest" && input.period) {
    existing = await db
      .prepare(
        `SELECT * FROM reports WHERE kind = 'digest' AND period_type = ?1 AND period_start = ?2 AND deleted_at IS NULL`,
      )
      .bind(input.period.type, input.period.start)
      .first<ReportRow>();
  } else if (input.slug) {
    existing = await db
      .prepare(`SELECT * FROM reports WHERE slug = ?1 AND deleted_at IS NULL`)
      .bind(input.slug)
      .first<ReportRow>();
    if (!existing) {
      return {
        ok: false,
        error: `No report with slug '${input.slug}' exists. Omit slug to create a new report; the slug you get back is the handle for revising it.`,
      };
    }
  }

  if (existing) {
    const revision = existing.revision + 1;
    await db.batch([
      db
        .prepare(
          `INSERT INTO report_revisions (report_id, revision, title, body_md, author_ref, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        )
        .bind(existing.id, existing.revision, existing.title, existing.body_md, existing.author_ref, ts),
      db
        .prepare(
          `DELETE FROM report_revisions WHERE report_id = ?1 AND revision <= ?2`,
        )
        .bind(existing.id, revision - REVISIONS_KEPT),
      db
        .prepare(
          `UPDATE reports SET title = ?2, summary = ?3, body_md = ?4, payload_json = ?5,
                  tags = ?6, revision = ?7, bytes = ?8, updated_at = ?9, author_ref = ?10
            WHERE id = ?1`,
        )
        .bind(
          existing.id,
          input.title,
          summary,
          input.markdown,
          input.payload === undefined ? existing.payload_json : JSON.stringify(input.payload),
          input.tags ? JSON.stringify(input.tags) : existing.tags,
          revision,
          bytes,
          ts,
          input.authorRef,
        ),
    ]);
    return {
      ok: true,
      slug: existing.slug,
      revision,
      created: false,
      bytes,
      url: `${BASE_URL}/reports/${existing.slug}`,
      raw_url: `${BASE_URL}/reports/${existing.slug}.md`,
    };
  }

  // New report: derive the slug, suffixing on collision (soft-deleted slugs
  // stay reserved — the UNIQUE is deliberately not partial).
  const baseSlug =
    kind === "digest" && input.period
      ? periodSlug(input.period.type, input.period.start)
      : `${isoDay(now)}-${kebab(input.title)}`;
  let slug = baseSlug;
  // Bounded: one SELECT per attempt, and a pathological title must not be able
  // to spin. Past the cap, disambiguate with a random suffix instead.
  for (let n = 2; n <= 25; n++) {
    const taken = await db
      .prepare(`SELECT 1 FROM reports WHERE slug = ?1`)
      .bind(slug)
      .first();
    if (!taken) break;
    slug = n === 25 ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}` : `${baseSlug}-${n}`;
  }

  await db
    .prepare(
      `INSERT INTO reports (id, slug, kind, title, summary, body_md, payload_json,
                            period_type, period_start, period_end, author, author_ref,
                            tags, revision, bytes, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,1,?14,?15,?15)`,
    )
    .bind(
      newId(),
      slug,
      kind,
      input.title,
      summary,
      input.markdown,
      input.payload === undefined ? null : JSON.stringify(input.payload),
      input.period?.type ?? null,
      input.period?.start ?? null,
      input.period?.end ?? null,
      input.author,
      input.authorRef,
      input.tags ? JSON.stringify(input.tags) : null,
      bytes,
      ts,
    )
    .run();
  return {
    ok: true,
    slug,
    revision: 1,
    created: true,
    bytes,
    url: `${BASE_URL}/reports/${slug}`,
    raw_url: `${BASE_URL}/reports/${slug}.md`,
  };
}

export async function getReport(
  db: D1Database | undefined,
  slug: string,
  revision?: number,
): Promise<{ row: ReportRow; body: string; title: string } | null> {
  if (!db) return null;
  try {
    const row = await db
      .prepare(`SELECT * FROM reports WHERE slug = ?1 AND deleted_at IS NULL`)
      .bind(slug)
      .first<ReportRow>();
    if (!row) return null;
    if (revision && revision < row.revision) {
      const old = await db
        .prepare(
          `SELECT title, body_md FROM report_revisions WHERE report_id = ?1 AND revision = ?2`,
        )
        .bind(row.id, revision)
        .first<{ title: string; body_md: string }>();
      if (old) return { row, body: old.body_md, title: old.title };
    }
    return { row, body: row.body_md, title: row.title };
  } catch (err) {
    console.error("getReport failed (migration pending?)", err);
    return null;
  }
}

export interface ListReportsOptions {
  kind?: ReportKind;
  periodType?: PeriodType;
  tag?: string;
  q?: string;
  limit?: number;
  cursor?: string;
}

/** Keyset pagination on (created_at DESC, id DESC); never returns bodies. */
export async function listReports(
  db: D1Database | undefined,
  opts: ListReportsOptions,
): Promise<{ items: ReportMeta[]; nextCursor: string | null }> {
  if (!db) return { items: [], nextCursor: null };
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const conditions = ["deleted_at IS NULL"];
  const params: unknown[] = [];
  const push = (value: unknown) => {
    params.push(value);
    return `?${params.length}`;
  };
  if (opts.kind) conditions.push(`kind = ${push(opts.kind)}`);
  if (opts.periodType) conditions.push(`period_type = ${push(opts.periodType)}`);
  if (opts.tag) conditions.push(`tags LIKE ${push(`%"${opts.tag.slice(0, 30)}"%`)}`);
  // D1 caps LIKE patterns at 50 bytes; truncate well under it.
  if (opts.q) conditions.push(`title LIKE ${push(`%${opts.q.slice(0, 40)}%`)}`);
  if (opts.cursor) {
    const [ts, id] = opts.cursor.split(":");
    if (ts && id) {
      conditions.push(
        `(created_at < ${push(Number(ts))} OR (created_at = ${push(Number(ts))} AND id < ${push(id)}))`,
      );
    }
  }
  try {
    const res = await db
      .prepare(
        `SELECT id, slug, kind, title, summary, period_type, period_start, period_end,
                author, author_ref, tags, revision, bytes, created_at, updated_at, deleted_at,
                '' AS body_md, NULL AS payload_json
           FROM reports WHERE ${conditions.join(" AND ")}
          ORDER BY created_at DESC, id DESC LIMIT ${limit + 1}`,
      )
      .bind(...params)
      .all<ReportRow>();
    const rows = res.results ?? [];
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toMeta),
      nextCursor: rows.length > limit && last ? `${last.created_at}:${last.id}` : null,
    };
  } catch (err) {
    console.error("listReports failed (migration pending?)", err);
    return { items: [], nextCursor: null };
  }
}

// ---------------------------------------------------------------------------
// Period arithmetic and the deterministic digest.
// ---------------------------------------------------------------------------

export function periodSlug(type: PeriodType, start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  switch (type) {
    case "day":
      return `${start}-daily`;
    case "week": {
      // ISO week number, computed on the Thursday of the week.
      const thursday = new Date(d.getTime() + 3 * 86_400_000);
      const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
      const week = Math.ceil(((thursday.getTime() - jan1) / 86_400_000 + 1) / 7);
      return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}-weekly`;
    }
    case "month":
      return `${start.slice(0, 7)}-monthly`;
    case "quarter":
      return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}-quarterly`;
  }
}

export function periodBounds(type: PeriodType, ref: Date): { start: string; end: string } {
  const day = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  switch (type) {
    case "day": {
      const start = new Date(day.getTime() - 86_400_000);
      return { start: isoDay(start), end: isoDay(start) };
    }
    case "week": {
      // The Monday-Sunday week that ENDED most recently before `ref`.
      const dow = (day.getUTCDay() + 6) % 7; // Mon=0
      const lastMonday = new Date(day.getTime() - (dow + 7) * 86_400_000);
      return { start: isoDay(lastMonday), end: isoDay(new Date(lastMonday.getTime() + 6 * 86_400_000)) };
    }
    case "month": {
      const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 0));
      return { start: isoDay(start), end: isoDay(end) };
    }
    case "quarter": {
      const q = Math.floor(day.getUTCMonth() / 3);
      const start = new Date(Date.UTC(day.getUTCFullYear(), (q - 1) * 3, 1));
      const end = new Date(Date.UTC(day.getUTCFullYear(), q * 3, 0));
      return { start: isoDay(start), end: isoDay(end) };
    }
  }
}

/**
 * Which digest periods CLOSED as of `now` — the one-cron calendar. Daily
 * digests are deliberately absent (365 rows/year of archive noise; generate
 * them on demand through the brief tool instead).
 */
export function periodsClosing(now: Date): PeriodType[] {
  const out: PeriodType[] = [];
  const dow = now.getUTCDay();
  const dom = now.getUTCDate();
  const month = now.getUTCMonth();
  if (dow === 1) out.push("week");
  if (dom === 1) out.push("month");
  if (dom === 1 && month % 3 === 0) out.push("quarter");
  return out;
}

/**
 * The cron writes FACTS deterministically — no model call, no API key, no
 * cost. Agents write interpretation as kind='report' on top; that division is
 * the design.
 */
export function digestMarkdown(
  brief: Brief,
  period: { type: PeriodType; start: string; end: string },
  extras: {
    events?: Array<{ on: string; kind: string; label: string }>;
    goals?: Array<{ slug: string; title: string; progressPct: number | null; current: number | null; target: number }>;
  } = {},
): { title: string; markdown: string } {
  const title = `${period.type[0]!.toUpperCase()}${period.type.slice(1)}ly digest · ${period.start} → ${period.end}`
    .replace("Dayly", "Daily")
    .replace("Weekly digest", "Weekly digest")
    .replace("Monthly", "Monthly")
    .replace("Quarterly", "Quarterly");

  const lines: string[] = [];
  lines.push(`# ${title}`, "", brief.summary, "");
  lines.push(`## Key metrics`, "");
  lines.push(`| metric | value |`, `|---|---|`);
  for (const [key, value] of Object.entries(brief.metrics)) {
    if (value === null || typeof value === "object") continue;
    lines.push(`| ${key.replace(/_/g, " ")} | ${typeof value === "number" ? value.toLocaleString("en-US") : String(value)} |`);
  }
  lines.push("");
  if (brief.search_console && (brief.search_console as any).totals) {
    const t = (brief.search_console as any).totals;
    lines.push(
      `## Search`,
      "",
      `${Number(t.clicks).toLocaleString("en-US")} clicks from ${Number(t.impressions).toLocaleString("en-US")} impressions (${t.ctr_pct}% CTR, avg position ${t.average_position}).`,
      "",
    );
  }
  if (brief.ga4?.channels?.length) {
    lines.push(`## Channels (GA4, bot-filtered)`, "", `| channel | sessions | engagement |`, `|---|---|---|`);
    for (const ch of brief.ga4.channels) {
      lines.push(`| ${ch.key} | ${ch.sessions.toLocaleString("en-US")} | ${ch.engagementPct.toFixed(1)}% |`);
    }
    lines.push("");
  }
  if (extras.events?.length) {
    lines.push(`## Events in this period`, "");
    for (const e of extras.events) lines.push(`- **${e.on}** · ${e.kind} · ${e.label}`);
    lines.push("");
  }
  if (extras.goals?.length) {
    lines.push(`## Goals`, "", `| goal | current | target | progress |`, `|---|---|---|---|`);
    for (const g of extras.goals) {
      lines.push(
        `| ${g.title} | ${g.current === null ? "—" : g.current.toLocaleString("en-US")} | ${g.target.toLocaleString("en-US")} | ${g.progressPct === null ? "—" : `${g.progressPct}%`} |`,
      );
    }
    lines.push("");
  }
  lines.push(`## Caveats`, "");
  for (const c of brief.caveats) lines.push(`- ${c}`);
  lines.push("", `## Cannot be answered from this data`, "");
  for (const u of brief.unavailable) lines.push(`- ${u}`);
  lines.push("");
  return { title, markdown: lines.join("\n") };
}
