import type { Env } from "../env.ts";
import { json } from "./http.ts";
import { reviewerAddress } from "./roles.ts";
import { getSession } from "./session.ts";

/**
 * Gives the app reviewers' account its password, once, while that account is signed in: the library's server-only
 * call is the only way a password is ever stored. Throws the library's refusal (a password already set, one too
 * short) or FORBIDDEN for any other session.
 */
export async function setReviewerPassword(
  env: Env,
  headers: Headers,
  password: string
): Promise<void> {
  const session = await getSession(env, headers, { fresh: true });
  const { APIError, authFor } = await import("./library.ts");
  if (!session || !reviewerAddress(env, session.user.email)) {
    throw new APIError("FORBIDDEN", { message: "Only the reviewers' account has a password." });
  }
  await authFor(env).api.setPassword({ headers, body: { newPassword: password } });
}

/** The answer to the reviewers' account sending its password, which the gate passes here (POST
    /api/auth/reviewer-password). A refusal answers in the library's words and status: nobody but the person setting
    the password up reads them. */
export async function reviewerPasswordResponse(
  env: Env,
  headers: Headers,
  password: string
): Promise<Response> {
  try {
    await setReviewerPassword(env, headers, password);
  } catch (error) {
    if (!(error instanceof Error && "statusCode" in error && typeof error.statusCode === "number"))
      throw error;
    return json({ error: error.message }, error.statusCode);
  }
  return json({ ok: true });
}
