import type { Env } from "@grabient/server/env.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits, type LimitCheck } from "@grabient/server/limits/check.ts";
import { fetchableClientId, isUrlClientId, SAVED_CLIENT_IDS } from "./clients.ts";

/* The limits in front of the routes an app calls with no cookie, and the check of a client_id before the library
   fetches anything it names. */

type LimitEnv = Pick<Env, "RATE_LIMITER" | "DEPLOYMENT" | "USAGE">;

/** Who a request counts as: its address, or `local` outside Cloudflare. */
export const requester = (request: Request) => clientAddress(request) ?? "local";

/** A registration writes a client for anyone who asks: each address's hour, then the site's day. */
export const registerLimits = (who: string): LimitCheck[] => [
  [`oauth-register:${who}`, "oauthRegister"],
  ["oauth-register", "oauthRegisterDaily"]
];
export const tokenLimits = (who: string): LimitCheck[] => [[`oauth-token:${who}`, "oauthToken"]];

/** A client_id as the authorization page, the consent and the token endpoint take it, before the library fetches
    anything: a saved or registered one passes; a document's address must be one the Worker may fetch, and each address
    may name twenty unsaved documents a minute. */
export async function clientIdAllowed(
  env: LimitEnv,
  request: Request,
  clientId: string
): Promise<"ok" | "invalid" | "limited"> {
  if (!isUrlClientId(clientId) || SAVED_CLIENT_IDS.has(clientId)) return "ok";
  if (!fetchableClientId(clientId, new URL(request.url).origin)) return "invalid";
  const counted = await checkLimits(env, [[`oauth-document:${requester(request)}`, "cimdFetch"]]);
  return counted?.success ? "ok" : "limited";
}
