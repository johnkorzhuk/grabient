import { createExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { setFlag } from "@grabient/server/flags/flags.ts";
import { serveMcp } from "../src/server/mcp/server.ts";
import {
  connectionsRoute,
  forgetAccount,
  listConnections
} from "../src/server/oauth/connections.ts";
import { consentPage } from "../src/server/oauth/consent.ts";
import { exchange } from "../src/server/oauth/endpoints.ts";
import { encodeResume } from "../src/server/oauth/resume.ts";
import {
  authorizeAs,
  authorizeQuery,
  CLAUDE,
  CLAUDE_REDIRECT,
  connect,
  LOOPBACK,
  oauth,
  pkce,
  registerClient
} from "./connect.ts";
import {
  address,
  bodyOf,
  cookiesOf,
  get,
  makeAccount,
  makeAdmin,
  ORIGIN,
  post,
  testEnv
} from "./helpers.ts";

const metadata = () => ({
  issuer: ORIGIN,
  authorization_endpoint: `${ORIGIN}/oauth/authorize`,
  token_endpoint: `${ORIGIN}/oauth/token`,
  protected_resources: [`${ORIGIN}/mcp`],
  registration_endpoint: `${ORIGIN}/oauth/register`,
  scopes_supported: ["account", "offline_access"],
  response_types_supported: ["code"],
  response_modes_supported: ["query"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
  revocation_endpoint: `${ORIGIN}/oauth/token`,
  code_challenge_methods_supported: ["S256"],
  authorization_response_iss_parameter_supported: true,
  client_id_metadata_document_supported: true
});

describe("finding the authorization server", () => {
  it("publishes its metadata for five minutes, admin and private_key_jwt never named", async () => {
    const env = testEnv();
    const answer = await oauth(env, get("/.well-known/oauth-authorization-server"));
    expect(answer.status).toBe(200);
    expect(answer.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(answer.headers.has("Pragma")).toBe(false);
    expect(JSON.stringify(await answer.json())).toBe(JSON.stringify(metadata()));
  });

  it("says documents are not supported while an admin has the flag off", async () => {
    const env = testEnv();
    const admin = await makeAdmin(env);
    await setFlag(env, "client-documents", false, admin.id);
    try {
      const answer = await oauth(env, get("/.well-known/oauth-authorization-server"));
      expect(
        ((await answer.json()) as Record<string, unknown>).client_id_metadata_document_supported
      ).toBe(false);
    } finally {
      await setFlag(env, "client-documents", true, admin.id);
    }
  });

  it("serves the MCP server's own resource document and no other", async () => {
    const env = testEnv();
    const answer = await serveMcp(
      get("/.well-known/oauth-protected-resource/mcp"),
      env,
      createExecutionContext()
    );
    expect(answer.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(await answer.json()).toEqual({
      resource: `${ORIGIN}/mcp`,
      authorization_servers: [ORIGIN],
      scopes_supported: ["account"],
      bearer_methods_supported: ["header"],
      resource_name: "Grabient"
    });
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-authorization-server/x",
      "/oauth/nothing"
    ]) {
      const missing = await oauth(env, get(path));
      expect([path, missing.status, await missing.json()]).toEqual([
        path,
        404,
        { error: "Not found" }
      ]);
    }
  });

  it("is unavailable without its KV namespace", async () => {
    const answer = await oauth(testEnv({ OAUTH_KV: undefined }), get("/oauth/authorize"));
    expect([answer.status, await answer.json()]).toEqual([
      503,
      { error: "Sign-in is unavailable." }
    ]);
  });
});

describe("an app registering itself", () => {
  it("is narrowed to what the library implements and made a public client", async () => {
    const env = testEnv();
    const answer = await oauth(
      env,
      post(
        "/oauth/register",
        {
          client_name: "Claude-like",
          redirect_uris: [LOOPBACK],
          grant_types: [
            "authorization_code",
            "refresh_token",
            "urn:ietf:params:oauth:grant-type:jwt-bearer"
          ]
        },
        { origin: null }
      )
    );
    expect(answer.status).toBe(201);
    const client = (await answer.json()) as Record<string, unknown>;
    expect(client.grant_types).toEqual(["authorization_code", "refresh_token"]);
    expect(client.token_endpoint_auth_method).toBe("none");
    expect(client.client_secret).toBeUndefined();
  });

  it("is refused past 8 KB, and while connecting apps is paused", async () => {
    const env = testEnv();
    const large = await oauth(
      env,
      post("/oauth/register", { pad: "x".repeat(9000) }, { origin: null })
    );
    expect([large.status, await large.json()]).toEqual([
      413,
      { error: "invalid_request", error_description: "Send a body of at most 8 KB." }
    ]);
    const admin = await makeAdmin(env);
    await setFlag(env, "mcp", false, admin.id);
    try {
      const paused = await oauth(
        env,
        post("/oauth/register", { redirect_uris: [LOOPBACK] }, { origin: null })
      );
      expect(paused.status).toBe(503);
      expect(paused.headers.get("Retry-After")).toBe("300");
      expect(await paused.json()).toEqual({
        error: "temporarily_unavailable",
        error_description: "Connecting apps is paused."
      });
    } finally {
      await setFlag(env, "mcp", true, admin.id);
    }
  });
});

describe("the authorization page", () => {
  it("sends a signed-out reader to sign in with the request in `r`, in the reader's language", async () => {
    const env = testEnv();
    const { challenge } = await pkce();
    const query = authorizeQuery(CLAUDE, CLAUDE_REDIRECT, challenge);
    const answer = await authorizeAs(env, null, query, { Referer: `${ORIGIN}/ja/login` });
    expect(answer.status).toBe(302);
    const to = new URL(answer.headers.get("Location")!);
    expect(to.pathname).toBe("/ja/login");
    expect(to.searchParams.get("redirect")).toBe(`/oauth/authorize?r=${encodeResume(query)}`);
  });

  it("reads the request back from `r` and begins a consent bound to this browser", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const { challenge } = await pkce();
    const query = authorizeQuery(CLAUDE, CLAUDE_REDIRECT, challenge);
    const answer = await authorizeAs(env, account, `r=${encodeResume(query)}`);
    expect(answer.status).toBe(303);
    const to = new URL(answer.headers.get("Location")!);
    expect(to.pathname).toBe("/connect");
    expect(to.searchParams.get("r")).toBe(encodeResume(query));
    expect(cookiesOf(answer)).toMatch(/^__Host-oauth-consent-[0-9a-f]{16}=[0-9a-f]{64}$/);
  });

  it("names the problem for an undecodable or overlong request, and for a document it may not fetch", async () => {
    const env = testEnv();
    const problem = async (query: string) =>
      new URL((await authorizeAs(env, null, query)).headers.get("Location")!).searchParams.get(
        "problem"
      );
    expect(await problem("r=not!base64")).toBe("invalid");
    expect(await problem(`r=${encodeResume(`client_id=x&state=${"y".repeat(1300)}`)}`)).toBe(
      "invalid"
    );
    expect(await problem(authorizeQuery("https://localhost/client.json", LOOPBACK, "c"))).toBe(
      "invalid"
    );
    expect(await problem(authorizeQuery("NoSuchClient12345", LOOPBACK, "c"))).toBe("unknown");
  });

  it("sends an app's error back only after sign-in and only to a trusted redirect", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    // no PKCE challenge: an error for the app, held until the reader has signed in
    const query = new URLSearchParams({
      response_type: "code",
      client_id: CLAUDE,
      redirect_uri: CLAUDE_REDIRECT,
      state: "s"
    }).toString();
    const out = await authorizeAs(env, null, query);
    expect([out.status, new URL(out.headers.get("Location")!).pathname]).toEqual([302, "/login"]);
    const back = await authorizeAs(env, account, query);
    expect(back.status).toBe(302);
    const to = new URL(back.headers.get("Location")!);
    expect(to.origin + to.pathname).toBe(CLAUDE_REDIRECT);
    expect(to.searchParams.get("error")).toBe("invalid_request");
  });
});

describe("the consent", () => {
  it("shows a saved app by its published name, and offers the admin tools to an admin alone", async () => {
    const env = testEnv();
    const reader = await makeAccount(env);
    const admin = await makeAdmin(env);
    for (const [account, offered] of [
      [reader, null],
      [admin, { offered: true }]
    ] as const) {
      const { challenge } = await pkce();
      const begun = await authorizeAs(
        env,
        account,
        authorizeQuery(CLAUDE, CLAUDE_REDIRECT, challenge)
      );
      const facts = await consentPage(
        new Request(begun.headers.get("Location")!, { headers: { Cookie: account.cookie } }),
        env
      );
      expect(facts).toMatchObject({
        state: "ready",
        account: { id: account.id, email: account.email },
        app: {
          name: "Claude",
          byline: { kind: "published", host: "claude.ai" },
          redirect: CLAUDE_REDIRECT,
          returnsTo: { kind: "site", name: "claude.ai" },
          loopback: false
        },
        admin: offered
      });
    }
  });

  it("names a registered app as unverified and warns of a redirect to this computer", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const clientId = await registerClient(env);
    const { challenge } = await pkce();
    const begun = await authorizeAs(env, account, authorizeQuery(clientId, LOOPBACK, challenge));
    const facts = await consentPage(
      new Request(begun.headers.get("Location")!, { headers: { Cookie: account.cookie } }),
      env
    );
    expect(facts).toMatchObject({
      state: "ready",
      app: {
        name: "Test App",
        byline: { kind: "unverified" },
        returnsTo: { kind: "local", name: "127.0.0.1" },
        loopback: true
      },
      admin: null
    });
  });

  it("refuses an answer from another site, for another account, or with a request it did not show", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const other = await makeAccount(env);
    const { challenge } = await pkce();
    const begun = await authorizeAs(
      env,
      account,
      authorizeQuery(CLAUDE, CLAUDE_REDIRECT, challenge)
    );
    const at = new URL(begun.headers.get("Location")!);
    const handle = at.searchParams.get("h")!;
    const resume = at.searchParams.get("r")!;
    const cookie = `${account.cookie}; ${cookiesOf(begun)}`;
    const send = (body: unknown, init: Parameters<typeof post>[2] = {}) =>
      oauth(env, post("/oauth/consent", body, { cookie, ...init }));
    const answer = { handle, resume, account: account.id, accept: true };
    expect((await send(answer, { origin: "https://elsewhere.test" })).status).toBe(403);
    expect(await bodyOf(await send({ ...answer, account: other.id }))).toEqual({
      error: "account"
    });
    const tampered = encodeResume(authorizeQuery(CLAUDE, CLAUDE_REDIRECT, "another-challenge"));
    expect(await bodyOf(await send({ ...answer, resume: tampered }))).toEqual({ error: "expired" });
  });

  it("says where a Cancel goes: at once to a trusted redirect", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const { challenge } = await pkce();
    const begun = await authorizeAs(
      env,
      account,
      authorizeQuery(CLAUDE, CLAUDE_REDIRECT, challenge)
    );
    const at = new URL(begun.headers.get("Location")!);
    const denied = await oauth(
      env,
      post(
        "/oauth/consent",
        {
          handle: at.searchParams.get("h"),
          resume: at.searchParams.get("r"),
          account: account.id,
          accept: false
        },
        { cookie: `${account.cookie}; ${cookiesOf(begun)}` }
      )
    );
    const body = await bodyOf<{ redirect: boolean; url: string }>(denied);
    expect(body.redirect).toBe(true);
    expect(new URL(body.url).searchParams.get("error")).toBe("access_denied");
  });
});

describe("tokens", () => {
  it("are issued for /mcp with the account scope, and the admin scope only for an admin who chose it", async () => {
    const env = testEnv();
    const reader = await connect(env, await makeAccount(env), { admin: true });
    expect(reader.scope.split(" ").sort()).toEqual(["account", "offline_access"]);
    expect(reader.expires_in).toBe(14 * 86400);
    const admin = await connect(env, await makeAdmin(env), { admin: true });
    expect(admin.scope.split(" ").sort()).toEqual(["account", "admin", "offline_access"]);
    const without = await connect(env, await makeAdmin(env));
    expect(without.scope.split(" ").sort()).toEqual(["account", "offline_access"]);
  });

  it("take a JSON body and an empty secret as the form they mean, counted", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const { refresh_token, clientId } = await connect(env, account, { registered: true });
    const refreshed = await oauth(
      env,
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${btoa(`${clientId}:`)}`,
          "CF-Connecting-IP": address()
        },
        body: JSON.stringify({ grant_type: "refresh_token", refresh_token })
      })
    );
    expect(refreshed.status, await refreshed.clone().text()).toBe(200);
    expect(await bodyOf<{ access_token: string }>(refreshed)).toHaveProperty("access_token");
  });

  it("refuse an unknown document address before fetching it", async () => {
    const answer = await oauth(
      testEnv(),
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "CF-Connecting-IP": address()
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "x",
          client_id: "https://192.0.2.1/c.json"
        })
      })
    );
    expect([answer.status, await answer.json()]).toEqual([
      401,
      { error: "invalid_client", error_description: "Client not found" }
    ]);
  });

  it("send a code exchange KV refused once more, and never a refresh", async () => {
    const statuses: number[] = [];
    const replayed: number[] = [];
    const send = async () => new Response(null, { status: statuses.shift() ?? 200 });
    statuses.push(429, 200);
    expect(
      (
        await exchange(
          send,
          "authorization_code",
          status => replayed.push(status),
          async () => {}
        )
      ).status
    ).toBe(200);
    statuses.push(429, 200);
    expect(
      (
        await exchange(
          send,
          "refresh_token",
          status => replayed.push(status),
          async () => {}
        )
      ).status
    ).toBe(429);
    expect(replayed).toEqual([200]);
  });
});

describe("connected apps", () => {
  it("list one row per app, and Disconnect ends every grant it holds", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    await connect(env, account);
    await connect(env, account);
    await connect(env, account, { registered: true });
    const listed = await listConnections(env, ORIGIN, account.id);
    expect(listed.map(row => row.clientId).filter(id => id === CLAUDE)).toHaveLength(1);
    const claude = listed.find(row => row.clientId === CLAUDE)!;
    expect(claude).toMatchObject({
      name: "Claude",
      verifiedHost: "claude.ai",
      scopes: ["account"],
      sessions: 2
    });
    const route = (path: string, body?: unknown) =>
      connectionsRoute(post(path, body ?? {}, { cookie: account.cookie }), env);
    const read = await bodyOf<{ connections: unknown[] }>(await route("/api/settings/connections"));
    expect(read.connections).toHaveLength(2);
    const gone = await route("/api/settings/connections/disconnect", { clientId: CLAUDE });
    expect(await gone.json()).toEqual({ disconnected: true });
    expect((await listConnections(env, ORIGIN, account.id)).map(row => row.clientId)).not.toContain(
      CLAUDE
    );
    expect(await forgetAccount(env, ORIGIN, account.id)).toBe(1);
    expect(await listConnections(env, ORIGIN, account.id)).toEqual([]);
  });
});
