import { isLocale, msg } from "@grabient/i18n";
import { json, overLimit, readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { getSession, type Session } from "@grabient/server/auth/session.ts";
import { first, run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { writeRefusal } from "@grabient/server/limits/writes.ts";
import * as v from "valibot";
import {
  type Profile,
  readOp,
  type SyncOp,
  type SyncResponse,
  type SyncResult
} from "../../features/account/wire.ts";
import { likeInput, likeLimits, setLike } from "../gallery/likes.ts";
import { publicOrigin } from "../seo/site.ts";
import { readChanges } from "./changes.ts";
import { applyCollectionOp, ownSlug, roleOf, type Writer } from "./collections.ts";
import { done, fromResponse, type Outcome, refused } from "./outcome.ts";

/* POST /api/me/sync: both halves of a browser's sync of the account's copy. The browser sends the changes it made
   since it last heard back, numbered in the order it made them; each is applied as a page's press would apply it,
   under the same rules and limits, for the account the session names (read fresh, so a sign-out elsewhere counts at
   once). Then the answer says what changed on the server since the browser's cursor, its own changes among it.

   A browser names itself with a client id under the account, and the server keeps the last change of that client it
   applied: a change sent again (an answer lost on the way, a tab closed before it heard) is skipped, never applied
   twice. A change the server cannot settle now (a limit, the database, saving paused for every account) stops the
   turn: the ones after it may depend on it, and the browser keeps them all and sends them again later. */

/** the most changes one sync sends; a browser with more sends them in turns */
export const SYNC_BATCH = 50;
/** fifty changes of a full collection each fit well inside it */
const BODY_MAX = 512 * 1024;
const DAY_MS = 86_400_000;

const Body = v.object({
  client: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{16,64}$/)),
  cursor: v.optional(v.nullable(v.pipe(v.number(), v.safeInteger(), v.minValue(0))), null),
  mutations: v.optional(v.pipe(v.array(v.unknown()), v.maxLength(SYNC_BATCH)), []),
  locale: v.optional(v.unknown()),
  account: v.optional(v.unknown())
});

/** The account as its menu and Settings show it, from the session the server read. */
export function profileOf(user: Session["user"]): Profile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image ?? null,
    username: user.username ?? null,
    createdAt: new Date(user.createdAt).getTime()
  };
}

/** A like as the heart's own write takes it. Saving paused for every account stands before it, then the account's
    minute and day and the site's day. */
async function applyLike(
  env: Env,
  account: Writer,
  op: Extract<SyncOp, { op: "like" }>
): Promise<Outcome> {
  const { op: _, from, ...like } = op;
  const input = likeInput({ ...like, ...(from ? { from: await pressedFrom(env, from) } : {}) });
  if (!input) return refused(400, msg("Invalid palette."));
  const over = await writeRefusal(env, roleOf(account), likeLimits(account.id));
  if (over) return fromResponse(over);
  const outcome = await setLike(env, { id: account.id, role: roleOf(account) }, input);
  return done({
    likesCount: outcome.likesCount,
    ...(outcome.was !== undefined ? { was: outcome.was } : {})
  });
}
/* where an admin pressed: a page names its collection by its address, or by its id where it has one */
async function pressedFrom(env: Env, from: NonNullable<Extract<SyncOp, { op: "like" }>["from"]>) {
  if (
    !from.collection ||
    from.collection.includes("/") ||
    !/^[a-z0-9]{20}$/.test(from.collection)
  ) {
    return from;
  }
  const row = await first<{ slug: string }>(
    env.DB,
    "SELECT slug FROM k_collections WHERE id = ?",
    from.collection
  );
  return { ...from, ...(row ? { collection: row.slug } : {}) };
}

/** A change's collection where it lives now: one named by its id is found by it among the account's own, and one
    named by an address a collection made in this sync took elsewhere goes there. Null when it is gone. */
async function addressed(
  env: Env,
  userId: string,
  op: SyncOp,
  madeAt: ReadonlyMap<string, string>
): Promise<SyncOp | null> {
  if (op.op === "like" || op.op === "collection.create") return op;
  let slug = madeAt.get(op.slug) ?? op.slug;
  if (op.id) {
    const found = await ownSlug(env, userId, op.id);
    if (!found) return null;
    slug = found;
  }
  return slug === op.slug ? op : { ...op, slug };
}

function apply(env: Env, account: Writer, op: SyncOp): Promise<Outcome> {
  return op.op === "like" ? applyLike(env, account, op) : applyCollectionOp(env, account, op);
}

/** What the answer keeps of a change's outcome: what the browser acts on. */
function resultOf(id: number, op: SyncOp, outcome: Outcome): SyncResult {
  const body = outcome.body;
  // a collection already gone is what its deletion asked for
  if (op.op === "collection.delete" && outcome.status === 404) return { id, ok: true };
  if (outcome.status >= 400) {
    return {
      id,
      ok: false,
      error: typeof body.error === "string" ? body.error : msg("Couldn't save."),
      ...(body.i18n && typeof body.i18n === "object"
        ? { i18n: body.i18n as SyncResult["i18n"] }
        : {})
    };
  }
  if (op.op === "like") {
    return {
      id,
      ok: true,
      likesCount: typeof body.likesCount === "number" ? body.likesCount : null,
      ...(body.was !== undefined ? { was: body.was as SyncResult["was"] } : {})
    };
  }
  if (typeof body.restore === "string") return { id, ok: true, restore: body.restore };
  if (op.op === "collection.create" && typeof body.slug === "string") {
    return { id, ok: true, slug: body.slug };
  }
  return { id, ok: true };
}
/** A change the server could not settle now: the account's limits, the limiter or the database away. */
const transient = (status: number) => status === 429 || status >= 500;

export async function handleSync(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: msg("Invalid request.") }, 403);
  const session = await getSession(env, request.headers, { fresh: true });
  if (!session) return json({ error: msg("Sign in to continue.") }, 401);
  const userId = session.user.id;
  // a sync reads what a page of Saved reads, and is counted with those reads
  const over = await overLimit(env, [[`saved:${userId}`, "savedRead"]]);
  if (over) return over;
  const read = v.safeParse(Body, await readJson(request, BODY_MAX));
  if (!read.success)
    return json({ error: "Send a client id, a cursor and at most 50 changes." }, 400);
  const body = read.output;
  // a copy belongs to the account that opened it: another account's session here is no session for it
  if (typeof body.account === "string" && body.account !== userId) {
    return json({ error: msg("Sign in to continue.") }, 401);
  }
  const mutations: { id: number; op: SyncOp | null }[] = [];
  for (const raw of body.mutations) {
    const id = Number((raw as { id?: unknown } | null)?.id);
    if (!Number.isSafeInteger(id) || id < 1 || id <= (mutations.at(-1)?.id ?? 0)) {
      return json({ error: "Changes are numbered upward from 1." }, 400);
    }
    mutations.push({ id, op: readOp((raw as { op?: unknown }).op) });
  }

  /* the account's role, its language and this client's row in one read; a client id met under another account (a
     copied browser profile) is refused, and the browser names itself again */
  const known = () =>
    first<{
      role: string;
      locale: string | null;
      owner: string | null;
      last: number | null;
      touched: number | null;
    }>(
      env.DB,
      `SELECT u.role, u.locale, c.account_id AS owner, c.last_mutation AS last, c.updated_at AS touched
       FROM auth_user u LEFT JOIN k_sync_clients c ON c.id = ? WHERE u.id = ?`,
      body.client,
      userId
    );
  let row = await known();
  if (!row) return json({ error: msg("Sign in to continue.") }, 401);
  const now = Date.now();
  if (row.owner === null) {
    await run(
      env.DB,
      "INSERT INTO k_sync_clients (id, account_id, last_mutation, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT (id) DO NOTHING",
      body.client,
      userId,
      now
    );
    row = await known();
  }
  if (!row || row.owner !== userId) {
    return json({ error: "This client id belongs to another account.", client: "taken" }, 409);
  }
  const account: Writer = { id: userId, admin: row.role === "admin" };
  /* The account's language, for the emails no page asks for: kept from the first sync that names one, never changed by
     a later one. A write that fails loses the language, never the sync, and the browser names it again. */
  let language = false;
  if (isLocale(body.locale)) {
    language = row.locale !== null;
    if (!language) {
      try {
        await run(
          env.DB,
          "UPDATE auth_user SET locale = ? WHERE id = ? AND locale IS NULL",
          body.locale,
          userId
        );
        language = true;
      } catch (error) {
        console.error(
          "sync: the account's language was not kept",
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  let last = Number(row.last ?? 0);
  let retryAfter: number | undefined;
  const results: SyncResult[] = [];
  /* a collection this sync made at another address than the browser gave it (a new username meanwhile): the changes
     after it in this sync that name the browser's address go there */
  const madeAt = new Map<string, string>();
  for (const { id, op } of mutations) {
    if (id <= last) continue;
    if (!op) results.push({ id, ok: false, error: "This change cannot be read." });
    else {
      let outcome: Outcome;
      try {
        const at = await addressed(env, userId, op, madeAt);
        outcome = at
          ? await apply(env, account, at)
          : refused(404, msg("That collection isn't yours anymore."));
      } catch (error) {
        console.error(
          "sync: a change failed",
          op.op,
          error instanceof Error ? error.message : error
        );
        outcome = { status: 500, body: {} };
      }
      if (transient(outcome.status)) {
        retryAfter = outcome.retryAfter ?? (outcome.status === 429 ? 60 : 5);
        break;
      }
      const result = resultOf(id, op, outcome);
      if (op.op === "collection.create" && result.slug && result.slug !== op.slug) {
        madeAt.set(op.slug, result.slug);
      }
      results.push(result);
    }
    last = id;
    await run(
      env.DB,
      "UPDATE k_sync_clients SET last_mutation = ?, updated_at = ? WHERE id = ? AND last_mutation < ?",
      id,
      Date.now(),
      body.client,
      id
    );
  }
  // a client that only reads is marked seen at most once a day, so the upkeep keeps it
  if (!mutations.length && now - Number(row.touched ?? 0) > DAY_MS) {
    await run(env.DB, "UPDATE k_sync_clients SET updated_at = ? WHERE id = ?", now, body.client);
  }

  const changes = await readChanges(env, userId, body.cursor, publicOrigin(env, request));
  return json({
    ...changes,
    lastMutation: last,
    results,
    admin: account.admin,
    ...(language ? { language } : {}),
    ...(retryAfter ? { retryAfter } : {}),
    account: profileOf(session.user)
  } satisfies SyncResponse);
}
