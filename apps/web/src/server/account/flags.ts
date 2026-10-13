import { msg } from "@grabient/i18n";
import { json, readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { accountRole } from "@grabient/server/auth/roles.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import type { Env } from "@grabient/server/env.ts";
import { listFlags, setFlag } from "@grabient/server/flags/flags.ts";
import { isFlagName } from "@grabient/server/flags/names.ts";

/** GET /api/me/flags, and PUT /api/me/flags `{name, on}`: the features an admin turns off for the whole site from
    Settings. The role is read from the database on every call, never from the session's copy, and a change goes to
    the Worker's log with who made it. Every other isolate sees it within half a minute. */
export async function handleFlags(request: Request, env: Env): Promise<Response> {
  const write = request.method === "PUT";
  if (!write && request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (write && !sameOrigin(request)) return json({ error: msg("Invalid request.") }, 403);
  const session = await getSession(env, request.headers, { fresh: write });
  if (!session) return json({ error: msg("Sign in to continue.") }, 401);
  if ((await accountRole(env, session.user.id)) !== "admin")
    return json({ error: "Forbidden" }, 403);
  if (write) {
    const body = await readJson(request, 1024);
    if (!body || !isFlagName(body.name) || typeof body.on !== "boolean") {
      return json({ error: 'Send { "name": a flag, "on": true or false }.' }, 400);
    }
    await setFlag(env, body.name, body.on, session.user.id);
    console.log("flag", body.name, body.on ? "on" : "off", "by", session.user.id);
  }
  return json({ flags: await listFlags(env) });
}
