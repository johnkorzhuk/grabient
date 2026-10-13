import { all } from "../../../db/d1.ts";
import { SITE_AGENT } from "../../admin/personas.ts";
import { removedSeeds } from "../../admin/queue.ts";
import { parseWhy, recordAction } from "../../admin/record.ts";
import { logContribution } from "../../admin/reviews.ts";
import {
  appendCollectionItems,
  collectionRecord,
  createCollection,
  isCollectionSlug,
  MAX_COLLECTION_ITEMS,
  publishPalettes,
  removeAgentCollectionPalette,
  SlugTaken,
  slugify,
  updateCollection,
  upsertPaletteTexts,
  validateCollection
} from "../../site.ts";
import { answer, flag, list, refuse, shape, str, type Tool, text } from "../../tool.ts";
import {
  ADMINS,
  CHANGES_SITE,
  carried,
  curation,
  SEED,
  seedList,
  siteCollection,
  TITLED,
  through,
  titled,
  untitledOf,
  WHY,
  who
} from "./common.ts";

/* Palettes and collections published as Grabient at once, and palettes taken out of one of its collections. */

export const publishTools: readonly Tool[] = [
  {
    name: "gallery_publish",
    title: "Publish palettes now",
    // a title sent replaces the one a palette had
    hints: CHANGES_SITE,
    description:
      "Add palettes to the public gallery at once, each in the view given and with a title when one is sent. A palette already there is left as it is, and one an admin took out stays out. Palettes that arrive over time go through schedule instead.",
    inputSchema: shape({ palettes: list(TITLED, "The palettes.", 1, 100) }, ["palettes"]),
    async run(args, c) {
      const sent = titled(args.palettes, 100);
      if (typeof sent === "string") return refuse(sent);
      const out = await removedSeeds(
        c.env,
        sent.palettes.map(p => p.seed)
      );
      const palettes = sent.palettes.filter(p => !out.has(p.seed));
      if (!palettes.length)
        return refuse("Nothing to publish: every palette here was taken out by an admin before.");
      const stopped = await carried(c, palettes.length);
      if (stopped) return stopped;
      await publishPalettes(c.env, palettes);
      const texts = sent.texts.filter(t => !out.has(t.seed));
      await upsertPaletteTexts(c.env, SITE_AGENT, texts);
      await logContribution(c.env, who(c), "gallery_publish", palettes[0]!.seed, {
        palettes: palettes.length,
        titles: texts.length
      });
      return answer({
        published: palettes.map(p => p.seed),
        ...(out.size ? { leftOut: [...out] } : {}),
        ...untitledOf(sent.untitled.filter(u => !out.has(u.seed)))
      });
    }
  },
  {
    name: "collection_publish",
    title: "Publish a collection now",
    // it replaces the words it is given, and without a slug every call makes another collection
    hints: { ...CHANGES_SITE, idempotent: false },
    description: `Make a public Grabient collection at once, or add to one. Without a slug, or with one no collection has, it makes a collection from a title and 1 to ${MAX_COLLECTION_ITEMS} palettes. With the slug of a Grabient collection it adds the palettes it lacks at the end and replaces any of title, description and tags that are given; nothing it holds moves or leaves. \`gallery\` also lists the palettes in the public gallery. A palette an admin took out stays out.`,
    inputSchema: shape({
      slug: text("The collection to add to, or the address wanted for a new one."),
      title: text("1 to 80 characters.", { maxLength: 80 }),
      description: text("Up to 500 characters.", { maxLength: 500 }),
      tags: list(text("2 to 32 letters, digits, spaces or hyphens."), "Up to 12 tags.", 0, 12),
      palettes: list(TITLED, "The palettes to hold or add.", 1, MAX_COLLECTION_ITEMS),
      gallery: flag("Also add the palettes to the public gallery.")
    }),
    async run(args, c) {
      const sent =
        args.palettes === undefined
          ? { palettes: [], texts: [], untitled: [] }
          : titled(args.palettes, MAX_COLLECTION_ITEMS);
      if (typeof sent === "string") return refuse(sent);
      const slug = str(args.slug, 120);
      if (slug && !isCollectionSlug(slug)) {
        return refuse(
          "That address cannot be a collection's: use lowercase letters, digits and hyphens, and no word the site reserves."
        );
      }
      const record = slug ? await collectionRecord(c.env, slug) : null;
      if (record && !siteCollection(record))
        return refuse("That address belongs to another collection.");
      const out = await removedSeeds(
        c.env,
        sent.palettes.map(p => p.seed)
      );
      const palettes = sent.palettes.filter(p => !out.has(p.seed));
      const fields: Record<string, unknown> = {};
      for (const key of ["title", "description", "tags"] as const)
        if (args[key] !== undefined) fields[key] = args[key];
      let at: string;
      let status: "created" | "updated";
      let added: number;
      if (record) {
        const valid = Object.keys(fields).length ? validateCollection(fields, record.input) : null;
        if (valid && !valid.ok) return refuse(valid.error);
        const stopped = await carried(c, palettes.length + 1);
        if (stopped) return stopped;
        if (valid?.ok) await updateCollection(c.env, record.id, valid.input);
        ({ added } = await appendCollectionItems(c.env, record.id, palettes));
        at = record.slug;
        status = "updated";
      } else {
        const valid = validateCollection({ ...fields, visibility: "public", items: palettes });
        if (!valid.ok) {
          return refuse(
            palettes.length || !sent.palettes.length
              ? valid.error
              : "Nothing to hold: every palette here was taken out by an admin before."
          );
        }
        const stopped = await carried(c, palettes.length + 1);
        if (stopped) return stopped;
        /* the address asked for, else the title's own; a title whose address is taken or reserved takes the title
           with a short word after it */
        const owner = { kind: "agent" as const, id: SITE_AGENT };
        const own = slugify(valid.input.title);
        const wanted = slug || (isCollectionSlug(own) ? own : "");
        let made: { slug: string; itemCount: number };
        try {
          made = await createCollection(c.env, owner, valid.input, wanted ? { slug: wanted } : {});
        } catch (error) {
          if (!(error instanceof SlugTaken)) throw error;
          if (slug) return refuse("That address is taken. Send another slug.");
          made = await createCollection(c.env, owner, valid.input);
        }
        at = made.slug;
        status = "created";
        added = made.itemCount;
      }
      if (args.gallery === true) await publishPalettes(c.env, palettes);
      const texts = sent.texts.filter(t => !out.has(t.seed));
      await upsertPaletteTexts(c.env, SITE_AGENT, texts);
      await logContribution(c.env, who(c), "collection_publish", at, {
        status,
        added,
        titles: texts.length,
        gallery: args.gallery === true
      });
      return answer({
        slug: at,
        url: `${c.origin}/${at}`,
        status,
        added,
        ...(out.size ? { leftOut: [...out] } : {}),
        ...untitledOf(sent.untitled)
      });
    }
  },
  {
    name: "collection_remove_palettes",
    title: "Take palettes out of a collection",
    hints: CHANGES_SITE,
    description:
      "Take palettes out of one Grabient collection. They stay in the gallery and everywhere else, and never return to this collection. A palette an admin liked stays in: an admin's like says it fits. The reasons given go on the record.",
    inputSchema: shape(
      {
        slug: text("The collection's address."),
        seeds: list(SEED, "The palettes to take out.", 1, MAX_COLLECTION_ITEMS),
        ...WHY
      },
      ["slug", "seeds"]
    ),
    async run(args, c) {
      const slug = str(args.slug, 120);
      const record = slug ? await collectionRecord(c.env, slug) : null;
      if (!siteCollection(record)) return refuse("No Grabient collection has this address.");
      const seeds = seedList(args.seeds, MAX_COLLECTION_ITEMS);
      if (!seeds.length) return refuse("None of these is a palette seed.");
      const liked = new Set(
        (
          await all<{ seed: string }>(
            c.env.DB,
            `SELECT DISTINCT palette_id AS seed FROM k_likes WHERE user_id IN ${ADMINS}
             AND palette_id IN (SELECT value FROM json_each(?))`,
            JSON.stringify(seeds)
          )
        ).map(row => row.seed)
      );
      const stopped = await curation(c);
      if (stopped) return stopped;
      const why = parseWhy(args);
      const about = { id: record.id, slug: record.slug, title: record.input.title };
      const removed: string[] = [];
      const kept: string[] = [];
      const absent: string[] = [];
      for (const seed of seeds) {
        const position = record.input.items.findIndex(held => held.seed === seed);
        const current = record.input.items[position];
        if (!current) absent.push(seed);
        else if (liked.has(seed)) kept.push(seed);
        else {
          if (!(await removeAgentCollectionPalette(c.env, record.id, seed, c.grant.userId)))
            return refuse("This account can no longer change this collection.");
          await recordAction(c.env, {
            actorId: c.grant.userId,
            action: "remove",
            seed,
            collection: about,
            before: { style: current.style, steps: current.steps, angle: current.angle, position },
            after: through(c),
            why
          });
          removed.push(seed);
        }
      }
      if (removed.length)
        await logContribution(c.env, who(c), "collection_remove_palettes", record.slug, {
          removed: removed.length
        });
      return answer({
        slug: record.slug,
        removed,
        ...(kept.length ? { keptBecauseAnAdminLikedThem: kept } : {}),
        ...(absent.length ? { notInTheCollection: absent } : {})
      });
    }
  }
];
