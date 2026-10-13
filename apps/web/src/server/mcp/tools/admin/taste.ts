import { viewSearch } from "@grabient/engine/view.ts";
import { all, first } from "../../../db/d1.ts";
import { removedSeeds } from "../../admin/queue.ts";
import {
  ADMIN_ACTION_KINDS,
  type AdminActionKind,
  CURATION_REASONS,
  listActions
} from "../../admin/record.ts";
import { reviewsOf } from "../../admin/reviews.ts";
import { collectionItem, isCollectionSlug, normalizeListQuery, paletteTexts } from "../../site.ts";
import {
  answer,
  flag,
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
import { ADMINS, hexes, PAGE, SEED, seedList } from "./common.ts";

/* The standard the admins keep: what they liked, what they took out and why, and where palettes stand. */

export const tasteTools: readonly Tool[] = [
  {
    name: "liked_palettes",
    title: "What the admins liked",
    hints: READS,
    description:
      "The admins' liked palettes, newest first: every admin's likes together, the site's standard of taste. Every palette in it looks good. `from` says where its latest like was pressed, when that was recorded: a palette liked from a search or a collection is a good answer to it. `in` lists the Grabient collections that hold it now.",
    inputSchema: shape({
      collection: text("Only palettes liked from this collection or held by it."),
      search: text("Only palettes liked from this search."),
      recorded: flag("Only likes whose search or collection was recorded."),
      since: text("Only likes after this moment (ISO 8601)."),
      page: PAGE,
      limit: whole("How many a page, default 100.", 1, 200)
    }),
    async run(args, c) {
      const where = [`l.user_id IN ${ADMINS}`];
      const bind: (string | number)[] = [];
      const slug = str(args.collection, 120);
      const words = normalizeListQuery(str(args.search, 100));
      const since = momentOf(args.since);
      if (slug) {
        where.push(`(c.slug = ? OR EXISTS (SELECT 1 FROM k_collection_items i JOIN k_collections m ON m.id = i.collection_id
          WHERE i.seed = l.palette_id AND m.slug = ?))`);
        bind.push(slug, slug);
      }
      if (words) {
        where.push("l.query = ?");
        bind.push(words);
      }
      if (args.recorded === true)
        where.push("(l.query IS NOT NULL OR l.collection_id IS NOT NULL)");
      if (since) {
        where.push("l.created_at > ?");
        bind.push(since);
      }
      const page = num(args.page, 1, 1, 10000);
      const limit = num(args.limit, 100, 1, 200);
      const from = `FROM k_likes l LEFT JOIN k_collections c ON c.id = l.collection_id WHERE ${where.join(" AND ")}`;
      const [total, rows] = await Promise.all([
        first<{ n: number }>(c.env.DB, `SELECT COUNT(DISTINCT l.palette_id) AS n ${from}`, ...bind),
        all<{
          seed: string;
          style: string;
          steps: number;
          angle: number;
          at: number;
          query: string | null;
          via: string | null;
          slug: string | null;
        }>(
          c.env.DB,
          `SELECT l.palette_id AS seed, l.style, l.steps, l.angle, MAX(l.created_at) AS at, l.query, l.via, c.slug ${from}
           GROUP BY l.palette_id ORDER BY at DESC, l.palette_id LIMIT ? OFFSET ?`,
          ...bind,
          limit,
          (page - 1) * limit
        )
      ]);
      const holding = rows.length
        ? await all<{ seed: string; slug: string }>(
            c.env.DB,
            `SELECT i.seed, m.slug FROM k_collection_items i JOIN k_collections m ON m.id = i.collection_id
             WHERE m.owner_kind = 'agent' AND i.seed IN (SELECT value FROM json_each(?)) ORDER BY m.slug`,
            JSON.stringify(rows.map(row => row.seed))
          )
        : [];
      const held = new Map<string, string[]>();
      for (const row of holding) held.set(row.seed, [...(held.get(row.seed) ?? []), row.slug]);
      return answer({
        total: Number(total?.n ?? 0),
        page,
        palettes: rows.map(row => {
          const from = {
            ...(row.query ? { search: row.query } : {}),
            ...(row.slug ? { collection: row.slug } : {}),
            ...(row.via ? { via: row.via } : {})
          };
          return {
            seed: row.seed,
            hexes: hexes(row.seed, row),
            style: row.style,
            steps: Number(row.steps),
            angle: Number(row.angle),
            likedAt: moment(row.at),
            ...(Object.keys(from).length ? { from } : {}),
            in: held.get(row.seed) ?? []
          };
        })
      });
    }
  },
  {
    name: "curation_record",
    title: "What the admins took out",
    hints: READS,
    description:
      "The admins' record, newest first: palettes removed from a collection, deleted, redrawn or edited, with the reasons given. What was taken out, and why, is the other half of the site's taste. A palette removed or deleted never comes back.",
    inputSchema: shape({
      kinds: list(
        { type: "string", enum: [...ADMIN_ACTION_KINDS] },
        "Only these actions.",
        0,
        ADMIN_ACTION_KINDS.length
      ),
      seed: SEED,
      collection: text("Only actions on this collection."),
      since: text("Only actions after this moment (ISO 8601)."),
      limit: whole("How many, default 100.", 1, 500)
    }),
    async run(args, c) {
      const seed = args.seed === undefined ? undefined : collectionItem({ seed: args.seed })?.seed;
      if (args.seed !== undefined && !seed) return refuse("That is not a palette seed.");
      const slug = str(args.collection, 120);
      const kinds = items(args.kinds, 20).filter((kind): kind is AdminActionKind =>
        (ADMIN_ACTION_KINDS as readonly unknown[]).includes(kind)
      );
      const [actions, counts] = await Promise.all([
        listActions(c.env, {
          since: momentOf(args.since),
          limit: num(args.limit, 100, 1, 500),
          seed,
          slug: slug && isCollectionSlug(slug) ? slug : undefined,
          kinds
        }),
        all<{ action: string; n: number }>(
          c.env.DB,
          "SELECT action, COUNT(*) AS n FROM k_admin_actions GROUP BY action"
        )
      ]);
      return answer({
        counts: Object.fromEntries(counts.map(row => [row.action, Number(row.n)])),
        reasons: Object.fromEntries(CURATION_REASONS.map(reason => [reason.key, reason.hint])),
        actions: actions.map(a => ({
          action: a.action,
          at: moment(a.createdAt),
          by: a.actor,
          ...(a.seed ? { seed: a.seed, hexes: hexes(a.seed) } : {}),
          ...(a.slug ? { collection: a.slug } : {}),
          ...(a.reasons.length ? { reasons: a.reasons } : {}),
          ...(a.comment ? { comment: a.comment } : {}),
          ...(a.before == null ? {} : { before: a.before }),
          ...(a.after == null ? {} : { after: a.after })
        }))
      });
    }
  },
  {
    name: "palette_standing",
    title: "Where palettes stand",
    hints: READS,
    description:
      "For each palette: its place in the gallery, who liked it, the Grabient collections that hold it, its title, its reviews, and whether an admin took it out before. `locked` means a person liked it (an admin, a reader, or readers of grabient.com): it cannot be edited, redrawn or deleted.",
    inputSchema: shape({ seeds: list(SEED, "The palettes.", 1, 50) }, ["seeds"]),
    async run(args, c) {
      const seeds = seedList(args.seeds, 50);
      if (!seeds.length) return refuse("None of these is a palette seed.");
      const asked = JSON.stringify(seeds);
      const IN = "IN (SELECT value FROM json_each(?))";
      const [gallery, likes, holding, texts, reviews, removed] = await Promise.all([
        all<{
          seed: string;
          style: string;
          steps: number;
          angle: number;
          legacy_likes_count: number;
          created_at: number;
        }>(
          c.env.DB,
          `SELECT seed, style, steps, angle, legacy_likes_count, created_at FROM k_palettes WHERE seed ${IN}`,
          asked
        ),
        all<{ seed: string; admins: number; personas: number; readers: number }>(
          c.env.DB,
          `SELECT l.palette_id AS seed, SUM(CASE WHEN u.role = 'admin' THEN 1 ELSE 0 END) AS admins,
             SUM(CASE WHEN k.user_id IS NOT NULL THEN 1 ELSE 0 END) AS personas,
             SUM(CASE WHEN COALESCE(u.role, 'user') != 'admin' AND k.user_id IS NULL THEN 1 ELSE 0 END) AS readers
           FROM k_likes l LEFT JOIN auth_user u ON u.id = l.user_id LEFT JOIN k_personas k ON k.user_id = l.user_id
           WHERE l.palette_id ${IN} GROUP BY l.palette_id`,
          asked
        ),
        all<{
          seed: string;
          slug: string;
          position: number;
          style: string;
          steps: number;
          angle: number;
        }>(
          c.env.DB,
          `SELECT i.seed, m.slug, i.position, i.style, i.steps, i.angle FROM k_collection_items i
           JOIN k_collections m ON m.id = i.collection_id WHERE m.owner_kind = 'agent' AND i.seed ${IN} ORDER BY m.slug`,
          asked
        ),
        paletteTexts(c.env, seeds),
        reviewsOf(c.env, seeds),
        removedSeeds(c.env, seeds)
      ]);
      const inGallery = new Map(gallery.map(row => [row.seed, row]));
      const liked = new Map(likes.map(row => [row.seed, row]));
      const words = new Map(texts.map(t => [t.seed, t.title]));
      return answer({
        palettes: seeds.map(seed => {
          const g = inGallery.get(seed);
          const l = liked.get(seed);
          const by = {
            admins: Number(l?.admins) || 0,
            readers: Number(l?.readers) || 0,
            personas: Number(l?.personas) || 0,
            oldSite: Number(g?.legacy_likes_count) || 0
          };
          const view = g
            ? viewSearch({
                style: g.style as never,
                steps: Number(g.steps),
                angle: Number(g.angle)
              })
            : "";
          const about = reviews.get(seed);
          return {
            seed,
            url: `${c.origin}/${seed}${view}`,
            hexes: hexes(seed, g),
            ...(words.has(seed) ? { title: words.get(seed) } : {}),
            locked: by.admins + by.readers + by.oldSite > 0,
            likes: by,
            gallery: g
              ? {
                  style: g.style,
                  steps: Number(g.steps),
                  angle: Number(g.angle),
                  since: moment(g.created_at)
                }
              : null,
            collections: holding
              .filter(row => row.seed === seed)
              .map(row => ({
                slug: row.slug,
                position: Number(row.position),
                style: row.style,
                steps: Number(row.steps),
                angle: Number(row.angle)
              })),
            ...(about
              ? {
                  reviews: about.map(r => ({
                    about: r.subject || "palette",
                    verdict: r.verdict,
                    ...(r.note ? { note: r.note } : {}),
                    at: moment(r.at)
                  }))
                }
              : {}),
            ...(removed.has(seed) ? { takenOutBefore: true } : {})
          };
        })
      });
    }
  }
];
