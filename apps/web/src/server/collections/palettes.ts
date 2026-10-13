import { msg } from "@grabient/i18n";
import { json } from "@grabient/server/auth/http.ts";
import type { Env } from "@grabient/server/env.ts";
import { collectionItem } from "../../features/collections/schema.ts";
import { likedByPeople, removeMembership } from "./curation.ts";
import {
  deleteGalleryPalette,
  galleryPalette,
  paletteStanding,
  replacePalette,
  setGalleryPaletteView
} from "./gallery.ts";
import { bodyOf, isAdmin, methodNotAllowed, reader, said, writer } from "./http.ts";
import { parseWhy, recordAction } from "./record.ts";

/* An admin's routes over the gallery's palettes, all private and never kept:
     GET    /api/me/palettes?seeds=     of the palettes an admin's page shows, the ones another person liked
     GET    /api/me/palettes/{seed}     where a palette stands: the gallery's row and Grabient's collections holding it
     PUT    /api/me/palettes/{seed}     { seed }: an edit saved over it wherever it stands
     PATCH  /api/me/palettes/{seed}     { style?, steps?, angle? }: the gallery draws it another way
     DELETE /api/me/palettes/{seed}     { scope: everywhere | gallery }: out of the gallery, and out of Grabient's
                                        collections unless the scope says the gallery alone
   A palette any person liked (an account that is no persona, the admin's own included, or grabient.com's readers)
   stays as they saved it: 409. Every change goes on the admins' record with the admin's reasons. */

const SEEDS_MAX = 96;
const notAdmin = () => said(msg("Only admins can change the gallery."), 403);
const liked = () => said(msg("Someone liked this palette, so it stays."), 409);
const cannot = () => said(msg("You can't change the gallery."), 403);

/** GET /api/me/palettes?seeds=: the admin's own likes the page already knows, so they are left out. */
export async function likedAnswer(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed();
  const who = await reader(env, request);
  if (who instanceof Response) return who;
  if (!(await isAdmin(env, who.id))) return notAdmin();
  const seeds = [
    ...new Set(
      (new URL(request.url).searchParams.get("seeds") ?? "")
        .split(",")
        .map(seed => seed.trim())
        .filter(Boolean)
    )
  ].slice(0, SEEDS_MAX);
  const found = await likedByPeople(env, seeds, who.id);
  return json({ liked: seeds.filter(seed => found.has(seed)) });
}

/** Everything under /api/me/palettes/. */
export async function paletteAnswer(request: Request, env: Env): Promise<Response> {
  const method = request.method;
  if (method !== "GET" && method !== "PUT" && method !== "PATCH" && method !== "DELETE")
    return methodNotAllowed();
  const who =
    method === "GET"
      ? await reader(env, request)
      : await writer(env, request, userId => [[`curation:${userId}`, "curation"]]);
  if (who instanceof Response) return who;
  if (!(await isAdmin(env, who.id))) return notAdmin();
  let raw: string;
  try {
    raw = decodeURIComponent(new URL(request.url).pathname.slice("/api/me/palettes/".length));
  } catch {
    return said(msg("Invalid palette."), 400);
  }
  const item = collectionItem({ seed: raw });
  if (!item) return said(msg("Invalid palette."), 400);
  const seed = item.seed;

  /* the editor asks when an admin opens a palette: where Save would put the edit, and whether another person liked it.
     The admin's own like blocks a change too; the editor follows that one from the account's likes */
  if (method === "GET") {
    const [standing, people] = await Promise.all([
      paletteStanding(env, seed),
      likedByPeople(env, [seed], who.id)
    ]);
    const g = standing.gallery;
    return json({
      seed,
      gallery: g ? { style: g.style, steps: g.steps, angle: g.angle, likes: g.likes } : null,
      collections: standing.collections.map(c => ({ slug: c.slug, title: c.title })),
      liked: people.has(seed)
    });
  }
  const body = await bodyOf(request);
  const why = parseWhy(body);
  const people = () => likedByPeople(env, [seed]).then(found => found.has(seed));

  if (method === "PUT") {
    const next = collectionItem({ seed: body?.seed });
    if (!next) return said(msg("Invalid palette."), 400);
    if (next.seed === seed) return said(msg("Nothing changed."), 400);
    const [standing, kept] = await Promise.all([paletteStanding(env, seed), people()]);
    if (!standing.gallery && !standing.collections.length)
      return said(msg("That palette isn't in the gallery or an agent collection."), 404);
    if (kept) return liked();
    if (!(await replacePalette(env, seed, next.seed, who.id, standing))) return cannot();
    /* each collection's own row, so its history is whole, then the edit with the admin's words */
    for (const c of standing.collections)
      await recordAction(env, {
        actorId: who.id,
        action: "edit",
        seed,
        collection: c,
        before: { style: c.style, steps: c.steps, angle: c.angle, position: c.position },
        after: { seed: next.seed }
      });
    const g = standing.gallery;
    const slugs = standing.collections.map(c => c.slug);
    await recordAction(env, {
      actorId: who.id,
      action: "edit",
      seed,
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
      },
      after: { seed: next.seed },
      why
    });
    return json({ palette: { from: seed, seed: next.seed, gallery: !!g, collections: slugs } });
  }

  const gallery = await galleryPalette(env, seed);
  if (method === "PATCH") {
    if (!gallery) return said(msg("That palette isn't in the gallery."), 404);
    if (await people()) return liked();
    const next = collectionItem({
      seed,
      style: body?.style ?? gallery.style,
      steps: body?.steps ?? gallery.steps,
      angle: body?.angle ?? gallery.angle
    });
    if (!next) return said(msg("Invalid style, steps or angle."), 400);
    const changed =
      next.style !== gallery.style || next.steps !== gallery.steps || next.angle !== gallery.angle;
    if (changed) {
      if (!(await setGalleryPaletteView(env, next, who.id))) return cannot();
      await recordAction(env, {
        actorId: who.id,
        action: "view",
        seed,
        before: { style: gallery.style, steps: gallery.steps, angle: gallery.angle },
        after: { style: next.style, steps: next.steps, angle: next.angle },
        why
      });
    }
    return json({
      palette: {
        seed,
        style: next.style,
        steps: next.steps,
        angle: next.angle,
        likes: gallery.likes
      }
    });
  }

  if (await people()) return liked();
  const scope = body?.scope === "gallery" ? "gallery" : "everywhere";
  const holding = scope === "everywhere" ? (await paletteStanding(env, seed)).collections : [];
  if (!gallery && !holding.length)
    return said(
      scope === "gallery"
        ? msg("That palette isn't in the gallery.")
        : msg("That palette isn't in the gallery or an agent collection."),
      404
    );
  const deleted = gallery ? await deleteGalleryPalette(env, seed, who.id) : false;
  if (gallery && !deleted) return cannot();
  /* each membership on the record as a removal of its own, so a collection's history is whole */
  const collections: string[] = [];
  for (const c of holding) {
    const { removed } = await removeMembership(env, "curator", c.id, seed, who.id);
    if (!removed) continue;
    collections.push(c.slug);
    await recordAction(env, {
      actorId: who.id,
      action: "remove",
      seed,
      collection: c,
      before: { style: c.style, steps: c.steps, angle: c.angle, position: c.position },
      after: { via: "delete" }
    });
  }
  await recordAction(env, {
    actorId: who.id,
    action: "delete",
    seed,
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
    },
    why
  });
  return json({ deleted: seed, gallery: deleted, collections });
}
