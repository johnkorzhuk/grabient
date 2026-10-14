import { handleAuth } from "@grabient/server/auth/gate.ts";
import { privateResponse } from "@grabient/server/auth/http.ts";
import type { Env } from "@grabient/server/env.ts";
import { profileOf } from "./sync.ts";

/* /api/auth/*: the server package's gate in front of the sign-in library. The session the page reads answers with the
   account as the page shows it and nothing more: the library's own answer carries the session's token and every
   column of the account, which no script on the page needs to see. */

const SESSION = "/api/auth/get-session";

export async function handleAuthRoute(request: Request, env: Env): Promise<Response> {
  const answer = await handleAuth(request, env);
  if (new URL(request.url).pathname !== SESSION || answer.status !== 200) return answer;
  const read = (await answer
    .clone()
    .json()
    .catch(() => null)) as {
    user?: Parameters<typeof profileOf>[1];
  } | null;
  const body = read?.user ? { user: profileOf(env, read.user) } : null;
  const headers = new Headers(answer.headers);
  headers.delete("Content-Length");
  return privateResponse(new Response(JSON.stringify(body), { status: 200, headers }));
}
