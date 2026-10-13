import { APIError } from "better-auth/api";
import type { Env } from "../env.ts";
import { authFor } from "./library.ts";
import { reviewerAddress } from "./roles.ts";
import { getSession } from "./session.ts";

/**
 * Gives the app reviewers' account its password, once, while that account is signed in: the library's server-only
 * call is the only way a password is ever stored, and no route takes one from a browser. Throws the library's refusal
 * (a password already set, one too short) or FORBIDDEN for any other session.
 */
export async function setReviewerPassword(
  env: Env,
  headers: Headers,
  password: string
): Promise<void> {
  const session = await getSession(env, headers, { fresh: true });
  if (!session || !reviewerAddress(env, session.user.email)) {
    throw new APIError("FORBIDDEN", { message: "Only the reviewers' account has a password." });
  }
  await authFor(env).api.setPassword({ headers, body: { newPassword: password } });
}
