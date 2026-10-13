import { deleteAccount } from "@grabient/server/auth/deletion.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import type { Env } from "@grabient/server/env.ts";
import { forgetAccount } from "../oauth/connections.ts";
import { publicOrigin } from "../seo/site.ts";

/** POST /api/settings/delete-account `{token}`: Settings confirming a deletion with the token its email carried (the
    server package's deleteAccount says how). Once the account is gone, every grant its connected apps hold is revoked;
    their tokens fail already, since the validator finds no account, so a grant left behind is logged, never an error. */
export async function confirmDeletion(request: Request, env: Env): Promise<Response> {
  const session = await getSession(env, request.headers, { fresh: true });
  const answer = await deleteAccount(request, env);
  if (answer.ok && session) {
    await forgetAccount(env, publicOrigin(env, request), session.user.id).catch(error =>
      console.error(
        "account deletion: connected apps left",
        session.user.id,
        error instanceof Error ? error.message : error
      )
    );
  }
  return answer;
}
