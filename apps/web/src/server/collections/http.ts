import { msg, type Params } from "@grabient/i18n";
import { json, overLimit, readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { accountRole } from "@grabient/server/auth/roles.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import type { Env } from "@grabient/server/env.ts";
import type { LimitCheck } from "@grabient/server/limits/check.ts";
import { workChecks, writeRefusal } from "@grabient/server/limits/writes.ts";
import { isCollectionSlug } from "../../features/collections/address.ts";
import { MAX_OWN_COLLECTIONS, type Refusal, refusal } from "../../features/collections/schema.ts";
import type { CollectionOwner } from "./read.ts";
import { collectionWriteLimits } from "./write.ts";

/* What the collections' routes share. A public read never reads a session and is kept at the edge; an account's read
   and every write carry the session, and a write comes from the site's own page (same origin), reads the session fresh
   (never its five-minute copy in a cookie, so a sign-out elsewhere counts at once) and is an account's write
   (limits/writes.ts): refused while an admin has saving off, then counted against the write budgets as the account's
   role counts them, all before anything is written. An error a page shows is a message (msg()) the page says in the reader's language: `error` is its
   English, and `i18n` its values where it has any. */

/** A public answer: a minute in the browser, five at the edge. */
export const PUBLIC_JSON = {
  "Cache-Control": "public, max-age=60",
  "CDN-Cache-Control": "max-age=300"
};
/** What changed lately (Rising, the newest): a minute at the edge, and the browser asks again each time. */
export const FRESH_JSON = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "CDN-Cache-Control": "max-age=60"
};
export const MAX_BODY = 64 * 1024;

export const publicJson = (body: unknown, headers: Record<string, string> = PUBLIC_JSON) =>
  Response.json(body, { headers });

/** A refusal as an answer: its English and its values for the page. */
export const refused = (no: Refusal, status: number) =>
  json({ error: no.error, ...(no.i18n ? { i18n: no.i18n } : {}) }, status);
export const said = (message: string, status: number, params?: Params) =>
  params ? refused(refusal(message, params), status) : json({ error: message }, status);

export const notFound = () => json({ error: msg("Not found") }, 404);
export const methodNotAllowed = () => json({ error: "Method not allowed" }, 405);
export const signIn = () => json({ error: msg("Sign in to continue.") }, 401);
export const invalid = () => json({ error: msg("Invalid request.") }, 403);
export const unavailable = () => json({ error: msg("Collections are unavailable.") }, 503);
export const collectionsFull = () =>
  said(msg("You can have up to {max} collections."), 409, { max: String(MAX_OWN_COLLECTIONS) });

/** The origin addresses are written at: the deploy's public one, else the request's. */
export const originOf = (env: Pick<Env, "PUBLIC_ORIGIN">, request: Request) =>
  env.PUBLIC_ORIGIN ?? new URL(request.url).origin;
/** An answer's collection with its address at that origin. */
export const withUrl = <T extends { slug: string }>(origin: string, doc: T) => ({
  ...doc,
  url: `${origin}/${doc.slug}`
});

/** The segments of a path after `prefix`, each decoded, with the collection's address first: a client sends an
    account's `@handle/slug` encoded as one segment, and one that sends it as two is read the same. Null when the path
    names no collection. */
export function addressed(path: string, prefix: string): { slug: string; rest: string[] } | null {
  if (!path.startsWith(prefix)) return null;
  let parts: string[];
  try {
    parts = path
      .slice(prefix.length)
      .split("/")
      .map(part => decodeURIComponent(part));
  } catch {
    return null;
  }
  const head = parts[0] ?? "";
  const [slug, rest] =
    head.startsWith("@") && !head.includes("/")
      ? [`${head}/${parts[1] ?? ""}`, parts.slice(2)]
      : [head, parts.slice(1)];
  return isCollectionSlug(slug) ? { slug, rest } : null;
}

export const isAdmin = async (env: Env, userId: string) =>
  (await accountRole(env, userId)) === "admin";

/** The account a read is for, or the 401 to answer with. */
export async function reader(env: Env, request: Request): Promise<CollectionOwner | Response> {
  const session = await getSession(env, request.headers);
  return session ? { kind: "user", id: session.user.id } : signIn();
}

/** The account a write is for, with its role, which its limits are counted by. */
export interface Writer extends CollectionOwner {
  role: string | null;
}

/** A cookie write: from the site's own page, by a session read fresh, while saving is on, within `limits` (the
    collection write budget when none are named). The account it is for, or the answer to give instead. */
export async function writer(
  env: Env,
  request: Request,
  limits?: (userId: string) => readonly LimitCheck[]
): Promise<Writer | Response> {
  if (!sameOrigin(request)) return invalid();
  const session = await getSession(env, request.headers, { fresh: true });
  if (!session) return signIn();
  const role = session.user.role ?? null;
  const refused = await writeRefusal(env, role, (limits ?? collectionWriteLimits)(session.user.id));
  return refused ?? { kind: "user", id: session.user.id, role };
}

/** A write's further budget, once the write knows which it is, counted as the account's role counts it. */
export const overWork = (env: Env, who: Writer, checks: readonly LimitCheck[]) =>
  overLimit(env, workChecks(env, who.role, checks));

/** A JSON object body of at most MAX_BODY bytes, or null. */
export const bodyOf = (request: Request) => readJson(request, MAX_BODY);
