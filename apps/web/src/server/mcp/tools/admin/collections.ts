import { all, first } from "@grabient/server/db/d1.ts";
import { likedByPeople } from "../../../collections/curation.ts";
import { texts as paletteTexts } from "../../../collections/files.ts";
import { itemFits } from "../../../collections/fit.ts";
import { folded } from "../../../collections/letters.ts";
import { listNotes } from "../../../collections/notes.ts";
import { collectionBySlug, collectionRecord, tagsOf } from "../../../collections/read.ts";
import { reviewsOf } from "../../admin/reviews.ts";
import {
  answer,
  moment,
  num,
  READS,
  refuse,
  shape,
  str,
  type Tool,
  text,
  whole
} from "../../tool.ts";
import { ADMINS, hexes, PAGE, siteCollection } from "./common.ts";

/* Grabient's own collections as the admins read them: how much of each the admins liked and reviewed, and one in full. */

export const collectionTools: readonly Tool[] = [
  {
    name: "site_collections",
    title: "Grabient's collections",
    hints: READS,
    description:
      "The public collections Grabient made, with how many of each one's palettes an admin liked, how many have a review, and how many readers saved a copy (`saves`). `order` is updated (latest change first), title, or unreviewed (most palettes without a review first).",
    inputSchema: shape({
      query: text("Words in the title, description or tags.", { maxLength: 100 }),
      order: text("Default updated.", { enum: ["updated", "title", "unreviewed"] }),
      page: PAGE,
      limit: whole("How many a page, default 50.", 1, 100)
    }),
    async run(args, c) {
      const words = folded(str(args.query, 100));
      const page = num(args.page, 1, 1, 10000);
      const limit = num(args.limit, 50, 1, 100);
      const where = `m.owner_kind = 'agent'${words ? " AND instr(m.search_text, ?) > 0" : ""}`;
      const bind = words ? [words] : [];
      const order =
        args.order === "title"
          ? "m.title, m.id"
          : args.order === "unreviewed"
            ? "m.item_count - reviewed DESC, m.updated_at DESC, m.id"
            : "m.updated_at DESC, m.id";
      const [total, rows] = await Promise.all([
        first<{ n: number }>(
          c.env.DB,
          `SELECT COUNT(*) AS n FROM k_collections m WHERE ${where}`,
          ...bind
        ),
        all<{
          slug: string;
          title: string;
          description: string;
          tags: string;
          visibility: string;
          item_count: number;
          fork_count: number;
          updated_at: number;
          liked: number;
          reviewed: number;
        }>(
          c.env.DB,
          `SELECT m.slug, m.title, m.description, m.tags, m.visibility, m.item_count, m.fork_count, m.updated_at,
             (SELECT COUNT(*) FROM k_collection_items i WHERE i.collection_id = m.id
               AND EXISTS (SELECT 1 FROM k_likes l WHERE l.palette_id = i.seed AND l.user_id IN ${ADMINS})) AS liked,
             (SELECT COUNT(*) FROM k_collection_items i WHERE i.collection_id = m.id
               AND EXISTS (SELECT 1 FROM k_reviews r WHERE r.seed = i.seed AND r.subject IN ('', 'collection:' || m.slug))) AS reviewed
           FROM k_collections m WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
          ...bind,
          limit,
          (page - 1) * limit
        )
      ]);
      return answer({
        total: Number(total?.n ?? 0),
        page,
        collections: rows.map(row => ({
          slug: row.slug,
          title: row.title,
          description: row.description,
          tags: tagsOf(row.tags),
          ...(row.visibility === "public" ? {} : { visibility: row.visibility }),
          palettes: Number(row.item_count),
          liked: Number(row.liked),
          reviewed: Number(row.reviewed),
          ...(Number(row.fork_count) ? { saves: Number(row.fork_count) } : {}),
          updatedAt: moment(row.updated_at)
        }))
      });
    }
  },
  {
    name: "site_collection",
    title: "One of Grabient's collections",
    hints: READS,
    description:
      "A Grabient collection in full: its words, the admins' notes on it, and every palette in order with its likes, its title, whether an admin liked it (it fits and stays), whether it is locked, readers' fit votes and its reviews.",
    inputSchema: shape({ slug: text("The collection's address.") }, ["slug"]),
    async run(args, c) {
      const slug = str(args.slug, 120);
      const record = slug ? await collectionRecord(c.env, slug) : null;
      if (!siteCollection(record)) return refuse("No Grabient collection has this address.");
      const doc = await collectionBySlug(c.env, record.slug, true);
      if (!doc) return refuse("No Grabient collection has this address.");
      const seeds = doc.items.map(item => item.kseed);
      const [admins, locked, texts, reviews, notes, due, fits] = await Promise.all([
        seeds.length
          ? all<{ seed: string }>(
              c.env.DB,
              `SELECT DISTINCT palette_id AS seed FROM k_likes WHERE user_id IN ${ADMINS}
               AND palette_id IN (SELECT value FROM json_each(?))`,
              JSON.stringify(seeds)
            )
          : [],
        likedByPeople(c.env, seeds),
        paletteTexts(c.env, seeds),
        reviewsOf(c.env, seeds),
        listNotes(c.env, record.id),
        first<{ n: number }>(
          c.env.DB,
          "SELECT COUNT(*) AS n FROM k_queue WHERE status = 'due' AND kind = 'collection' AND json_extract(payload, '$.slug') = ?",
          record.slug
        ),
        itemFits(c.env, record.id)
      ]);
      const liked = new Set(admins.map(row => row.seed));
      const words = new Map(texts.map(t => [t.seed, t.title]));
      const subject = `collection:${record.slug}`;
      return answer({
        slug: doc.slug,
        url: `${c.origin}/${doc.slug}`,
        title: doc.title,
        description: doc.description,
        tags: doc.tags,
        visibility: doc.visibility,
        updatedAt: moment(doc.updatedAt),
        ...(notes.length
          ? { notes: notes.map(n => ({ text: n.text, at: moment(n.createdAt), by: n.author })) }
          : {}),
        ...(Number(due?.n) ? { scheduledAdditions: Number(due?.n) } : {}),
        items: doc.items.map((item, i) => {
          const about = (reviews.get(item.kseed) ?? []).filter(
            r => r.subject === "" || r.subject === subject
          );
          const fit = fits.get(item.kseed);
          return {
            n: i + 1,
            seed: item.kseed,
            hexes: hexes(item.kseed, item),
            style: item.style,
            steps: item.steps,
            angle: item.angle,
            likes: item.likes,
            added: moment(item.createdAt),
            ...(words.has(item.kseed) ? { title: words.get(item.kseed) } : {}),
            ...(liked.has(item.kseed) ? { liked: true } : {}),
            ...(locked.has(item.kseed) ? { locked: true } : {}),
            ...(fit && fit.up + fit.down ? { fit: { up: fit.up, down: fit.down } } : {}),
            ...(about.length
              ? {
                  reviews: about.map(r => ({
                    about: r.subject ? "fit" : "palette",
                    verdict: r.verdict,
                    ...(r.note ? { note: r.note } : {})
                  }))
                }
              : {})
          };
        })
      });
    }
  }
];
