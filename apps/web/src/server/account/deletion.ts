import { deleteAccount } from "@grabient/server/auth/deletion.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import type { Env } from "@grabient/server/env.ts";
import { forgetConnections } from "./seams.ts";

/** POST /api/settings/delete-account `{token}`: Settings confirming a deletion with the token its email carried (the
    server package's deleteAccount says how). Once the account is gone, its connected apps' grants go too. */
export async function confirmDeletion(request: Request, env: Env): Promise<Response> {
  const session = await getSession(env, request.headers, { fresh: true });
  const answer = await deleteAccount(request, env);
  if (answer.ok && session) {
    const origin = env.PUBLIC_ORIGIN ?? new URL(request.url).origin;
    await forgetConnections(env, origin, session.user.id).catch(error =>
      console.error(
        "account deletion: connected apps left",
        session.user.id,
        error instanceof Error ? error.message : error
      )
    );
  }
  return answer;
}
