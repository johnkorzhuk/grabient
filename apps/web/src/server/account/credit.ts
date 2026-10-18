import { msg } from "@grabient/i18n";
import { json, overLimit, readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import { first, run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import * as v from "valibot";
import { readUsername } from "../../features/account/username.ts";
import { fitToShow } from "./screen.ts";

/* Settings' switch for the account's username on the palettes it liked first (server/gallery/credit.ts). Every account
   starts with it off. On needs a username that the list, Llama and Clef find fit to show (screen.ts) and that an admin
   never took off palettes (credit_refused), and keeps the name as it was checked: a new username is checked again
   before it shows (profile.ts), and until then nothing does. */

const Choice = v.object({ on: v.boolean() });
const CHOICE_BODY_MAX = 64;

/** Why the switch stays off, as Settings says it. */
const NO_NAME = msg("Add a username in Profile to turn this on.");
const UNFIT = msg("This username can't be shown on palettes. Choose another to turn this on.");
const UNCHECKED = msg("Couldn't check the username. Try again.");

/** What a check of a name an account wants on palettes allows: the name to keep for its credit, or why not. */
export async function creditFor(
  env: Env,
  accountId: string,
  name: string
): Promise<{ kept: string } | { refused: "unfit" | "unchecked" }> {
  const fitness = await fitToShow(env, name, accountId);
  return fitness === "fit" ? { kept: name } : { refused: fitness };
}

/** `GET /api/me/credit`: whether the account's username shows on the palettes it liked first, `{ on }`. `PUT { on }`
    turns it on, once the username is found fit to show, or off. */
export async function creditResponse(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "PUT")
    return json({ error: "Method not allowed" }, 405);
  const write = request.method === "PUT";
  if (write && !sameOrigin(request)) return json({ error: msg("Invalid request.") }, 403);
  const session = await getSession(env, request.headers, { fresh: write });
  if (!session) return json({ error: msg("Sign in to continue.") }, 401);
  const { id } = session.user;
  const limited = await overLimit(env, [[`credit:${id}`, "creditChoice"]]);
  if (limited) return limited;
  const row = await first<{
    username: string | null;
    credit_name: string | null;
    credit_refused: string | null;
  }>(env.DB, "SELECT username, credit_name, credit_refused FROM auth_user WHERE id = ?", id);
  const shown = !!row?.credit_name && row.credit_name === row.username;
  if (!write) return json({ on: shown });
  const body = v.safeParse(Choice, await readJson(request, CHOICE_BODY_MAX));
  if (!body.success) return json({ error: 'Send { "on": true or false }.' }, 400);
  if (!body.output.on) {
    await run(env.DB, "UPDATE auth_user SET credit_name = NULL WHERE id = ?", id);
    return json({ on: false });
  }
  const name = row?.username;
  if (!name) return json({ error: NO_NAME }, 409);
  if (shown) return json({ on: true });
  /* a name from before the username rules, or one an admin took off palettes, never shows */
  if (readUsername(name).problem !== null || row.credit_refused === name)
    return json({ error: UNFIT }, 422);
  const checked = await creditFor(env, id, name);
  if ("refused" in checked)
    return checked.refused === "unfit"
      ? json({ error: UNFIT }, 422)
      : json({ error: UNCHECKED }, 503);
  /* a rename since the row was read keeps the switch off, as the new name was never checked, and a press of the
     switch meanwhile stands */
  const wrote = await run(
    env.DB,
    "UPDATE auth_user SET credit_name = ? WHERE id = ? AND username = ? AND credit_name IS ?",
    checked.kept,
    id,
    checked.kept,
    row.credit_name
  );
  return wrote.changes ? json({ on: true }) : json({ error: UNCHECKED }, 409);
}
