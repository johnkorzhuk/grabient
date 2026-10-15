import { msg } from "@grabient/i18n";
import { json } from "@grabient/server/auth/http.ts";
import { replica } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import {
  isCollectionSlug,
  isPrivateSlug,
  slugifyTitle
} from "../../features/collections/address.ts";
import { collectionParams } from "../../features/collections/params.ts";
import { validateCollection } from "../../features/collections/schema.ts";
import { NO_STORE } from "../../lib/cache.ts";
import { askedLocale, localizeCollections } from "../mcp/admin/translations.ts";
import { tagColors } from "../search/tags.ts";
import { publicOrigin } from "../seo/site.ts";
import { copyStanding, forkCollection, heldCopy } from "./copies.ts";
import {
  addressed,
  bodyOf,
  collectionsFull,
  FRESH_JSON,
  isAdmin,
  methodNotAllowed,
  notFound,
  PUBLIC_JSON,
  publicJson,
  refused,
  said,
  withUrl,
  writer
} from "./http.ts";
import { collectionBySlug, collectionRecord, ownedBy } from "./read.ts";
import { parseWhy, recordAction } from "./record.ts";
import { publicCollections, suggestCollections } from "./search.ts";
import {
  addressAfter,
  createCollection,
  deleteCollection,
  isUniqueError,
  ownCollectionsFull,
  ownerHandle,
  SlugTaken,
  updateCollection
} from "./write.ts";

/* The public collections routes and the writes beside them:
     GET    /api/collections                 a page of the public list, or of a search (12 to 24 a page)
     POST   /api/collections                 a new collection of the account's (private, unless an admin's)
     GET    /api/collections/suggest         the tags under the search: titles that answer ?q=, or the popular ones
     GET    /api/collections/{slug}          one public collection
     PATCH  /api/collections/{slug}          its owner changes its words, its palettes or (an admin) who sees it
     DELETE /api/collections/{slug}          its owner deletes it, or an admin one of Grabient's
     POST   /api/collections/{slug}/copies   save it: the account's private copy, made once
   An account's `@handle/slug` arrives encoded as one segment. */

/** GET /api/collections: kept at the edge, by its words, order, frame, page and size (cache-keys.ts), so each read here
    is a miss, which an address may make sixty of a minute across every list and search (pipeline.ts). */
export async function listAnswer(
  request: Request,
  env: Env,
  ctx?: { waitUntil(work: Promise<unknown>): void }
): Promise<Response> {
  const url = new URL(request.url);
  const params = collectionParams(url.searchParams);
  const page = await publicCollections(env, params, {
    model: url.searchParams.get("model") === "1",
    request,
    ctx
  });
  const origin = publicOrigin(env, request);
  const items = await localizeCollections(env, askedLocale(url), page.items);
  return Response.json(
    { ...page, items: items.map(item => withUrl(origin, item)) },
    {
      headers: page.unkept
        ? NO_STORE
        : page.sort === "newest" || page.sort === "rising"
          ? FRESH_JSON
          : PUBLIC_JSON
    }
  );
}

/** POST /api/collections. Only an admin's collection may be public; an account's is private, at its title's address
    under its owner whatever the client sends. A browser that made it offline sends the private address it showed it at,
    which is kept when it is this title's under this account and free; the same address sent again by its owner is the
    same collection, made once. */
export async function createAnswer(request: Request, env: Env): Promise<Response> {
  const owner = await writer(env, request);
  if (owner instanceof Response) return owner;
  const body = await bodyOf(request);
  if (!body) return json({ error: msg("Invalid request.") }, 400);
  const valid = validateCollection(body);
  if (!valid.ok) return refused(valid, 400);
  if (await ownCollectionsFull(env, owner.id)) return collectionsFull();
  const admin = await isAdmin(env, owner.id);
  const input = admin ? valid.input : { ...valid.input, visibility: "private" as const };
  const origin = publicOrigin(env, request);
  if (input.visibility === "public") {
    const own = slugifyTitle(input.title);
    const free = isCollectionSlug(own) && !(await collectionRecord(env, own));
    const made = await createCollection(env, owner, input, free ? { slug: own } : {}).catch(
      error => {
        if (error instanceof SlugTaken) return createCollection(env, owner, input);
        throw error;
      }
    );
    return json({ collection: withUrl(origin, made) }, 201);
  }
  const proposed =
    typeof body.slug === "string" &&
    isPrivateSlug(body.slug, input.title, await ownerHandle(env, owner.id))
      ? body.slug
      : undefined;
  try {
    return json(
      {
        collection: withUrl(origin, await createCollection(env, owner, input, { slug: proposed }))
      },
      201
    );
  } catch (error) {
    if (!proposed || !(error instanceof SlugTaken)) throw error;
  }
  const held = await collectionRecord(env, proposed);
  if (held && ownedBy(held, owner)) {
    const doc = await collectionBySlug(env, proposed, true);
    if (doc) return json({ collection: withUrl(origin, doc) });
  }
  return json({ collection: withUrl(origin, await createCollection(env, owner, input)) }, 201);
}

/** Everything under /api/collections/. */
export async function collectionAnswer(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/collections/suggest") {
    if (request.method !== "GET") return methodNotAllowed();
    const hits = await suggestCollections(
      env,
      url.searchParams.get("q") ?? "",
      Number(url.searchParams.get("limit") ?? 12)
    );
    const items = await localizeCollections(env, askedLocale(url), hits);
    return publicJson({ items });
  }
  const at = addressed(url.pathname, "/api/collections/");
  if (!at || at.rest.length > 1 || (at.rest.length === 1 && at.rest[0] !== "copies"))
    return notFound();
  if (at.rest[0] === "copies") {
    if (request.method !== "POST") return methodNotAllowed();
    return saveAnswer(request, env, at.slug);
  }
  if (request.method === "GET") {
    const found = await collectionBySlug({ DB: replica(env) }, at.slug);
    if (!found) return json({ error: "Not found" }, 404);
    // the colors are read from the tags as written, which a translation keeps in their order
    const [[doc], colors] = await Promise.all([
      localizeCollections(env, askedLocale(url), [found]),
      tagColors(env, found.tags)
    ]);
    return publicJson(withUrl(publicOrigin(env, request), { ...doc!, tagColors: colors }));
  }
  if (request.method === "PATCH") return changeAnswer(request, env, at.slug);
  if (request.method === "DELETE") return deleteAnswer(request, env, at.slug);
  return methodNotAllowed();
}

/** Save: a private copy of a public collection (or of the account's own), made once; saving again answers with the copy
    held. A private collection is nobody else's to read, so nobody else's to copy. */
async function saveAnswer(request: Request, env: Env, slug: string): Promise<Response> {
  const owner = await writer(env, request);
  if (owner instanceof Response) return owner;
  const record = await collectionRecord(env, slug);
  if (!record || (record.input.visibility !== "public" && !ownedBy(record, owner)))
    return notFound();
  if (!(await heldCopy(env, record.id, owner)) && (await ownCollectionsFull(env, owner.id)))
    return collectionsFull();
  const { collection, made } = await forkCollection(env, record, owner);
  return json(
    {
      collection: withUrl(publicOrigin(env, request), collection),
      made,
      copy: await copyStanding(env, record, owner)
    },
    made ? 201 : 200
  );
}

/** PATCH: the owner's change. Anyone may change everything of their own but who sees it, which is an admin's. A
    private collection lives at its title's address under its owner, so a new title moves it (to the address a browser
    that renamed it offline proposes, when that is free), and one made public or private moves too: `moved` says where. */
async function changeAnswer(request: Request, env: Env, slug: string): Promise<Response> {
  const owner = await writer(env, request);
  if (owner instanceof Response) return owner;
  const record = await collectionRecord(env, slug);
  if (!record || !ownedBy(record, owner)) return notFound();
  const body = await bodyOf(request);
  if (!body) return json({ error: msg("Invalid request.") }, 400);
  const valid = validateCollection(body, record.input);
  if (!valid.ok) return refused(valid, 400);
  const turned = valid.input.visibility !== record.input.visibility;
  if (turned && !(await isAdmin(env, owner.id)))
    return said(msg("Only admins can change who sees a collection."), 403);
  const proposed = typeof body.slug === "string" ? body.slug : undefined;
  let to = await addressAfter(env, record, valid.input, proposed);
  try {
    await updateCollection(env, record.id, valid.input, { owner, ...(to ? { slug: to } : {}) });
  } catch (error) {
    /* another write took the address in between: the next free one */
    if (!to || !isUniqueError(error)) throw error;
    to = await addressAfter(env, record, valid.input);
    await updateCollection(env, record.id, valid.input, { owner, ...(to ? { slug: to } : {}) });
  }
  const now = to ?? slug;
  if (turned)
    await recordAction(env, {
      actorId: owner.id,
      action: "collection.visibility",
      collection: { id: record.id, slug: now, title: valid.input.title },
      before: { visibility: record.input.visibility, slug },
      after: { visibility: valid.input.visibility, slug: now }
    });
  const doc = await collectionBySlug(env, now, true);
  if (!doc) return notFound();
  return json({
    collection: withUrl(publicOrigin(env, request), doc),
    ...(to ? { moved: { from: slug, to } } : {})
  });
}

/** DELETE: the owner's own, or one of Grabient's by an admin, who puts the whole collection on the record since its
    rows are gone. */
async function deleteAnswer(request: Request, env: Env, slug: string): Promise<Response> {
  const owner = await writer(env, request);
  if (owner instanceof Response) return owner;
  const record = await collectionRecord(env, slug);
  if (!record) return notFound();
  const owned = ownedBy(record, owner);
  const curating = !owned && record.owner.kind === "agent" && (await isAdmin(env, owner.id));
  if (!owned && !curating) return notFound();
  if (!(await deleteCollection(env, record.id, owner.id)))
    return said(msg("You can't change this collection."), 403);
  if (curating)
    await recordAction(env, {
      actorId: owner.id,
      action: "collection.delete",
      collection: { id: record.id, slug, title: record.input.title },
      before: { agent: record.owner.id, ...record.input },
      why: parseWhy(await bodyOf(request))
    });
  return json({ deleted: slug });
}
