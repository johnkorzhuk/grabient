// The event system: dated markers with provenance, deduping and soft delete.
//
// An event asserts that something HAPPENED, never that it caused anything —
// correlation with a metric is the reader's inference. The write path is
// idempotent by design: an agent that retries after a timeout must not leave
// two "changed robots.txt" markers on the same day.

import { isoDay } from "./range";

export type EventKind = "deploy" | "decision" | "campaign" | "external" | "incident";
export type EventSource = "manual" | "agent" | "cron-deploys" | "seed";

export interface EventRow {
  id: string;
  kind: EventKind;
  occurred_at: number;
  occurred_on: string;
  ends_on: string | null;
  label: string;
  detail: string | null;
  source: EventSource;
  created_by: string;
  external_id: string | null;
  campaign_id: string | null;
  goal_slug: string | null;
  meta_json: string | null;
  chart_visible: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface LogEventInput {
  kind: EventKind;
  label: string;
  occurredOn?: string;
  occurredAt?: number;
  endsOn?: string;
  detail?: string;
  campaignId?: string;
  goalSlug?: string;
  externalId?: string;
  chartVisible?: boolean;
  allowDuplicate?: boolean;
  meta?: Record<string, unknown>;
}

/**
 * The uniqueness key. Automated writers pass external_id (a Cloudflare
 * deployment id) so re-ingest is exactly idempotent; manual/agent writers get
 * a content-derived key so a retried call updates rather than duplicates. The
 * escape hatch for a genuine same-day duplicate is allowDuplicate.
 */
export function dedupeKey(o: {
  source: string;
  kind: string;
  occurredOn: string;
  label: string;
  externalId?: string;
  allowDuplicate?: boolean;
}): string {
  if (o.externalId) return `${o.source}:${o.externalId}`;
  const slug = o.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const base = `${o.source}:${o.kind}:${o.occurredOn}:${slug}`;
  return o.allowDuplicate ? `${base}:${crypto.randomUUID().slice(0, 8)}` : base;
}

/**
 * `source` is derived here, never caller-supplied — a caller must not be able
 * to forge provenance. Access identities look like an email or
 * "service:<token-name>" (access.ts).
 */
export function deriveSource(actor: string, fromCron = false): EventSource {
  if (fromCron) return "cron-deploys";
  return actor.startsWith("service:") ? "agent" : "manual";
}

export async function logEvent(
  db: D1Database,
  actor: string,
  input: LogEventInput,
  now: Date,
  fromCron = false,
): Promise<{ id: string; created: boolean; deduped: boolean; occurred_on: string }> {
  const occurredOn = input.occurredOn ?? isoDay(now);
  const occurredAt = input.occurredAt ?? (input.occurredOn ? Date.parse(`${occurredOn}T12:00:00Z`) : now.getTime());
  const source = deriveSource(actor, fromCron);
  const key = dedupeKey({
    source,
    kind: input.kind,
    occurredOn,
    label: input.label,
    externalId: input.externalId,
    allowDuplicate: input.allowDuplicate,
  });
  const id = `evt_${crypto.randomUUID().slice(0, 12)}`;
  const ts = now.getTime();

  // The conflict target must reproduce the partial index's predicate or SQLite
  // rejects it at runtime. DO UPDATE rather than DO NOTHING so a re-run with a
  // corrected label self-heals. created_at===updated_at distinguishes insert
  // from dedupe in one round trip.
  const row = await db
    .prepare(
      `INSERT INTO event (id, kind, occurred_at, occurred_on, ends_on, label, detail,
                          source, created_by, external_id, dedupe_key, campaign_id,
                          goal_slug, meta_json, chart_visible, created_at, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?16)
       ON CONFLICT(dedupe_key) WHERE deleted_at IS NULL DO UPDATE SET
         label = excluded.label,
         detail = excluded.detail,
         ends_on = excluded.ends_on,
         meta_json = excluded.meta_json,
         updated_at = excluded.updated_at
       RETURNING id, created_at, updated_at`,
    )
    .bind(
      id,
      input.kind,
      occurredAt,
      occurredOn,
      input.endsOn ?? null,
      input.label,
      input.detail ?? null,
      source,
      actor,
      input.externalId ?? null,
      key,
      input.campaignId ?? null,
      input.goalSlug ?? null,
      input.meta === undefined ? null : JSON.stringify(input.meta),
      input.chartVisible === false ? 0 : 1,
      ts,
    )
    .first<{ id: string; created_at: number; updated_at: number }>();

  const created = row ? row.created_at === row.updated_at : true;
  return { id: row?.id ?? id, created, deduped: !created, occurred_on: occurredOn };
}

export interface ListEventsOptions {
  from?: string;
  to?: string;
  kinds?: string[];
  campaignId?: string;
  includeHidden?: boolean;
  includeDeleted?: boolean;
  limit?: number;
}

/**
 * Range semantics: a range event is returned when its span OVERLAPS the query
 * window at all — a campaign that started before `from` and is still running
 * is in the result. Stated because "overlaps" and "starts within" give
 * different answers and a reader will assume one.
 */
export async function listEvents(
  db: D1Database,
  opts: ListEventsOptions,
  now: Date,
): Promise<EventRow[]> {
  const to = opts.to ?? isoDay(now);
  const from = opts.from ?? isoDay(new Date(now.getTime() - 90 * 86_400_000));
  const conditions = [
    `occurred_on <= ?1`,
    `COALESCE(ends_on, occurred_on) >= ?2`,
  ];
  const params: unknown[] = [to, from];
  if (!opts.includeDeleted) conditions.push(`deleted_at IS NULL`);
  if (!opts.includeHidden) conditions.push(`chart_visible = 1`);
  if (opts.campaignId) {
    params.push(opts.campaignId);
    conditions.push(`campaign_id = ?${params.length}`);
  }
  if (opts.kinds?.length) {
    const placeholders = opts.kinds.map((k) => {
      params.push(k);
      return `?${params.length}`;
    });
    conditions.push(`kind IN (${placeholders.join(",")})`);
  }
  try {
    const res = await db
      .prepare(
        `SELECT * FROM event WHERE ${conditions.join(" AND ")}
          ORDER BY occurred_on, occurred_at LIMIT ${Math.min(200, Math.max(1, opts.limit ?? 200))}`,
      )
      .bind(...params)
      .all<EventRow>();
    return res.results ?? [];
  } catch (err) {
    console.error("listEvents failed (migration pending?)", err);
    return [];
  }
}

export interface MarkerRow {
  id: string;
  kind: string;
  starts_on: string;
  ends_on: string | null;
  label: string;
  detail: string | null;
  source: string;
  campaign_id: string | null;
}

/**
 * The chart layer's single relation: events UNION campaigns, via the `marker`
 * view. Only chart-visible rows; overlap semantics as listEvents.
 */
export async function loadMarkers(
  db: D1Database | undefined,
  from: string,
  to: string,
): Promise<MarkerRow[]> {
  if (!db) return [];
  try {
    const res = await db
      .prepare(
        `SELECT id, kind, starts_on, ends_on, label, detail, source, campaign_id
           FROM marker
          WHERE chart_visible = 1 AND starts_on <= ?1 AND COALESCE(ends_on, starts_on) >= ?2
          ORDER BY starts_on`,
      )
      .bind(to, from)
      .all<MarkerRow>();
    return res.results ?? [];
  } catch (err) {
    console.error("loadMarkers failed (migration pending?)", err);
    return [];
  }
}

export async function softDeleteEvent(
  db: D1Database,
  id: string,
  now: Date,
): Promise<boolean> {
  const res = await db
    .prepare(`UPDATE event SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL`)
    .bind(id, now.getTime())
    .run();
  return (res.meta.changes ?? 0) > 0;
}
