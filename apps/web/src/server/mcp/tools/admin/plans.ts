import { isCollectionSlug } from "../../../../features/collections/address.ts";
import { MAX_COLLECTION_ITEMS } from "../../../../features/collections/schema.ts";
import { type CollectionRecord, collectionRecord } from "../../../collections/read.ts";
import {
  ensurePersonas,
  listPersonas,
  personaId,
  personaIds,
  personaInput
} from "../../admin/personas.ts";
import {
  cancelQueue,
  enqueue,
  listQueue,
  QUEUE_STATUSES,
  type QueueInput,
  type QueueStatus,
  queueInput,
  queueLabel,
  queueSummary
} from "../../admin/queue.ts";
import { logContribution } from "../../admin/reviews.ts";
import {
  answer,
  entryOf,
  items,
  list,
  moment,
  momentOf,
  num,
  READS,
  refuse,
  shape,
  str,
  type Tool,
  text,
  whole
} from "../../tool.ts";
import {
  CHANGES_RECORD,
  CHANGES_SITE,
  carried,
  SEED,
  siteCollection,
  TITLED,
  titled,
  untitledOf,
  VIEW,
  who
} from "./common.ts";

/* The site's plans: the seeding queue, which adds palettes to Grabient's collections and has personas like palettes
   over time, and the personas themselves. */

export const planTools: readonly Tool[] = [
  {
    name: "schedule",
    title: "Schedule palettes and likes",
    // a collection item's titles replace a palette's when it is applied; an item sent again is the one already queued
    hints: CHANGES_SITE,
    description:
      "Plan work for later, so the site keeps moving: the site applies what is due every ten minutes. A `collection` item adds palettes to a Grabient collection at its time, making the collection from the title given if no one has that slug. A `like` item has a persona like a palette at its time, which brings the palette into the public gallery and onto the home page as a reader's like does; it needs the palette in the gallery or in a public collection by then. `due` is a day (2026-10-05, applied at 14:00 UTC) or a moment (ISO 8601), up to 400 days ahead. Items spread over days and hours arrive as people would. `label` names the batch, to list or cancel it.",
    inputSchema: shape(
      {
        label: text("A name for this batch.", { maxLength: 80 }),
        items: list(
          {
            type: "object",
            properties: {
              kind: text("", { enum: ["collection", "like"] }),
              due: text("A day or a moment."),
              slug: text("collection: the collection's address."),
              title: text("collection: needed when it does not exist yet.", { maxLength: 80 }),
              description: text("collection.", { maxLength: 500 }),
              tags: list(text(""), "collection.", 0, 12),
              palettes: list(TITLED, "collection: the palettes to add.", 1, MAX_COLLECTION_ITEMS),
              persona: text("like: a persona's handle, as personas lists them."),
              seed: SEED,
              ...VIEW
            },
            required: ["kind", "due"],
            additionalProperties: false
          },
          "What to schedule.",
          1,
          500
        )
      },
      ["items"]
    ),
    async run(args, c) {
      const given = items(args.items, 500);
      if (!given.length) return refuse("Send at least one item.");
      const personas = await personaIds(c.env);
      const now = Date.now();
      const known = new Map<string, CollectionRecord | null>();
      const valid: QueueInput[] = [];
      const skipped: { item: number; why: string }[] = [];
      const untitled: { seed: string; words: string[] }[] = [];
      for (const [i, raw] of given.entries()) {
        const entry = entryOf(raw);
        let asked: Record<string, unknown> | null = null;
        if (entry?.kind === "like") {
          const actor = personaId(str(entry.persona, 40));
          if (!personas.has(actor)) {
            skipped.push({
              item: i + 1,
              why: "persona is the handle of one of the site's personas."
            });
            continue;
          }
          asked = {
            kind: "like",
            due: entry.due,
            actor,
            payload: {
              seed: entry.seed,
              style: entry.style,
              steps: entry.steps,
              angle: entry.angle
            }
          };
        } else if (entry?.kind === "collection") {
          const sent = titled(entry.palettes, MAX_COLLECTION_ITEMS);
          if (typeof sent === "string") {
            skipped.push({ item: i + 1, why: sent });
            continue;
          }
          untitled.push(...sent.untitled);
          const slug = str(entry.slug, 120);
          if (!known.has(slug))
            known.set(
              slug,
              slug && isCollectionSlug(slug) ? await collectionRecord(c.env, slug) : null
            );
          const held = known.get(slug) ?? null;
          if (held && !siteCollection(held)) {
            skipped.push({ item: i + 1, why: "That address belongs to another collection." });
            continue;
          }
          // a collection that exists keeps its words: the queue only adds to it
          asked = {
            kind: "collection",
            due: entry.due,
            payload: {
              slug,
              title: entry.title ?? held?.input.title,
              description: entry.description ?? held?.input.description,
              tags: entry.tags ?? held?.input.tags,
              items: sent.palettes,
              ...(sent.texts.length ? { texts: sent.texts } : {})
            }
          };
        }
        const read = asked
          ? queueInput(asked, personas, now)
          : ({ ok: false, error: "kind is collection or like." } as const);
        if (read.ok) valid.push(read.item);
        else skipped.push({ item: i + 1, why: read.error });
      }
      if (!valid.length) {
        return refuse(
          `Nothing was scheduled. ${skipped
            .slice(0, 5)
            .map(s => `Item ${s.item}: ${s.why}`)
            .join(" ")}`
        );
      }
      const stopped = await carried(c, valid.length);
      if (stopped) return stopped;
      const label = queueLabel(args.label) || `mcp ${new Date(now).toISOString().slice(0, 10)}`;
      const report = await enqueue(c.env, label, valid);
      const dues = valid.map(item => item.dueAt);
      await logContribution(c.env, who(c), "schedule", label, {
        queued: report.queued,
        likes: valid.filter(v => v.kind === "like").length,
        collections: valid.filter(v => v.kind === "collection").length
      });
      return answer({
        label,
        queued: report.queued,
        ...(report.existing ? { alreadyScheduled: report.existing } : {}),
        firstDue: moment(Math.min(...dues)),
        lastDue: moment(Math.max(...dues)),
        ...(skipped.length ? { skipped } : {}),
        ...untitledOf(untitled)
      });
    }
  },
  {
    name: "schedule_list",
    title: "What is scheduled",
    hints: READS,
    description:
      "The seeding queue: what is planned, done, failed or cancelled, soonest first, with the plan by week.",
    inputSchema: shape({
      status: list(
        { type: "string", enum: [...QUEUE_STATUSES] },
        "Default due.",
        0,
        QUEUE_STATUSES.length
      ),
      kind: text("", { enum: ["collection", "like"] }),
      label: text("Only this batch.", { maxLength: 80 }),
      from: text("Due at or after this moment (ISO 8601)."),
      to: text("Due at or before this moment."),
      limit: whole("How many items, default 100. 0 for the summary alone.", 0, 500)
    }),
    async run(args, c) {
      const status = items(args.status, 5).filter((s): s is QueueStatus =>
        (QUEUE_STATUSES as readonly unknown[]).includes(s)
      );
      const limit = num(args.limit, 100, 0, 500);
      const [summary, queued] = await Promise.all([
        queueSummary(c.env),
        limit
          ? listQueue(c.env, {
              status: status.length ? status : ["due"],
              kind: args.kind === "like" || args.kind === "collection" ? args.kind : undefined,
              label: queueLabel(args.label) || undefined,
              from: momentOf(args.from),
              to: momentOf(args.to),
              limit
            })
          : []
      ]);
      return answer({
        byStatus: summary.byStatus,
        byKind: summary.byKind,
        nextDue: moment(summary.nextDue),
        lastDue: moment(summary.lastDue),
        weeks: summary.weeks.filter(week => week.due > 0),
        items: queued.map(item => ({
          id: item.id,
          kind: item.kind,
          due: moment(item.dueAt),
          status: item.status,
          ...(item.label ? { label: item.label } : {}),
          ...(item.kind === "like"
            ? { persona: item.actor?.replace(/^persona-/, ""), seed: item.payload.seed }
            : {
                slug: item.payload.slug,
                palettes: Array.isArray(item.payload.items) ? item.payload.items.length : 0
              }),
          ...(item.status === "failed" ? { result: item.result } : {})
        }))
      });
    }
  },
  {
    name: "schedule_cancel",
    title: "Cancel scheduled work",
    hints: CHANGES_RECORD,
    description:
      "Take planned items out of the queue before they are due, by their ids or by the label of their batch.",
    inputSchema: shape({
      ids: list(text(""), "Item ids.", 1, 500),
      label: text("A batch's label.", { maxLength: 80 })
    }),
    async run(args, c) {
      const ids = items(args.ids, 500).filter(
        (id): id is string => typeof id === "string" && /^[a-z0-9]{20}$/.test(id)
      );
      const label = queueLabel(args.label);
      if (!ids.length && !label) return refuse("Name the items by ids or by their label.");
      const cancelled = await cancelQueue(c.env, { ids, label: label || undefined });
      if (cancelled)
        await logContribution(c.env, who(c), "schedule_cancel", label || ids[0]!, { cancelled });
      return answer({ cancelled });
    }
  },
  {
    name: "personas",
    title: "The personas",
    // `add` rewrites the taste of a persona that exists
    hints: CHANGES_RECORD,
    description:
      "The accounts scheduled likes are made with: stand-ins for readers, each with a taste, so the gallery's likes look like many people's. They never sign in and are shown nowhere. Lists them; `add` makes new ones or rewrites the taste of ones that exist. A persona's taste says which palettes its likes suit.",
    inputSchema: shape({
      add: list(
        shape(
          {
            handle: text("2 to 24 lowercase letters, digits or hyphens."),
            name: text("Up to 40 characters."),
            taste: list(text("A short lowercase word."), "What it goes for.", 0, 12)
          },
          ["handle"]
        ),
        "Personas to make or update.",
        1,
        50
      )
    }),
    async run(args, c) {
      if (args.add !== undefined) {
        const wanted = items(args.add, 50).map(personaInput);
        if (!wanted.length || wanted.some(persona => !persona)) {
          return refuse(
            "Every persona needs a handle of 2 to 24 lowercase letters, digits or hyphens; the taste is up to 12 short lowercase words."
          );
        }
        const stopped = await carried(c, wanted.length);
        if (stopped) return stopped;
        const made = wanted.filter(persona => persona !== null);
        await ensurePersonas(c.env, made);
        await logContribution(c.env, who(c), "personas", made[0]?.handle ?? "", {
          personas: made.length
        });
      }
      return answer({ personas: await listPersonas(c.env) });
    }
  }
];
