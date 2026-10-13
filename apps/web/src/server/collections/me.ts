import { msg } from "@grabient/i18n";
import { json, overLimit } from "@grabient/server/auth/http.ts";
import type { Env } from "@grabient/server/env.ts";
import * as v from "valibot";
import { isCollectionSlug, itemKey } from "../../features/collections/address.ts";
import { COLLECTION_LIMIT, ownParams } from "../../features/collections/params.ts";
import {
  CollectionItem,
  type CollectionItemInput,
  collectionItem,
  FitVoteInput,
  MAX_COLLECTION_ITEMS,
  NOTE_MAX,
  normalizeNote
} from "../../features/collections/schema.ts";
import type { ViewerState } from "../../features/collections/types.ts";
import { copyStanding, syncCopy } from "./copies.ts";
import {
  addSitePalettes,
  likedByPeople,
  removeMembership,
  restoreMembership,
  setSitePaletteView,
  unaddSitePalette
} from "./curation.ts";
import { castFitVote, ownFitVotes, ownFitVotesBySlug } from "./fit.ts";
import {
  addressed,
  bodyOf,
  isAdmin,
  methodNotAllowed,
  notFound,
  originOf,
  overWork,
  reader,
  refused,
  said,
  unavailable,
  withUrl,
  writer
} from "./http.ts";
import { addNote, deleteNote, listNotes } from "./notes.ts";
import {
  type CollectionOwner,
  type CollectionRecord,
  collectionBySlug,
  collectionRecord,
  ownedBy,
  siteCollectionChoices,
  siteCollectionsHolding
} from "./read.ts";
import { forgetRemoval, parseWhy, recordAction } from "./record.ts";
import { ownerCollections } from "./search.ts";
import { readRestoreToken, restoreToken } from "./tokens.ts";

/* An account's own routes, all private and never kept:
     GET    /api/me/collections                         the account's own, any visibility (12 to 96 a page)
     GET    /api/me/collections/{slug}                  one of its own, or one of Grabient's for an admin
     GET    /api/me/collections/{slug}/state            what the reader may do on its page, in one read
     POST   /api/me/collections/{slug}/update | reset   its saved copy takes its source's changes, or becomes it
     POST   /api/me/collections/{slug}/notes            an admin's note for the agents; DELETE …/notes/{id}
     POST   /api/me/collections/{slug}/votes            the reader's fit vote on one palette: up, down or null
     DELETE /api/me/collections/{slug}/items/{seed}     a palette out (the owner's, with a token its undo sends; an
                                                        admin's on one of Grabient's, on the record); ?style&steps&angle
                                                        names one view
     PUT    /api/me/collections/{slug}/items/{seed}     the undo: the palette back as it stood, from the token
     PATCH  /api/me/collections/{slug}/items/{seed}     an admin draws one of Grabient's palettes another way
     POST   /api/me/collections/{slug}/items            an admin's palettes into one of Grabient's, each with its undo's token
     GET    /api/me/collection-votes?slugs=             the reader's fit votes on a list's collections
     GET    /api/me/site-collections                    Grabient's collections, for an admin's checklist
     POST   /api/me/site-collections/holding            which of them hold the palettes at hand
   A palette any person liked is never drawn another way by an admin (409). */

/** GET /api/me/collections: an account's own list reads more at once than a public page (its checklist asks for all of
    them), within the account's reads of its own a minute. */
export async function mineAnswer(
  request: Request,
  env: Env,
  ctx?: { waitUntil(work: Promise<unknown>): void }
): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed();
  const owner = await reader(env, request);
  if (owner instanceof Response) return owner;
  const limited = await overLimit(env, [[`saved:${owner.id}`, "savedRead"]]);
  if (limited) return limited;
  const url = new URL(request.url);
  const page = await ownerCollections(env, owner, ownParams(url.searchParams), {
    model: url.searchParams.get("model") === "1",
    request,
    ctx
  });
  const origin = originOf(env, request);
  return json({ ...page, items: page.items.map(item => withUrl(origin, item)) });
}

/** Everything under /api/me/collections/. */
export async function mineAt(request: Request, env: Env): Promise<Response> {
  const at = addressed(new URL(request.url).pathname, "/api/me/collections/");
  if (!at) return notFound();
  const [part, more, extra] = at.rest;
  if (extra !== undefined) return notFound();
  if (part === undefined)
    return request.method === "GET" ? ownedAnswer(request, env, at.slug) : methodNotAllowed();
  if (part === "state" && more === undefined)
    return request.method === "GET" ? stateAnswer(request, env, at.slug) : methodNotAllowed();
  if ((part === "update" || part === "reset") && more === undefined)
    return request.method === "POST" ? syncAnswer(request, env, at.slug, part) : methodNotAllowed();
  if (part === "notes" && (more === undefined || /^[A-Za-z0-9_-]{1,40}$/.test(more)))
    return notesAnswer(request, env, at.slug, more);
  if (part === "votes" && more === undefined)
    return request.method === "POST" ? voteAnswer(request, env, at.slug) : methodNotAllowed();
  if (part === "items")
    return more === undefined
      ? addAnswer(request, env, at.slug)
      : itemAnswer(request, env, at.slug, more);
  return notFound();
}

/** Who a reader is to a collection: its owner, an admin on one of Grabient's, or neither. */
async function standing(env: Env, record: CollectionRecord, who: CollectionOwner) {
  const owned = ownedBy(record, who);
  const canCurate = !owned && record.owner.kind === "agent" && (await isAdmin(env, who.id));
  return { owned, canCurate, canDelete: owned || canCurate };
}

/** GET …/{slug}: one of the account's own whatever its visibility, or one of Grabient's for an admin. */
async function ownedAnswer(request: Request, env: Env, slug: string): Promise<Response> {
  const who = await reader(env, request);
  if (who instanceof Response) return who;
  const record = await collectionRecord(env, slug);
  const may = record ? await standing(env, record, who) : null;
  const doc = may && (may.owned || may.canCurate) ? await collectionBySlug(env, slug, true) : null;
  return doc && may ? json({ ...withUrl(originOf(env, request), doc), ...may }) : notFound();
}

/** GET …/{slug}/state: everything a signed-in reader's page needs of a collection beyond what everyone sees, in one
    read: whether it is theirs or theirs to curate (with the collection as they may see it), their saved copy's
    standing, their fit votes and an admin's notes. A private collection of someone else's is not found. */
async function stateAnswer(request: Request, env: Env, slug: string): Promise<Response> {
  const who = await reader(env, request);
  if (who instanceof Response) return who;
  const record = await collectionRecord(env, slug);
  if (!record) return notFound();
  const may = await standing(env, record, who);
  if (record.input.visibility !== "public" && !may.owned && !may.canCurate) return notFound();
  const admin = may.canCurate || (await isAdmin(env, who.id));
  const [copy, votes, notes, doc] = await Promise.all([
    copyStanding(env, record, who),
    ownFitVotes(env, record.id, who.id),
    admin ? listNotes(env, record.id) : undefined,
    may.owned || may.canCurate ? collectionBySlug(env, slug, true) : null
  ]);
  const state: ViewerState = { ...may, copy, votes, ...(notes ? { notes } : {}) };
  return json({ ...state, ...(doc ? { collection: withUrl(originOf(env, request), doc) } : {}) });
}

/** POST …/update and …/reset: the account's saved copy, from its source. */
async function syncAnswer(
  request: Request,
  env: Env,
  slug: string,
  mode: "update" | "reset"
): Promise<Response> {
  const owner = await writer(env, request);
  if (owner instanceof Response) return owner;
  const record = await collectionRecord(env, slug);
  if (!record || !ownedBy(record, owner)) return notFound();
  const result = await syncCopy(env, record, owner, mode);
  if (!result) return said(msg("The original collection is gone."), 404);
  if (!result.ok) return refused(result, 409);
  const doc = await collectionBySlug(env, record.slug, true);
  return doc
    ? json({ collection: withUrl(originOf(env, request), doc), copy: result.copy })
    : notFound();
}

/** …/notes and …/notes/{id}: an admin's alone, on any collection. */
async function notesAnswer(
  request: Request,
  env: Env,
  slug: string,
  id?: string
): Promise<Response> {
  if (request.method !== (id ? "DELETE" : "POST")) return methodNotAllowed();
  const admin = await writer(env, request);
  if (admin instanceof Response) return admin;
  if (!(await isAdmin(env, admin.id))) return said(msg("Only admins can add notes."), 403);
  const record = await collectionRecord(env, slug);
  if (!record) return notFound();
  if (id) return (await deleteNote(env, record.id, id)) ? json({ deleted: id }) : notFound();
  const text = normalizeNote((await bodyOf(request))?.text);
  if (!text) return said(msg("Notes are 1 to {max} characters."), 400, { max: String(NOTE_MAX) });
  const note = await addNote(env, record.id, admin.id, text);
  await recordAction(env, {
    actorId: admin.id,
    action: "note",
    collection: { id: record.id, slug: record.slug, title: record.input.title },
    after: { id: note.id, text }
  });
  return json({ note }, 201);
}

/** POST …/votes: on a public collection or the account's own. An admin's vote is a ruling, on the record with what it
    replaced. */
async function voteAnswer(request: Request, env: Env, slug: string): Promise<Response> {
  const who = await writer(env, request, userId => [
    [`fit:${userId}`, ["fitVote", "fitVoteDaily"]]
  ]);
  if (who instanceof Response) return who;
  const record = await collectionRecord(env, slug);
  if (!record || (record.input.visibility !== "public" && !ownedBy(record, who))) return notFound();
  const read = v.safeParse(FitVoteInput, await bodyOf(request));
  const item = read.success ? collectionItem({ seed: read.output.seed }) : null;
  if (!read.success || !item) return said(msg("Invalid vote."), 400);
  const vote = read.output.vote;
  const admin = await isAdmin(env, who.id);
  const was = admin ? ((await ownFitVotes(env, record.id, who.id))[item.seed] ?? null) : null;
  const fit = await castFitVote(env, record.id, item.seed, who.id, vote);
  if (!fit) return said(msg("That palette isn't in this collection."), 404);
  if (admin && was !== vote)
    await recordAction(env, {
      actorId: who.id,
      action: "vote",
      seed: item.seed,
      collection: { id: record.id, slug: record.slug, title: record.input.title },
      before: { vote: was },
      after: { vote }
    });
  return json({ seed: item.seed, vote, fit });
}

/** The collection as its changer now sees it. */
async function changed(request: Request, env: Env, record: CollectionRecord, extra: object) {
  const doc = await collectionBySlug(env, record.slug, true);
  if (!doc) return notFound();
  const owned = record.owner.kind === "user";
  return json({
    collection: {
      ...withUrl(originOf(env, request), doc),
      owned,
      canCurate: !owned,
      canDelete: true
    },
    ...extra
  });
}

/** …/items/{seed}: one palette of a collection. The owner takes it out of their own and puts it back with the
    removal's token; an admin curates one of Grabient's, on the record. */
async function itemAnswer(
  request: Request,
  env: Env,
  slug: string,
  rawSeed: string
): Promise<Response> {
  const method = request.method;
  if (method !== "DELETE" && method !== "PUT" && method !== "PATCH") return methodNotAllowed();
  /* a removal answers with the token its undo sends: with nothing to sign it, nothing is taken out */
  if (method !== "PATCH" && !env.BETTER_AUTH_SECRET) return unavailable();
  const who = await writer(env, request, () => []);
  if (who instanceof Response) return who;
  const item = collectionItem({ seed: rawSeed });
  if (!item) return said(msg("Invalid palette."), 400);
  const url = new URL(request.url);
  const asked = url.searchParams.has("style")
    ? collectionItem({
        seed: rawSeed,
        style: url.searchParams.get("style"),
        steps: Number(url.searchParams.get("steps")),
        angle: Number(url.searchParams.get("angle"))
      })
    : null;
  if (url.searchParams.has("style") && !asked)
    return said(msg("Invalid style, steps or angle."), 400);
  const view = asked ? { style: asked.style, steps: asked.steps, angle: asked.angle } : undefined;
  const record = await collectionRecord(env, slug);
  if (record && ownedBy(record, who)) {
    if (method === "PATCH") return methodNotAllowed();
    const limited = await overWork(env, who, [
      [`collection-items:${who.id}`, ["collectionItems", "collectionItemsDaily"]]
    ]);
    if (limited) return limited;
    if (method === "DELETE") {
      const { allowed, removed } = await removeMembership(
        env,
        "owner",
        record.id,
        item.seed,
        who.id,
        view
      );
      if (!allowed) return notFound();
      return changed(
        request,
        env,
        record,
        removed ? { restore: await restoreToken(env, who.id, record.id, removed) } : {}
      );
    }
    const row = await readRestoreToken(env, (await bodyOf(request))?.restore, who.id, record.id);
    if (!row || row.seed !== item.seed) return said(msg("This palette can't be put back."), 400);
    const put = await restoreMembership(env, "owner", record.id, row, who.id);
    if (!put.allowed) return notFound();
    if (put.full)
      return said(msg("Collections hold up to {max} palettes."), 409, {
        max: String(MAX_COLLECTION_ITEMS)
      });
    return changed(request, env, record, {});
  }
  /* a stranger's ask of a collection that is not there and of one that is gets the same answer: nothing is said of a
     private collection */
  if (!(await isAdmin(env, who.id)))
    return said(msg("Only admins can change agent collections."), 403);
  if (record?.owner.kind !== "agent") return notFound();
  const limited = await overWork(env, who, [[`curation:${who.id}`, "curation"]]);
  if (limited) return limited;
  const body = await bodyOf(request);
  const why = parseWhy(body);
  const position = record.input.items.findIndex(
    it =>
      it.seed === item.seed &&
      (!view || (it.style === view.style && it.steps === view.steps && it.angle === view.angle))
  );
  const current = record.input.items[position];
  const about = { id: record.id, slug: record.slug, title: record.input.title };
  if (method === "PUT") {
    /* the undo of the admin's removal: the palette back as it stood, and the removal off the record, which the agents
       would otherwise read as "keep it out" */
    const row = await readRestoreToken(env, body?.restore, who.id, record.id);
    if (!row || row.added || row.seed !== item.seed)
      return said(msg("This palette can't be put back."), 400);
    const put = await restoreMembership(env, "curator", record.id, row, who.id);
    if (!put.allowed) return said(msg("You can't change this collection."), 403);
    if (put.full)
      return said(msg("Collections hold up to {max} palettes."), 409, {
        max: String(MAX_COLLECTION_ITEMS)
      });
    if (row.record) await forgetRemoval(env, row.record, who.id, row.seed);
    return changed(request, env, record, {});
  }
  if (method === "DELETE" && body?.added !== undefined) {
    /* the undo of the admin's own add: the membership it made goes, and nothing goes on the record */
    const made = await readRestoreToken(env, body.added, who.id, record.id);
    if (!made?.added || made.seed !== item.seed)
      return said(msg("Couldn't remove the palette."), 400);
    if (!(await unaddSitePalette(env, record.id, made, who.id)))
      return said(msg("You can't change this collection."), 403);
    return changed(request, env, record, {});
  }
  if (method === "DELETE") {
    const { allowed, removed } = await removeMembership(
      env,
      "curator",
      record.id,
      item.seed,
      who.id,
      view
    );
    if (!allowed) return said(msg("You can't change this collection."), 403);
    if (!current || !removed) return changed(request, env, record, {});
    const action = await recordAction(env, {
      actorId: who.id,
      action: "remove",
      seed: item.seed,
      collection: about,
      before: { style: current.style, steps: current.steps, angle: current.angle, position },
      why
    });
    return changed(request, env, record, {
      restore: await restoreToken(env, who.id, record.id, { ...removed, record: action })
    });
  }
  /* PATCH: how one of Grabient's draws a palette, never one a person liked */
  if (!current) return said(msg("That palette isn't in this collection."), 404);
  if ((await likedByPeople(env, [item.seed])).has(item.seed))
    return said(msg("Someone liked this palette, so it stays."), 409);
  const next = collectionItem({
    seed: item.seed,
    style: body?.style ?? current.style,
    steps: body?.steps ?? current.steps,
    angle: body?.angle ?? current.angle
  });
  if (!next) return said(msg("Invalid style, steps or angle."), 400);
  if (itemKey(next) === itemKey(current)) return changed(request, env, record, {});
  if (record.input.items.some(it => itemKey(it) === itemKey(next)))
    return said(
      msg("This collection already has the palette with that style, steps and angle."),
      409
    );
  if (!(await setSitePaletteView(env, record.id, item.seed, next, who.id, current)))
    return said(msg("You can't change this collection."), 403);
  await recordAction(env, {
    actorId: who.id,
    action: "view",
    seed: item.seed,
    collection: about,
    before: { style: current.style, steps: current.steps, angle: current.angle },
    after: { style: next.style, steps: next.steps, angle: next.angle },
    why
  });
  return changed(request, env, record, {});
}

const Items = v.pipe(v.array(CollectionItem), v.minLength(1), v.maxLength(MAX_COLLECTION_ITEMS));
const itemsOf = (value: unknown): CollectionItemInput[] | null => {
  const read = v.safeParse(Items, value);
  return read.success ? read.output : null;
};

/** POST …/items: an admin's palettes into one of Grabient's by hand, each answered with the token its undo sends. */
async function addAnswer(request: Request, env: Env, slug: string): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  if (!env.BETTER_AUTH_SECRET) return unavailable();
  const admin = await writer(env, request, userId => [[`curation:${userId}`, "curation"]]);
  if (admin instanceof Response) return admin;
  if (!(await isAdmin(env, admin.id)))
    return said(msg("Only admins can change agent collections."), 403);
  const record = await collectionRecord(env, slug);
  if (record?.owner.kind !== "agent") return notFound();
  const items = itemsOf((await bodyOf(request))?.items);
  if (!items) return json({ error: "Send 1 to 100 palettes, each a seed in a view." }, 400);
  const { allowed, full, added } = await addSitePalettes(env, record.id, items, admin.id);
  if (full)
    return said(msg("Collections hold up to {max} palettes."), 409, {
      max: String(MAX_COLLECTION_ITEMS)
    });
  if (!allowed) return said(msg("You can't change this collection."), 403);
  const tokens = await Promise.all(
    added.map(row => restoreToken(env, admin.id, record.id, { ...row, added: true }))
  );
  return json({
    title: record.input.title,
    count: record.input.items.length + added.length,
    added: added.map((row, i) => ({
      seed: row.seed,
      style: row.style,
      steps: row.steps,
      angle: row.angle,
      token: tokens[i]
    }))
  });
}

/** GET /api/me/collection-votes?slugs=: the reader's votes on a list's page of collections, in one read. */
export async function votesBySlugAnswer(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed();
  const who = await reader(env, request);
  if (who instanceof Response) return who;
  const slugs = [...new Set((new URL(request.url).searchParams.get("slugs") ?? "").split(","))]
    .filter(isCollectionSlug)
    .slice(0, COLLECTION_LIMIT);
  return json({ votes: await ownFitVotesBySlug(env, slugs, who.id) });
}

/** /api/me/site-collections and …/holding: Grabient's collections in an admin's checklist. */
export async function siteAnswer(request: Request, env: Env): Promise<Response> {
  const holding = new URL(request.url).pathname.endsWith("/holding");
  if (request.method !== (holding ? "POST" : "GET")) return methodNotAllowed();
  const admin = holding ? await writer(env, request, () => []) : await reader(env, request);
  if (admin instanceof Response) return admin;
  if (!(await isAdmin(env, admin.id)))
    return said(msg("Only admins can change agent collections."), 403);
  if (!holding) return json({ collections: await siteCollectionChoices(env) });
  const items = itemsOf((await bodyOf(request))?.items);
  if (!items) return json({ error: "Send 1 to 100 palettes, each a seed in a view." }, 400);
  return json({ holding: await siteCollectionsHolding(env, items) });
}
