import { first } from "../db/d1.ts";
import type { Env } from "../env.ts";
import { json, privateResponse, readJson, sameOrigin } from "./http.ts";
import { authFor } from "./library.ts";
import { accountRole } from "./roles.ts";
import { getSession } from "./session.ts";

const TOKEN_MAX = 512;

/* The library clears the session's cookies in an inner call whose answer it drops, and answers a deletion with a fresh
   copy of the deleted session for five minutes. The browser is told to forget all of them here instead. */
async function forgetSession(env: Env): Promise<Headers> {
  const { authCookies } = await authFor(env).$context;
  const headers = new Headers();
  for (const { name, attributes } of [
    authCookies.sessionToken,
    authCookies.sessionData,
    authCookies.dontRememberToken
  ]) {
    const parts = [`${name}=`, "Max-Age=0", `Path=${attributes.path ?? "/"}`];
    if (attributes.domain) parts.push(`Domain=${attributes.domain}`);
    if (attributes.secure) parts.push("Secure");
    if (attributes.httpOnly) parts.push("HttpOnly");
    if (attributes.sameSite) {
      parts.push(
        `SameSite=${attributes.sameSite[0]!.toUpperCase()}${attributes.sameSite.slice(1)}`
      );
    }
    headers.append("Set-Cookie", parts.join("; "));
  }
  return headers;
}

/**
 * `POST /api/settings/delete-account {token}`: Settings confirming a deletion with the token its email carried. The
 * library then deletes the account (account-data.ts says what goes).
 */
export async function deleteAccount(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Invalid request." }, 403);
  const session = await getSession(env, request.headers, { fresh: true });
  if (!session) return json({ error: "Sign in to continue." }, 401);
  const token = (await readJson(request))?.token;
  if (typeof token !== "string" || !token || token.length > TOKEN_MAX) {
    return json({ error: "Invalid request." }, 400);
  }
  // The library spends a token before it compares the token's account with the session's, so a link opened while
  // signed in to another account is checked here first and burns nothing.
  const owned = await first(
    env.DB,
    "SELECT 1 AS owned FROM auth_verification WHERE identifier = ? AND value = ? AND expires_at > ?",
    `delete-account-${token}`,
    session.user.id,
    Date.now()
  );
  if (!owned) return json({ error: "This link is invalid or expired." }, 400);
  if ((await accountRole(env, session.user.id)) === "admin") {
    return json({ error: "Admin accounts can't be deleted here." }, 403);
  }
  try {
    const deleted = await authFor(env).api.deleteUser({
      headers: request.headers,
      body: { token },
      asResponse: true
    });
    if (deleted.ok) return json(await deleted.json(), 200, await forgetSession(env));
    if (deleted.status < 500) return privateResponse(deleted);
    throw new Error(`the library answered ${deleted.status}`);
  } catch (error) {
    // The token was checked, so the deletion itself failed, and its batch left the account whole.
    console.error("account deletion failed", session.user.id, error);
    return json({ error: "Couldn't delete the account." }, 500);
  }
}
