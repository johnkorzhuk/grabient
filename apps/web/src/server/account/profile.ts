import { msg } from "@grabient/i18n";
import { deleteAvatars } from "@grabient/server/auth/account-data.ts";
import { json, overLimit, readBytes, readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { authFor } from "@grabient/server/auth/library.ts";
import { getSession, type Session } from "@grabient/server/auth/session.ts";
import { first, run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { readUsername } from "../../features/account/username.ts";
import { accountHandle } from "../../features/collections/address.ts";
import { moveAccountAddresses } from "../collections/write.ts";

/* Settings' writes of the account's profile: its username, checked while typed and saved, and its picture. Each is a
   POST from the site's own page with the session read fresh. The errors a page shows are messages (msg()), which
   Settings says in the reader's language. */

/** Settings sends a 256 by 256 WebP of a few tens of kilobytes. */
const AVATAR_MAX = 256 * 1024;

/** The account a profile write is for, or the answer to give instead. */
async function writer(request: Request, env: Env): Promise<Session | Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: msg("Invalid request.") }, 403);
  return (
    (await getSession(env, request.headers, { fresh: true })) ??
    json({ error: msg("Sign in to continue.") }, 401)
  );
}

/* The library keeps a signed five-minute copy of the session in a cookie: after a profile write it is read again with
   that copy set aside, and the cookies it sets go with the answer, so the copy never shows the old name or picture. */
async function withFreshSession(request: Request, env: Env, body: unknown): Promise<Response> {
  const read = await authFor(env).api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
    asResponse: true
  });
  const headers = new Headers();
  for (const cookie of read.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  return json(body, 200, headers);
}

const takenBy = (env: Env, name: string, userId: string) =>
  first(
    env.DB,
    "SELECT 1 AS taken FROM auth_user WHERE LOWER(username) = LOWER(?) AND id != ?",
    name,
    userId
  );

/** POST /api/settings/username/check `{username}`: whether no other account holds the name, in any case. Asked
    while a name is typed, so counted per account. */
export async function checkUsername(request: Request, env: Env): Promise<Response> {
  const session = await writer(request, env);
  if (session instanceof Response) return session;
  const over = await overLimit(env, [[`username:${session.user.id}`, "usernameCheck"]]);
  if (over) return over;
  const read = readUsername((await readJson(request))?.username);
  if (read.problem !== null) return json({ error: read.problem }, 400);
  return json({ available: !(await takenBy(env, read.username, session.user.id)) });
}

/** POST /api/settings/username `{username}`: the account takes the name, unless another holds it in any case, which
    the write itself checks. The account's private collections move under the new handle. */
export async function saveUsername(request: Request, env: Env): Promise<Response> {
  const session = await writer(request, env);
  if (session instanceof Response) return session;
  const { id, username: was } = session.user;
  const over = await overLimit(env, [[`username:${id}`, "usernameWrite"]]);
  if (over) return over;
  const read = readUsername((await readJson(request))?.username);
  if (read.problem !== null) return json({ error: read.problem }, 400);
  const username = read.username;
  // the name it has, in the same case, writes nothing, and the signed session stays right
  if (username === was) return json({ success: true });
  const wrote = await run(
    env.DB,
    `UPDATE auth_user SET username = ?, updated_at = ? WHERE id = ?
     AND NOT EXISTS (SELECT 1 FROM auth_user WHERE LOWER(username) = LOWER(?) AND id != ?)`,
    username,
    Date.now(),
    id,
    username,
    id
  );
  if (!wrote.changes) return json({ error: msg("That username is taken.") }, 409);
  await moveAccountAddresses(
    env,
    id,
    accountHandle({ id, username: was }),
    accountHandle({ id, username })
  );
  return withFreshSession(request, env, { success: true });
}

const ascii = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

/** POST /api/settings/avatar, the picture's WebP bytes: kept in R2 at an address of its own, kept for good, and every
    earlier picture of the account deleted. Counted before the body is read. */
export async function uploadAvatar(request: Request, env: Env): Promise<Response> {
  const session = await writer(request, env);
  if (session instanceof Response) return session;
  const { id } = session.user;
  if (!env.UPLOADS || !env.R2_PUBLIC_URL) {
    return json({ error: msg("Couldn't upload the avatar.") }, 503);
  }
  const over = await overLimit(env, [
    [`avatar:${id}`, "avatarUpload"],
    ["avatar-day", "avatarUploadDaily"]
  ]);
  if (over) return over;
  const invalid = () => json({ error: msg("Invalid image.") }, 400);
  if (!request.headers.get("Content-Type")?.startsWith("image/webp")) return invalid();
  const bytes = await readBytes(request, AVATAR_MAX);
  if (!bytes || bytes.byteLength < 12 || ascii(bytes, 0) !== "RIFF" || ascii(bytes, 8) !== "WEBP") {
    return invalid();
  }
  const key = `avatars/${id}/${Date.now()}.webp`;
  await env.UPLOADS.put(key, bytes, {
    httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" }
  });
  const imageUrl = `${env.R2_PUBLIC_URL}/${key}`;
  try {
    await run(
      env.DB,
      "UPDATE auth_user SET image = ?, updated_at = ? WHERE id = ?",
      imageUrl,
      Date.now(),
      id
    );
  } catch (error) {
    await env.UPLOADS.delete(key);
    throw error;
  }
  // every earlier picture goes, so two uploads at once leave none behind; the next upload or a deletion cleans up
  try {
    await deleteAvatars(env, id, key);
  } catch (error) {
    console.error(
      "avatar: earlier pictures left",
      id,
      error instanceof Error ? error.message : error
    );
  }
  return withFreshSession(request, env, { imageUrl });
}
