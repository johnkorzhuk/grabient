import { SITE_AGENT } from "../../admin/personas.ts";
import { removedSeeds } from "../../admin/queue.ts";
import { parseWhy, recordAction, viewPatch } from "../../admin/record.ts";
import { logContribution } from "../../admin/reviews.ts";
import {
  agentCollectionsHolding,
  checkTexts,
  collectionItem,
  collectionRecord,
  deleteGalleryPalette,
  galleryPalette,
  likedByPeople,
  PALETTE_EMBED_MAX,
  PALETTE_TITLE_MAX,
  type PaletteTextInput,
  paletteStanding,
  paletteTextInput,
  REFUSED_TEXT,
  removeAgentCollectionPalette,
  replacePalette,
  setAgentCollectionPaletteView,
  setGalleryPaletteView,
  upsertPaletteTexts
} from "../../site.ts";
import { answer, entryOf, items, list, refuse, shape, str, type Tool, text } from "../../tool.ts";
import {
  CHANGES_SITE,
  carried,
  curation,
  LOCKED,
  SEED,
  siteCollection,
  through,
  VIEW,
  WHY,
  who
} from "./common.ts";

/* The palettes the site made, edited, redrawn, taken out or titled. A palette a person liked is never changed or
   deleted; each change goes on the admins' record with its reasons, and the log says through which app. */

export const curationTools: readonly Tool[] = [
  {
    name: "palette_replace",
    title: "Edit a palette",
    hints: CHANGES_SITE,
    description:
      "Put an edited palette in the place of one the site made: in the gallery and in every Grabient collection that holds it, with its date, its title and its scheduled likes. `to` is the edited palette's seed, as compose_palette or adjust_palette gives one. Refused for a locked palette. A person's own collections are never touched.",
    inputSchema: shape({ from: SEED, to: SEED, ...WHY }, ["from", "to"]),
    async run(args, c) {
      const item = collectionItem({ seed: args.from });
      const next = collectionItem({ seed: args.to });
      if (!item || !next)
        return refuse(
          "Send two palette seeds: the one to replace and the one to put in its place."
        );
      if (item.seed === next.seed) return refuse("Nothing has changed.");
      const [standing, liked, out] = await Promise.all([
        paletteStanding(c.env, item.seed),
        likedByPeople(c.env, [item.seed]),
        removedSeeds(c.env, [next.seed])
      ]);
      if (!standing.gallery && !standing.collections.length)
        return refuse("That palette is not in the gallery or in any Grabient collection.");
      if (liked.has(item.seed)) return refuse(LOCKED);
      if (out.has(next.seed))
        return refuse("An admin took the new palette out before. It stays out.");
      const stopped = await curation(c);
      if (stopped) return stopped;
      if (!(await replacePalette(c.env, item.seed, next.seed, c.grant.userId, standing)))
        return refuse("This account can no longer change the gallery.");
      const g = standing.gallery;
      const slugs = standing.collections.map(held => held.slug);
      // each collection's own row, so its history is whole, then the edit itself with the reasons
      for (const held of standing.collections) {
        await recordAction(c.env, {
          actorId: c.grant.userId,
          action: "edit",
          seed: item.seed,
          collection: held,
          before: {
            style: held.style,
            steps: held.steps,
            angle: held.angle,
            position: held.position
          },
          after: { seed: next.seed, ...through(c) }
        });
      }
      await recordAction(c.env, {
        actorId: c.grant.userId,
        action: "edit",
        seed: item.seed,
        why: parseWhy(args),
        after: { seed: next.seed, ...through(c) },
        before: {
          gallery: g
            ? {
                style: g.style,
                steps: g.steps,
                angle: g.angle,
                likes: g.likes,
                createdAt: g.createdAt
              }
            : null,
          collections: slugs
        }
      });
      await logContribution(c.env, who(c), "palette_replace", item.seed, {
        to: next.seed,
        gallery: Boolean(g),
        collections: slugs
      });
      return answer({
        from: item.seed,
        to: next.seed,
        url: `${c.origin}/${next.seed}`,
        gallery: Boolean(g),
        collections: slugs
      });
    }
  },
  {
    name: "palette_view",
    title: "Redraw a palette",
    hints: CHANGES_SITE,
    description:
      "Change how a palette the site made is drawn: its style, steps or angle, in the gallery, or in one Grabient collection when `collection` is given. Refused for a locked palette.",
    inputSchema: shape(
      {
        seed: SEED,
        collection: text("The collection whose drawing of it changes; left out, the gallery's."),
        ...VIEW,
        ...WHY
      },
      ["seed"]
    ),
    async run(args, c) {
      const item = collectionItem({ seed: args.seed });
      if (!item) return refuse("That is not a palette seed.");
      const slug = str(args.collection, 120);
      const record = slug ? await collectionRecord(c.env, slug) : null;
      if (slug && !siteCollection(record))
        return refuse("No Grabient collection has this address.");
      const current = record
        ? record.input.items.find(held => held.seed === item.seed)
        : await galleryPalette(c.env, item.seed);
      if (!current)
        return refuse(
          record ? "That palette is not in this collection." : "That palette is not in the gallery."
        );
      if ((await likedByPeople(c.env, [item.seed])).has(item.seed)) return refuse(LOCKED);
      const patch = viewPatch(args, current);
      const valid = patch && collectionItem({ ...patch.view, seed: item.seed });
      if (!patch || !valid) return refuse("Send the style, steps or angle to change, each valid.");
      if (!patch.changed) {
        return answer({
          seed: item.seed,
          style: valid.style,
          steps: valid.steps,
          angle: valid.angle,
          changed: false
        });
      }
      const stopped = await curation(c);
      if (stopped) return stopped;
      const done = record
        ? await setAgentCollectionPaletteView(c.env, record.id, item.seed, valid, c.grant.userId)
        : await setGalleryPaletteView(c.env, item.seed, valid, c.grant.userId);
      if (!done) return refuse("This account can no longer change it.");
      await recordAction(c.env, {
        actorId: c.grant.userId,
        action: "view",
        seed: item.seed,
        why: parseWhy(args),
        ...(record
          ? { collection: { id: record.id, slug: record.slug, title: record.input.title } }
          : {}),
        before: { style: current.style, steps: current.steps, angle: current.angle },
        after: { style: valid.style, steps: valid.steps, angle: valid.angle, ...through(c) }
      });
      const view = { style: valid.style, steps: valid.steps, angle: valid.angle };
      await logContribution(c.env, who(c), "palette_view", item.seed, {
        ...(record ? { collection: record.slug } : {}),
        ...view
      });
      return answer({
        seed: item.seed,
        ...(record ? { collection: record.slug } : {}),
        ...view,
        changed: true
      });
    }
  },
  {
    name: "palette_remove",
    title: "Delete a palette",
    hints: CHANGES_SITE,
    description:
      "Delete a palette the site made from the gallery, and from every Grabient collection that holds it unless `scope` is gallery. It never comes back. Refused for a locked palette. The reasons given teach what to leave out.",
    inputSchema: shape(
      {
        seed: SEED,
        scope: text("Default everywhere.", { enum: ["everywhere", "gallery"] }),
        ...WHY
      },
      ["seed"]
    ),
    async run(args, c) {
      const item = collectionItem({ seed: args.seed });
      if (!item) return refuse("That is not a palette seed.");
      if ((await likedByPeople(c.env, [item.seed])).has(item.seed)) return refuse(LOCKED);
      const scope = args.scope === "gallery" ? "gallery" : "everywhere";
      const [gallery, holding] = await Promise.all([
        galleryPalette(c.env, item.seed),
        scope === "everywhere" ? agentCollectionsHolding(c.env, item.seed) : []
      ]);
      if (!gallery && !holding.length) {
        return refuse(
          scope === "gallery"
            ? "That palette is not in the gallery."
            : "That palette is not in the gallery or in any Grabient collection."
        );
      }
      const stopped = await curation(c);
      if (stopped) return stopped;
      if (gallery && !(await deleteGalleryPalette(c.env, item.seed, c.grant.userId)))
        return refuse("This account can no longer change the gallery.");
      // each membership on the record as its own removal, so a collection's history is whole; the reasons ride on the deletion
      const collections: string[] = [];
      for (const held of holding) {
        if (!(await removeAgentCollectionPalette(c.env, held.id, item.seed, c.grant.userId)))
          continue;
        collections.push(held.slug);
        await recordAction(c.env, {
          actorId: c.grant.userId,
          action: "remove",
          seed: item.seed,
          collection: held,
          before: {
            style: held.style,
            steps: held.steps,
            angle: held.angle,
            position: held.position
          },
          after: { via: "delete" }
        });
      }
      await recordAction(c.env, {
        actorId: c.grant.userId,
        action: "delete",
        seed: item.seed,
        why: parseWhy(args),
        after: through(c),
        before: {
          gallery: gallery
            ? {
                style: gallery.style,
                steps: gallery.steps,
                angle: gallery.angle,
                likes: gallery.likes,
                createdAt: gallery.createdAt
              }
            : null,
          scope,
          collections
        }
      });
      await logContribution(c.env, who(c), "palette_remove", item.seed, {
        gallery: Boolean(gallery),
        collections
      });
      return answer({ deleted: item.seed, gallery: Boolean(gallery), collections });
    }
  },
  {
    name: "palette_titles",
    title: "Title palettes",
    hints: CHANGES_SITE,
    description:
      "Write or replace the titles of palettes. A title is the palette page's own and search reads its words. A description is optional and kept when left out.",
    inputSchema: shape(
      {
        titles: list(
          shape(
            {
              seed: SEED,
              title: text("", { maxLength: PALETTE_TITLE_MAX }),
              description: text("", { maxLength: PALETTE_EMBED_MAX })
            },
            ["seed", "title"]
          ),
          "The titles.",
          1,
          100
        )
      },
      ["titles"]
    ),
    async run(args, c) {
      const texts: PaletteTextInput[] = [];
      for (const [i, raw] of items(args.titles, 100).entries()) {
        const entry = entryOf(raw);
        const words = paletteTextInput({
          seed: entry?.seed,
          title: entry?.title,
          embed: entry?.description
        });
        if (!words) {
          return refuse(
            `Entry ${i + 1}: a seed, a title of 1 to ${PALETTE_TITLE_MAX} characters, and a description up to ${PALETTE_EMBED_MAX}.`
          );
        }
        texts.push(words);
      }
      if (!texts.length) return refuse("Send at least one title.");
      const { held, refused } = checkTexts(texts);
      if (!held.length) {
        return refuse(
          `${REFUSED_TEXT} ${refused
            .slice(0, 10)
            .map(r => `${r.seed}: ${r.words.join(", ")}`)
            .join("; ")}`
        );
      }
      const stopped = await carried(c, held.length);
      if (stopped) return stopped;
      await upsertPaletteTexts(c.env, SITE_AGENT, held);
      await logContribution(c.env, who(c), "palette_titles", held[0]!.seed, {
        titles: held.length
      });
      return answer({
        written: held.length,
        ...(refused.length ? { untitled: refused, untitledWhy: REFUSED_TEXT } : {})
      });
    }
  }
];
