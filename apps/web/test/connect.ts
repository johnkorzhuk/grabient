import { createExecutionContext } from "cloudflare:test";
import { expect } from "vitest";
import type { Env } from "../src/server/env.ts";
import { consentPage } from "../src/server/oauth/consent.ts";
import { handleOAuth } from "../src/server/oauth/routes.ts";
import { type Account, address, cookiesOf, ORIGIN, post } from "./helpers.ts";

/* An app connecting to an account the way a real one does: it registers (or names a saved document), sends the
   browser to the authorization page, the account allows it on the consent page, and the app exchanges the code. */

export const CLAUDE = "https://claude.ai/oauth/mcp-oauth-client-metadata";
export const CLAUDE_REDIRECT = "https://claude.ai/api/mcp/auth_callback";
export const LOOPBACK = "http://127.0.0.1:5555/callback";

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

export async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))
  );
  return { verifier, challenge };
}

export const oauth = (env: Env, request: Request) =>
  handleOAuth(request, env, createExecutionContext());

/** A registered public client returning to this computer. */
export async function registerClient(env: Env, redirect = LOOPBACK): Promise<string> {
  const answer = await oauth(
    env,
    post(
      "/oauth/register",
      { client_name: "Test App", redirect_uris: [redirect] },
      { origin: null }
    )
  );
  expect(answer.status, await answer.clone().text()).toBe(201);
  return ((await answer.json()) as { client_id: string }).client_id;
}

export function authorizeQuery(
  clientId: string,
  redirect: string,
  challenge: string,
  more: Record<string, string> = {}
) {
  return new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirect,
    state: "state-1",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...more
  }).toString();
}

/** The authorization page, as a signed-in browser reaches it. */
export function authorizeAs(
  env: Env,
  account: Account | null,
  query: string,
  headers: Record<string, string> = {}
) {
  return oauth(
    env,
    new Request(`${ORIGIN}/oauth/authorize?${query}`, {
      headers: {
        "CF-Connecting-IP": address(),
        ...(account ? { Cookie: account.cookie } : {}),
        ...headers
      }
    })
  );
}

/** Connects an app to `account` and answers its tokens. A saved document by default: Claude. */
export async function connect(
  env: Env,
  account: Account,
  options: { clientId?: string; redirect?: string; admin?: boolean; registered?: boolean } = {}
) {
  const redirect = options.redirect ?? (options.registered ? LOOPBACK : CLAUDE_REDIRECT);
  const clientId =
    options.clientId ?? (options.registered ? await registerClient(env, redirect) : CLAUDE);
  const { verifier, challenge } = await pkce();
  const begun = await authorizeAs(env, account, authorizeQuery(clientId, redirect, challenge));
  expect(begun.status, await begun.clone().text()).toBe(303);
  const at = new URL(begun.headers.get("Location")!);
  const binding = cookiesOf(begun);
  const facts = await consentPage(new Request(at, { headers: { Cookie: account.cookie } }), env);
  if (facts instanceof Response || facts.state !== "ready")
    throw new Error(`No consent to answer: ${JSON.stringify(facts)}`);
  const answered = await oauth(
    env,
    post(
      "/oauth/consent",
      {
        handle: facts.handle,
        resume: facts.resume,
        account: account.id,
        accept: true,
        ...(options.admin ? { admin: true } : {})
      },
      { cookie: `${account.cookie}; ${binding}` }
    )
  );
  expect(answered.status, await answered.clone().text()).toBe(200);
  const { url } = (await answered.json()) as { url: string };
  const code = new URL(url).searchParams.get("code")!;
  const exchanged = await oauth(
    env,
    new Request(`${ORIGIN}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "CF-Connecting-IP": address()
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect,
        client_id: clientId,
        code_verifier: verifier
      })
    })
  );
  expect(exchanged.status, await exchanged.clone().text()).toBe(200);
  const tokens = (await exchanged.json()) as {
    access_token: string;
    refresh_token: string;
    scope: string;
    expires_in: number;
  };
  return { ...tokens, clientId, redirect, facts };
}
