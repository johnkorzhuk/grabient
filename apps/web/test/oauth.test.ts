import { createExecutionContext } from "cloudflare:test";
import type { Env } from "@grabient/server/env.ts";
import { setFlag } from "@grabient/server/flags/flags.ts";
import { checkLimits } from "@grabient/server/limits/check.ts";
import { describe, expect, it, vi } from "vitest";
import { documentAlert } from "../src/server/alerts/alerts.ts";
import { serveMcp } from "../src/server/mcp/server.ts";
import { CLIENT_DOCUMENTS } from "../src/server/oauth/client-documents.data.ts";
import {
  connectionsRoute,
  forgetAccount,
  GRANTS_KEPT,
  listConnections
} from "../src/server/oauth/connections.ts";
import { consentPage } from "../src/server/oauth/consent.ts";
import { exchange } from "../src/server/oauth/endpoints.ts";
import { requester } from "../src/server/oauth/limits.ts";
import { encodeResume } from "../src/server/oauth/resume.ts";
import { checkClientDocuments, purgeOAuth } from "../src/server/oauth/upkeep.ts";
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
  testEnv,
  unique,
  watchLimits
} from "./helpers.ts";

/** OAUTH_KV seen through a new object, as another isolate holds it, with each key it reads told to `read`. */
function readsOf(env: Env, read: string[]): Env {
  const kv = env.OAUTH_KV!;
  const OAUTH_KV = new Proxy(kv, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (key === "get") read.push(String(args[0]));
        return value.apply(target, args);
      };
    }
  });
  return { ...env, OAUTH_KV };
}

/** Grants an account holds as the library keeps them, Claude's, each a minute less recently used than the last: its
    key expires a year after its last use. */
async function holdGrants(env: Env, userId: string, n: number): Promise<string[]> {
  const now = Math.floor(Date.now() / 1000);
  const ids = Array.from({ length: n }, (_, i) => `held${String(i).padStart(3, "0")}`);
  await Promise.all(
    ids.map((id, i) =>
      env.OAUTH_KV!.put(
        `grant:${userId}:${id}`,
        JSON.stringify({
          id,
          clientId: CLAUDE,
          userId,
          scope: ["account", "offline_access"],
          metadata: { name: "Claude", host: "claude.ai", kind: "saved" },
          createdAt: now - 86400 - i,
          expiresAt: now + 365 * 86400 - 60 * i,
          redirectUri: CLAUDE_REDIRECT
        }),
        { expiration: now + 365 * 86400 - 60 * i, metadata: { clientId: CLAUDE } }
      )
    )
  );
  return ids;
}

const grantsOf = async (env: Env, userId: string) =>
  (await env.OAUTH_KV!.list({ prefix: `grant:${userId}:` })).keys.map(key =>
    key.name.slice(`grant:${userId}:`.length)
  );

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

  it("counts against its address's hour and the site's 5,000 a day, refused in the library's shape past them", async () => {
    const { env, asked } = watchLimits(testEnv());
    await registerClient(env);
    expect(asked).toEqual(["oauthRegister", "oauthRegisterDaily"]);
    expect(await checkLimits(env, [["oauth-register", "oauthRegisterDaily"]])).toMatchObject({
      success: true,
      limit: 5000
    });
    const ip = address();
    const ask = () =>
      oauth(env, post("/oauth/register", { redirect_uris: [LOOPBACK] }, { origin: null, ip }));
    await checkLimits(env, [
      [`oauth-register:${requester(get("/", { ip }))}`, "oauthRegister", 30]
    ]);
    const refused = await ask();
    expect([refused.status, await refused.json()]).toEqual([
      429,
      { error: "temporarily_unavailable", error_description: "Too many requests." }
    ]);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
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

  it("last as long as the deploy says, within two minutes and fourteen days", async () => {
    const short = testEnv({ OAUTH_ACCESS_TTL: "3600" });
    expect((await connect(short, await makeAccount(short))).expires_in).toBe(3600);
    for (const asked of ["119", "1209601", "90.5", "soon", ""]) {
      const env = testEnv({ OAUTH_ACCESS_TTL: asked });
      expect((await connect(env, await makeAccount(env))).expires_in, asked).toBe(14 * 86400);
    }
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

  it("refresh within the grant's day, then the account's and the site's, and a refused refresh leaves the token working", async () => {
    const { env, asked } = watchLimits(testEnv());
    const account = await makeAccount(env);
    const { refresh_token, clientId } = await connect(env, account, { registered: true });
    const refresh = (token: string) =>
      oauth(
        env,
        new Request(`${ORIGIN}/oauth/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "CF-Connecting-IP": address()
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: token,
            client_id: clientId
          })
        })
      );
    asked.length = 0;
    const first = await refresh(refresh_token);
    expect(first.status, await first.clone().text()).toBe(200);
    expect(asked).toEqual(["oauthRefreshGrant", "oauthRefreshAccount", "oauthRefreshDaily"]);
    expect(await checkLimits(env, [["oauth-refresh", "oauthRefreshDaily"]])).toMatchObject({
      limit: 100000
    });
    const held = await bodyOf<{ access_token: string; refresh_token: string }>(first);

    // the grant's day spent: refused before the library, which keeps the grant as it was
    const [userId, grantId] = refresh_token.split(":");
    await checkLimits(env, [[`oauth-refresh:${userId}:${grantId}`, "oauthRefreshGrant", 47]]);
    const refused = await refresh(held.refresh_token);
    expect([refused.status, await refused.json()]).toEqual([
      429,
      { error: "temporarily_unavailable", error_description: "Too many requests." }
    ]);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
    const ping = await serveMcp(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${held.access_token}`,
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-11-25",
          "CF-Connecting-IP": address()
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })
      }),
      env,
      createExecutionContext()
    );
    expect(ping.status).toBe(200);

    // an account's day bounds every grant it holds, before any is read
    const other = unique("user");
    expect((await refresh(`${other}:${unique("grant")}:secret`)).status).toBe(400);
    await checkLimits(env, [[`oauth-refresh:${other}`, "oauthRefreshAccount", 499]]);
    expect((await refresh(`${other}:${unique("grant")}:secret`)).status).toBe(429);
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

  it("read at most a hundred grants, and answer Settings again from the isolate for half a minute", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    await holdGrants(env, account.id, 120);
    const read: string[] = [];
    const listed = await listConnections(readsOf(env, read), ORIGIN, account.id);
    expect(listed).toMatchObject([{ clientId: CLAUDE, sessions: 100 }]);
    expect(read).toHaveLength(100);

    const watched = watchLimits(testEnv());
    const route = (path: string, body?: unknown) =>
      connectionsRoute(
        post(path, body ?? {}, { cookie: account.cookie }),
        readsOf(watched.env, read)
      );
    read.length = 0;
    expect((await route("/api/settings/connections")).status).toBe(200);
    expect([read.length, watched.asked]).toEqual([100, ["connectionsDaily"]]);
    read.length = 0;
    expect((await route("/api/settings/connections")).status).toBe(200);
    expect([read.length, watched.asked]).toEqual([0, ["connectionsDaily"]]);
    // a disconnect reads and counts, and the next list is read again
    expect(
      await bodyOf(await route("/api/settings/connections/disconnect", { clientId: CLAUDE }))
    ).toEqual({
      disconnected: true
    });
    read.length = 0;
    expect(await bodyOf(await route("/api/settings/connections"))).toEqual({ connections: [] });
    expect(watched.asked).toEqual(["connectionsDaily", "connectionsDaily", "connectionsDaily"]);
  });

  it("refuse an account past its day of reads, and keep at most a hundred grants, ending the least used", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    await checkLimits(env, [[`connections:${account.id}`, "connectionsDaily", 300]]);
    const refused = await connectionsRoute(
      post("/api/settings/connections", {}, { cookie: account.cookie }),
      env
    );
    expect([refused.status, await refused.json()]).toEqual([
      429,
      { error: "Too many requests. Try again later." }
    ]);

    const held = await holdGrants(env, account.id, GRANTS_KEPT);
    await connect(env, account);
    const kept = await grantsOf(env, account.id);
    expect(kept).toHaveLength(GRANTS_KEPT);
    expect(kept).not.toContain(held.at(-1));
    expect(kept).toContain(held[0]);
  });
});

describe("the six-hour upkeep", () => {
  it("purges a grant whose app is no longer registered, a batch at a time from where the last stopped", async () => {
    const env = testEnv();
    const account = await makeAccount(env);
    const { access_token, clientId } = await connect(env, account, { registered: true });
    const asks = () =>
      serveMcp(
        new Request(`${ORIGIN}/mcp`, {
          method: "POST",
          headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })
        }),
        env,
        createExecutionContext()
      );
    expect((await asks()).status).toBe(200);
    await env.OAUTH_KV!.delete(`client:${clientId}`);
    // more grants than one pass reads
    await holdGrants(env, (await makeAccount(env)).id, 120);
    let purged = 0;
    let passes = 0;
    for (;;) {
      const result = await purgeOAuth(env);
      passes++;
      purged += result?.grantsPurged ?? 0;
      // a pass that stopped short keeps its place; the last one clears it
      expect(await env.OAUTH_KV!.get("purge-cursor")).toBe(result?.cursor ?? null);
      if (!result?.cursor || passes > 50) break;
    }
    expect(passes).toBeGreaterThan(1);
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await grantsOf(env, account.id)).toEqual([]);
    expect((await asks()).status).toBe(401);
    expect(await purgeOAuth({ ...env, OAUTH_KV: undefined })).toBeNull();
  });

  it("tells the owner once of a saved document that changed, and once of one unreachable for a week", async () => {
    const env = testEnv();
    const [changed, down] = Object.keys(CLIENT_DOCUMENTS) as [string, string];
    const published = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === down) return new Response("busy", { status: 503 });
      const saved = CLIENT_DOCUMENTS[url];
      return Response.json(
        url === changed ? { ...saved, redirect_uris: ["https://elsewhere.test/back"] } : saved
      );
    });
    try {
      const told: string[] = [];
      const day = Date.UTC(2026, 9, 14, 6);
      const check = (now: number) =>
        checkClientDocuments(
          env,
          found => {
            told.push(`${found.notify} ${found.clientId}`);
            return documentAlert(env, found, now);
          },
          now
        );
      expect((await check(day)).map(found => found.state)).toEqual([
        "changed",
        "unreachable",
        "same",
        "same",
        "same"
      ]);
      expect(told).toEqual([`changed ${changed}`]);
      expect(env.EMAIL.last.subject).toBe("Grabient: a saved client document changed");
      expect(env.EMAIL.last.text).toContain("Fields that differ: redirect_uris.");
      // the same change is told once; a week without an answer is told, once too
      await check(day + 6 * 3_600_000);
      expect(told).toHaveLength(1);
      const week = await check(day + 7 * 86_400_000);
      expect(week[1]).toMatchObject({ clientId: down, why: "HTTP 503", notify: "unreachable" });
      expect(env.EMAIL.last.subject).toBe(
        "Grabient: a client document has been unreachable for a week"
      );
      await check(day + 8 * 86_400_000);
      expect(told).toEqual([`changed ${changed}`, `unreachable ${down}`]);
      expect(env.EMAIL.sent).toHaveLength(2);
    } finally {
      published.mockRestore();
    }
  });
});
