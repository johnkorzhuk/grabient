/// <reference types="vite/client" />
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { encodePalette } from "@grabient/engine/codec.ts";
import { randomPalette } from "@grabient/engine/random.ts";
import { anchorsFromHexes } from "@grabient/engine/spec.ts";
import { all, run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { setFlag } from "@grabient/server/flags/flags.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits } from "@grabient/server/limits/check.ts";
import { describe, expect, it } from "vitest";
import skillMd from "../../../skills/grabient/SKILL.md?raw";
import { castFitVote } from "../src/server/collections/fit.ts";
import { galleryPalette } from "../src/server/collections/gallery.ts";
import { addNote } from "../src/server/collections/notes.ts";
import { collectionRecord } from "../src/server/collections/read.ts";
import { recordAction } from "../src/server/collections/record.ts";
import { createCollection } from "../src/server/collections/write.ts";
import { applyQueue } from "../src/server/mcp/admin/queue.ts";
import { directoryProof } from "../src/server/mcp/directories.ts";
import discoverGolden from "../src/server/mcp/fixtures/discover-modern-admin.json" with {
  type: "json"
};
import handshakeGolden from "../src/server/mcp/fixtures/handshake-legacy-account.json" with {
  type: "json"
};
import resourcesGolden from "../src/server/mcp/fixtures/resources-list-modern.json" with {
  type: "json"
};
import accountGolden from "../src/server/mcp/fixtures/tools-account.json" with { type: "json" };
import adminGolden from "../src/server/mcp/fixtures/tools-admin-only.json" with { type: "json" };
import wireGolden from "../src/server/mcp/fixtures/wire-errors.json" with { type: "json" };
import { serveMcp } from "../src/server/mcp/server.ts";
import { loadSnapshot } from "../src/server/search/snapshot.ts";
import { connect } from "./connect.ts";
import {
  type Account,
  address,
  count,
  get,
  makeAccount,
  makeAdmin,
  ORIGIN,
  type TestEnv,
  testEnv,
  unique,
  watchLimits
} from "./helpers.ts";

/** A fixture as this test's origin answers it: grabient4's were captured at grabient.com. */
const here = <T>(golden: T): T =>
  JSON.parse(JSON.stringify(golden).replaceAll("https://grabient.com", ORIGIN));
const SEED = "kSWUkczDNDewdRK";
const OTHER = "kQf5EOWSTcQ";
/** A palette no other test has touched: the tests of a file share its database. */
const fresh = () => encodePalette(randomPalette());
const MODERN = "2026-07-28";
const DAY = 86_400_000;

/** The palettes the shipped search snapshot holds, listed in the gallery: a search shows only what the database says
    is public. */
async function shippedGallery(env: Env): Promise<string[]> {
  const { seeds } = (await loadSnapshot(env))!;
  await run(
    env.DB,
    `INSERT INTO k_palettes (seed, style, steps, angle, created_at)
     SELECT value, 'linearGradient', 7, 90, ? FROM json_each(?) WHERE true ON CONFLICT DO NOTHING`,
    Date.now() - DAY,
    JSON.stringify(seeds)
  );
  return seeds;
}

let id = 0;
/** One JSON-RPC request to /mcp with a bearer token, in the handshake's era or, with `modern`, 2026-07-28's. */
async function rpc(
  env: Env,
  token: string | null,
  method: string,
  params: Record<string, unknown> = {},
  options: {
    modern?: boolean;
    headers?: Record<string, string>;
    capabilities?: Record<string, unknown>;
  } = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "CF-Connecting-IP": address(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  let sent = params;
  if (options.modern) {
    headers["MCP-Protocol-Version"] = MODERN;
    headers["Mcp-Method"] = method;
    if (method === "tools/call") headers["Mcp-Name"] = String(params.name);
    if (method === "resources/read") headers["Mcp-Name"] = String(params.uri);
    sent = {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": MODERN,
        "io.modelcontextprotocol/clientCapabilities": options.capabilities ?? {}
      }
    };
  } else headers["MCP-Protocol-Version"] = "2025-11-25";
  const ctx = createExecutionContext();
  const response = await serveMcp(
    new Request(`${ORIGIN}/mcp`, {
      method: "POST",
      headers: { ...headers, ...options.headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: sent })
    }),
    env,
    ctx
  );
  // what a tool left to finish after its answer: a search counted
  await waitOnExecutionContext(ctx);
  const json = response.headers.get("Content-Type")?.startsWith("application/json");
  // biome-ignore lint/suspicious/noExplicitAny: a JSON-RPC answer, read as each test expects it to be shaped
  return { response, body: json ? ((await response.json()) as Record<string, any>) : null };
}

/** A tool's answer as its model reads it: the JSON of its one text block, or its refusal's words. */
async function call(env: Env, token: string, name: string, args: Record<string, unknown> = {}) {
  const { body } = await rpc(env, token, "tools/call", { name, arguments: args });
  const result = body?.result as {
    content: { text: string }[];
    isError?: true;
    _meta?: Record<string, unknown>;
  };
  const text = result.content[0]!.text;
  return {
    result,
    error: result.isError ? text : null,
    value: result.isError ? null : JSON.parse(text)
  };
}

async function connected(env: TestEnv, options: { admin?: boolean; registered?: boolean } = {}) {
  const account: Account = options.admin ? await makeAdmin(env) : await makeAccount(env);
  const { access_token } = await connect(env, account, options);
  return { account, token: access_token };
}

describe("the MCP server's door", () => {
  it("challenges a request without a token, and a token it does not know", async () => {
    const env = testEnv();
    const challenge = `Bearer realm="OAuth", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp", scope="account"`;
    const none = await rpc(env, null, "tools/list");
    expect(none.response.status).toBe(401);
    expect(none.response.headers.get("WWW-Authenticate")).toBe(challenge);
    const bad = await rpc(env, "u:g:nonsense", "tools/list");
    expect(bad.response.status).toBe(401);
    expect(bad.response.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
  });

  it("shows a browser how to connect, and takes nothing but POST from an app", async () => {
    const env = testEnv();
    const browser = await serveMcp(
      get("/mcp", { headers: { Accept: "text/html" } }),
      env,
      createExecutionContext()
    );
    expect([browser.status, browser.headers.get("Location")]).toEqual([
      302,
      `${ORIGIN}/mcp-server`
    ]);
    const { token } = await connected(env);
    const getting = await serveMcp(
      get("/mcp", { headers: { Authorization: `Bearer ${token}` } }),
      env,
      createExecutionContext()
    );
    expect([getting.status, getting.headers.get("Allow")]).toEqual([405, "POST, OPTIONS"]);
  });

  it("answers a browser app's preflight from its own origin, before any token", async () => {
    const preflight = await serveMcp(
      new Request(`${ORIGIN}/mcp`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://app.example",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, content-type, mcp-protocol-version"
        }
      }),
      testEnv(),
      createExecutionContext()
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example");
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toBe("Authorization, *");
    // a browser app reads the challenge and the wait from a refusal
    expect(preflight.headers.get("Access-Control-Expose-Headers")).toBe(
      "WWW-Authenticate, Retry-After"
    );
  });

  it("refuses a token for this server at another origin", async () => {
    const env = testEnv();
    const { token } = await connected(env);
    const elsewhere = testEnv({ PUBLIC_ORIGIN: "https://elsewhere.test" });
    expect((await rpc(elsewhere, token, "tools/list")).response.status).toBe(401);
  });

  it("refuses an account deleted since, and a role taken away ends the admin tools at once", async () => {
    const env = testEnv();
    const { account, token } = await connected(env, { admin: true });
    const listed = async () =>
      ((await rpc(env, token, "tools/list")).body?.result?.tools as unknown[] | undefined)?.length;
    expect(await listed()).toBe(42);
    await run(env.DB, "UPDATE auth_user SET role = 'user' WHERE id = ?", account.id);
    expect(await listed()).toBe(14);
    await run(env.DB, "DELETE FROM auth_user WHERE id = ?", account.id);
    expect((await rpc(env, token, "tools/list")).response.status).toBe(401);
  });

  it("refuses an address's tokens before they are looked up, once it sent a minute of unknown ones", async () => {
    const env = testEnv();
    const { token } = await connected(env);
    const ip = address();
    const from = { headers: { "CF-Connecting-IP": ip } };
    const who = clientAddress(get("/", { ip }));
    await checkLimits(env, [[`mcp-challenge:${who}`, "mcpChallenge", 119]]);
    // the minute's last unknown token is looked up, refused and counted
    expect((await rpc(env, "u:g:unknown", "ping", {}, from)).response.status).toBe(401);
    const read: string[] = [];
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
    const stopped = await rpc({ ...env, OAUTH_KV }, token, "ping", {}, from);
    expect([stopped.response.status, stopped.body]).toEqual([
      429,
      { error: "Too many requests. Try again later." }
    ]);
    expect(Number(stopped.response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(read).toEqual([]);
    // a request with no token is challenged as ever, and the same token from another address is answered
    expect((await rpc(env, null, "ping", {}, from)).response.status).toBe(401);
    expect((await rpc(env, token, "ping")).response.status).toBe(200);
  });

  it("is paused by its flag, refuses an Origin that is none, and times what it waited on", async () => {
    const env = testEnv();
    const { token } = await connected(env);
    const timed = await rpc(env, token, "ping");
    expect(timed.response.headers.get("Server-Timing")).toMatch(
      /^auth;dur=[\d.]+, limiter;dur=[\d.]+$/
    );
    expect((await rpc(env, token, "ping", {}, { headers: { Origin: "null" } })).body).toEqual({
      error: "Invalid Origin."
    });
    const admin = await makeAdmin(env);
    await setFlag(env, "mcp", false, admin.id);
    try {
      const paused = await rpc(env, token, "ping");
      expect([
        paused.response.status,
        paused.body,
        paused.response.headers.get("Retry-After")
      ]).toEqual([503, { error: "The MCP server is paused." }, "300"]);
    } finally {
      await setFlag(env, "mcp", true, admin.id);
    }
  });
});

describe("the protocol", () => {
  it("answers the handshake as grabient4 did", async () => {
    const env = testEnv();
    const { token } = await connected(env);
    const { body } = await rpc(env, token, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "x", version: "1" }
    });
    expect(JSON.stringify(body?.result)).toBe(JSON.stringify(here(handshakeGolden)));
  });

  it("answers 2026-07-28's discovery and resources, its version checked against the headers", async () => {
    const env = testEnv();
    const { token } = await connected(env, { admin: true });
    const discovered = await rpc(env, token, "server/discover", {}, { modern: true });
    expect(JSON.stringify(discovered.body?.result)).toBe(
      JSON.stringify(here(discoverGolden).result)
    );
    const resources = await rpc(env, token, "resources/list", {}, { modern: true });
    expect(JSON.stringify(resources.body?.result)).toBe(
      JSON.stringify(here(resourcesGolden).result)
    );
    const mismatch = await rpc(
      env,
      token,
      "tools/list",
      {},
      { modern: true, headers: { "Mcp-Method": "tools/call" } }
    );
    expect([mismatch.response.status, mismatch.body?.error]).toEqual([
      400,
      here(wireGolden).headerMismatch.body.error
    ]);
    const named = await rpc(
      env,
      token,
      "tools/call",
      { name: "get_account", arguments: {} },
      { modern: true, headers: { "Mcp-Name": `=?base64?${btoa("get_account")}?=` } }
    );
    expect(named.body?.result.resultType).toBe("complete");
  });

  it("refuses what is no JSON-RPC request and takes a notification with nothing to say", async () => {
    const env = testEnv();
    const { token } = await connected(env);
    const notification = await serveMcp(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
      }),
      env,
      createExecutionContext()
    );
    expect(notification.status).toBe(202);
    const batch = await serveMcp(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "[]"
      }),
      env,
      createExecutionContext()
    );
    expect([batch.status, await batch.json()]).toEqual([
      400,
      { jsonrpc: "2.0", error: { code: -32600, message: "Send one JSON-RPC message." } }
    ]);
  });

  it("names unknown methods, tools and resources in each era's words", async () => {
    const env = testEnv();
    const { token } = await connected(env);
    const golden = here(wireGolden);
    expect(
      (await rpc(env, token, "tools/call", { name: "liked_palettes", arguments: {} })).body?.error
    ).toEqual(golden.unknownToolForAccount);
    expect((await rpc(env, token, "prompts/list")).body?.error).toEqual(golden.unknownMethodLegacy);
    const modern = await rpc(env, token, "prompts/list", {}, { modern: true });
    expect([modern.response.status, modern.body?.error]).toEqual([
      404,
      golden.unknownMethodModern.body.error
    ]);
    expect(
      (await rpc(env, token, "resources/read", { uri: "ui://grabient/v9/none.html" })).body?.error
    ).toEqual(golden.missingResource);
    expect((await call(env, token, "list_gallery", { order: "trending" })).result).toEqual(
      golden.argsRefusal
    );
  });

  it("serves the skill with the digest and size of the bytes it reads", async () => {
    const env = testEnv();
    const { token } = await connected(env);
    const bytes = new TextEncoder().encode(skillMd.replaceAll("{origin}", ORIGIN));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    const listed = (await rpc(env, token, "skills/list")).body?.result.skills[0];
    expect(listed.resources).toEqual([
      { uri: "skill://grabient/SKILL.md", digest: `sha256:${digest}`, size: bytes.length }
    ]);
    const read = (await rpc(env, token, "resources/read", { uri: "skill://grabient/SKILL.md" }))
      .body?.result;
    expect(read.contents[0].text).toBe(new TextDecoder().decode(bytes));
    const view = (
      await rpc(env, token, "resources/read", { uri: "ui://grabient/v1/palettes.html" })
    ).body?.result;
    expect(view.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    expect(view.contents[0].text).toContain(`<meta name="grabient-origin" content="${ORIGIN}">`);
  });
});

/* The fixtures are grabient4's lists as they went out, with the words that told the model what to do rewritten
   (tools.test.ts checks the words of every tool and argument). */
describe("the tools", () => {
  it("are the account's fourteen, as the fixture lists them", async () => {
    const env = testEnv();
    const { token } = await connected(env);
    const tools = (await rpc(env, token, "tools/list")).body?.result.tools;
    expect(JSON.stringify(tools)).toBe(JSON.stringify(accountGolden));
    for (const tool of tools as { description: string }[])
      expect(tool.description.length).toBeLessThan(450);
    expect(JSON.stringify({ tools }).length).toBeLessThan(17_000);
  });

  it("are the admins' twenty-eight more for an admin who chose them, every hint stated", async () => {
    const env = testEnv();
    const { token } = await connected(env, { admin: true });
    const tools = (await rpc(env, token, "tools/list")).body?.result.tools as {
      name: string;
    }[];
    // an admin's own collections may be public, so changing one reaches the site
    for (const tool of tools.slice(0, 14)) {
      const golden = accountGolden.find(listed => listed.name === tool.name)!;
      const open = tool.name === "save_collection" || tool.name === "delete_collection";
      expect(tool).toEqual({
        ...golden,
        annotations: {
          ...golden.annotations,
          openWorldHint: open || golden.annotations.openWorldHint
        }
      });
    }
    // byte for byte, so each tool's annotations state every hint in the protocol's order
    expect(JSON.stringify(tools.slice(14))).toBe(JSON.stringify(adminGolden));
  });

  it("answer an account's own questions from the database", async () => {
    const env = testEnv();
    const { account, token } = await connected(env);
    await run(
      env.DB,
      "UPDATE auth_user SET name = ' Ada ', username = 'ada' WHERE id = ?",
      account.id
    );
    const now = Date.now();
    for (const [i, seed] of [SEED, OTHER].entries()) {
      await run(
        env.DB,
        "INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at, title) VALUES (?, ?, 7, 'linearGradient', 90, ?, ?)",
        account.id,
        seed,
        now + i,
        i ? "Mine" : null
      );
    }
    expect((await call(env, token, "get_account")).value).toEqual({
      name: "Ada",
      username: "ada",
      saved: 2,
      collections: 0,
      savedPage: `${ORIGIN}/palettes/saved`
    });
    const saved = (await call(env, token, "list_saved_palettes")).value;
    expect(saved.total).toBe(2);
    expect(
      saved.palettes.map((p: { seed: string; named?: boolean }) => [p.seed, p.named ?? false])
    ).toEqual([
      [OTHER, true],
      [SEED, false]
    ]);
  });

  it("make and change palettes from hex colors without saving anything", async () => {
    const env = testEnv();
    const { token } = await connected(env);
    const made = (
      await call(env, token, "compose_palette", {
        palettes: [{ colors: ["#050B2E", "#0052FF", "#4CC9F0"] }]
      })
    ).value;
    const card = made.palettes[0];
    expect(card.colors).toEqual(["#050b2e", "#0052ff", "#4cc9f0"]);
    // Claude draws the view, so no picture's address is named
    expect(card.files).toBeUndefined();
    const changed = (
      await call(env, token, "adjust_palette", { seed: card.seed, variants: [{ reverse: true }] })
    ).value;
    expect(changed.palettes[0].colors).toEqual(["#4cc9f0", "#0052ff", "#050b2e"]);
    expect(
      (await call(env, token, "adjust_palette", { seed: card.seed, variants: [{ lighten: 70 }] }))
        .error
    ).toBe(
      "variant 1: lighten is -1 to 1, the share of the way to white, or below 0 to black, so 70 is 0.7."
    );
  });

  it("show palettes as tiles: the view's data for an app that draws it, each picture's address for one that does not", async () => {
    const env = testEnv();
    const drawn = await connected(env);
    const shown = await call(env, drawn.token, "show_palettes", {
      palettes: [
        { seed: SEED, title: "Mine" },
        SEED,
        { seed: OTHER, style: "radialSwatches", steps: 5 }
      ]
    });
    expect(shown.value.tiles.map((tile: { tile: number }) => tile.tile)).toEqual([1, 2]);
    expect(shown.result._meta).toEqual({
      "com.grabient/view": {
        origin: ORIGIN,
        tiles: [
          { tile: 1, seed: SEED, style: "linearGradient", steps: 7, angle: 90, title: "Mine" },
          { tile: 2, seed: OTHER, style: "radialSwatches", steps: 5, angle: 90 }
        ]
      }
    });
    const plain = await connected(env, { registered: true });
    const words = await call(env, plain.token, "show_palettes", { palettes: [SEED] });
    expect(words.result._meta).toBeUndefined();
    expect(words.value.tiles[0].png).toBe(`${ORIGIN}/${SEED}.png`);
  });

  it("save a palette new to Grabient into the gallery, and keep its first view", async () => {
    const env = testEnv();
    const { token } = await connected(env);
    const SEED = fresh();
    const first = (await call(env, token, "save_palette", { seed: SEED, style: "linearSwatches" }))
      .value;
    expect(first).toMatchObject({
      seed: SEED,
      saved: true,
      published: true,
      style: "linearSwatches"
    });
    const again = (await call(env, token, "save_palette", { seed: SEED, style: "radialGradient" }))
      .value;
    expect(again).toMatchObject({
      style: "linearSwatches",
      note: "It was saved before and keeps the view it was first saved in."
    });
    expect((await call(env, token, "save_palette", { seed: SEED, title: "" })).error).toBe(
      "title is 1 to 80 characters."
    );
  });

  it("save nothing while an admin has saving off, say so, and still read", async () => {
    const env = testEnv();
    const { account, token } = await connected(env);
    const SEED = fresh();
    const paused =
      "Grabient has paused saving for every account. Nothing was changed. Try again in 5 minutes.";
    const admin = await makeAdmin(env);
    await setFlag(env, "saving", false, admin.id);
    try {
      expect((await call(env, token, "save_palette", { seed: SEED })).error).toBe(paused);
      expect(
        (await call(env, token, "save_collection", { title: "Warm", palettes: [{ seed: SEED }] }))
          .error
      ).toBe(paused);
      expect(
        await count(env, "SELECT COUNT(*) AS n FROM k_likes WHERE user_id = ?", account.id)
      ).toBe(0);
      expect((await call(env, token, "list_saved_palettes")).value).toMatchObject({ total: 0 });
    } finally {
      await setFlag(env, "saving", true, admin.id);
    }
    expect((await call(env, token, "save_palette", { seed: SEED })).value).toMatchObject({
      saved: true
    });
  });

  it("allow an admin's app on staging a hundred times an account's saves, and any other account production's", async () => {
    const env = testEnv({ DEPLOYMENT: "staging" });
    const reader = await connected(env);
    const admin = await connected(env, { admin: true });
    for (const { account } of [reader, admin])
      await checkLimits(env, [[`user:${account.id}`, "toggleLike", 20]]);
    expect((await call(env, reader.token, "save_palette", { seed: fresh() })).error).toMatch(
      /^This account's limit of 20 saves a minute is reached\./
    );
    expect((await call(env, admin.token, "save_palette", { seed: fresh() })).value).toMatchObject({
      saved: true
    });
  });

  it("search the gallery as the site's own search does, and count a person's words once a day", async () => {
    const env = testEnv();
    const seeds = await shippedGallery(env);
    const { token } = await connected(env);
    const words = (await call(env, token, "search_palettes", { query: "sunset", limit: 2 })).value;
    expect(words).toMatchObject({
      query: "sunset",
      read: { words: ["sunset"] },
      total: 96,
      page: 1,
      limit: 2
    });
    expect(Object.keys(words.palettes[0])).toEqual([
      "seed",
      "url",
      "title",
      "colors",
      "style",
      "steps",
      "angle",
      "likes"
    ]);
    const next = (await call(env, token, "search_palettes", { query: "sunset", limit: 2, page: 2 }))
      .value;
    const seedsOf = (answer: { palettes: { seed: string }[] }) => answer.palettes.map(p => p.seed);
    expect(seedsOf(next)).toHaveLength(2);
    expect(seedsOf(next)).not.toEqual(expect.arrayContaining(seedsOf(words)));
    // a palette's address is a search for the palettes like it, itself left out
    const like = (
      await call(env, token, "search_palettes", {
        query: `${ORIGIN}/ja/${seeds[0]}.png?style=radialSwatches`,
        limit: 5
      })
    ).value;
    expect(like.query).toBe(seeds[0]);
    expect(seedsOf(like)).toHaveLength(5);
    expect(seedsOf(like)).not.toContain(seeds[0]);
    const near = (await call(env, token, "search_palettes", { colors: ["#ff0000", "0000ff"] }))
      .value;
    expect(near.palettes).toHaveLength(12);
    expect((await call(env, token, "search_palettes", { colors: ["red"] })).error).toBe(
      'color 1 is "red", and a color is taken as hex: #rrggbb or #rgb.'
    );
    expect((await call(env, token, "search_palettes", {})).error).toBe(
      "Send query, colors or both."
    );
    expect((await call(env, token, "search_palettes", { query: "w ".repeat(60) })).error).toBe(
      "query is at most 100 characters of words or hex codes."
    );
    // words nothing here reads, on a deploy with no model to ask
    expect(
      (await call(env, token, "search_palettes", { query: "zzqxv flurbish" })).value
    ).toMatchObject({
      read: { words: [], notRead: ["zzqxv", "flurbish"] },
      total: 0,
      palettes: [],
      note: "Reading new words with the search model is turned off. The search reads common color, mood and theme words, hex codes and seeds."
    });
    // the words were counted under the apps' page, once however often the account asks, and a palette never is
    await call(env, token, "search_palettes", { query: "sunset" });
    const counted = (table: string) =>
      all<{ page: string; words: string; count: number }>(
        env.DB,
        `SELECT page, words, count FROM ${table} WHERE words IN ('sunset', 'zzqxv flurbish', ?)`,
        seeds[0]!
      );
    expect(await counted("k_search_counts")).toEqual([{ page: "mcp", words: "sunset", count: 1 }]);
    expect(await counted("k_search_unread")).toEqual([
      { page: "mcp", words: "zzqxv flurbish", count: 1 }
    ]);
  });

  it("browse the gallery and read public collections, each palette in its view there", async () => {
    const env = testEnv();
    const seeds = await shippedGallery(env);
    // three palettes of five colors or fewer, so each view below is one the collection may hold as written
    const [a, b, c] = seeds.filter(seed => seed.length <= 20).slice(0, 3) as [
      string,
      string,
      string
    ];
    await run(env.DB, "UPDATE k_palettes SET likes_count = 7 WHERE seed = ?", b);
    const { token } = await connected(env);
    const popular = (await call(env, token, "list_gallery", { limit: 500 })).value;
    expect(popular).toMatchObject({ page: 1, limit: 48 });
    expect(popular.total).toBeGreaterThanOrEqual(seeds.length);
    expect(popular.palettes[0]).toMatchObject({ seed: b, likes: 7 });
    const title = unique("Harbor lights");
    const { slug } = await createCollection(
      env,
      { kind: "agent", id: "grabient" },
      {
        title,
        description: "Evening water.",
        tags: ["harbor"],
        visibility: "public",
        items: [
          { seed: a, style: "linearGradient", steps: 7, angle: 90 },
          { seed: b, style: "radialSwatches", steps: 5, angle: 90 },
          { seed: c, style: "linearGradient", steps: 9, angle: 45 }
        ]
      }
    );
    const found = (await call(env, token, "search_collections", { query: title })).value;
    expect(found.collections).toEqual([
      {
        slug,
        url: `${ORIGIN}/${slug}`,
        title,
        description: "Evening water.",
        tags: ["harbor"],
        palettes: 3,
        visibility: "public",
        updatedAt: new Date().toISOString().slice(0, 10),
        first: [
          `${ORIGIN}/${a}`,
          `${ORIGIN}/${b}?style=radialSwatches&steps=5`,
          `${ORIGIN}/${c}?steps=9&angle=45`
        ]
      }
    ]);
    // by its address in any language, a page at a time
    const read = (
      await call(env, token, "get_collection", {
        slug: `${ORIGIN}/ja/${slug}?x=1#top`,
        page: 2,
        limit: 2
      })
    ).value;
    expect(read).toMatchObject({ slug, title, mine: false, total: 3, page: 2, limit: 2 });
    expect(read.palettes).toEqual([
      expect.objectContaining({ seed: c, style: "linearGradient", steps: 9, angle: 45, likes: 0 })
    ]);
    const inspected = (
      await call(env, token, "inspect_palettes", { palettes: [b, { seed: fresh() }] })
    ).value.palettes;
    expect(inspected[0]).toMatchObject({
      seed: b,
      gallery: { likes: 7, style: "linearGradient", steps: 7, angle: 90 },
      collections: [slug]
    });
    expect(inspected[0].details[0]).toEqual({
      hex: inspected[0].colors[0],
      name: expect.any(String),
      onWhite: expect.any(Number),
      onBlack: expect.any(Number)
    });
    expect(inspected[1]).toMatchObject({ gallery: null, collections: [] });
  });

  it("keep an account's own private collections: made, changed, moved by a new title and deleted", async () => {
    const watched = watchLimits(testEnv());
    const env = watched.env;
    const { account, token } = await connected(env);
    const [a, b, c] = [fresh(), fresh(), fresh()];
    watched.asked.length = 0;
    const made = (
      await call(env, token, "save_collection", {
        title: "Warm",
        palettes: [{ seed: a }, { seed: b }]
      })
    ).value;
    const handle = `_${account.id.replace(/[^a-z0-9]/g, "").slice(0, 10)}`;
    expect(made).toMatchObject({
      slug: `@${handle}/warm`,
      url: `${ORIGIN}/@${handle}/warm`,
      title: "Warm",
      visibility: "private",
      palettes: 2,
      added: [a, b]
    });
    // an app's change counts against the account's day and the apps' own, never the site's pages'
    expect(watched.asked).toEqual(
      expect.arrayContaining(["collectionWriteDaily", "mcpCollectionWritesSite"])
    );
    expect(watched.asked).not.toContain("collectionWritesSite");
    expect((await call(env, token, "save_collection", { palettes: [{ seed: a }] })).error).toBe(
      "Titles are 1 to 80 characters."
    );
    expect((await call(env, token, "get_account")).value).toMatchObject({ collections: 1 });
    const changed = (
      await call(env, token, "save_collection", {
        slug: made.slug,
        title: "Warmer",
        add: [{ seed: c }, { seed: b }],
        remove: [a]
      })
    ).value;
    expect(changed).toMatchObject({
      slug: `@${handle}/warmer`,
      movedFrom: made.slug,
      palettes: 2,
      added: [c],
      alreadyIn: [b],
      removed: [a]
    });
    const redrawn = (
      await call(env, token, "save_collection", {
        slug: changed.slug,
        palettes: [{ seed: b, style: "linearSwatches" }, { seed: c }],
        tags: ["Warm", "dusk"]
      })
    ).value;
    expect(redrawn).toMatchObject({ tags: ["warm", "dusk"], kept: [c], redrawn: [b] });
    expect(
      (await call(env, token, "save_collection", { slug: changed.slug, remove: [b, c] })).error
    ).toBe("This would empty the collection, and a collection keeps at least one palette.");
    const mine = (await call(env, token, "list_my_collections")).value;
    expect(mine).toMatchObject({ total: 1, collections: [{ slug: changed.slug, palettes: 2 }] });
    expect((await call(env, token, "get_collection", { slug: changed.slug })).value).toMatchObject({
      mine: true,
      visibility: "private",
      total: 2
    });
    // a private collection is its owner's alone
    const other = await connected(env);
    expect((await call(env, other.token, "get_collection", { slug: changed.slug })).error).toBe(
      "No collection of yours and no public one has this address."
    );
    for (const [tool, args] of [
      ["save_collection", { slug: changed.slug, title: "Theirs" }],
      ["delete_collection", { slug: changed.slug }]
    ] as const)
      expect((await call(env, other.token, tool, args)).error).toBe(
        "No collection of yours has this address."
      );
    expect(
      (await call(env, token, "delete_collection", { slug: `${ORIGIN}/${changed.slug}/` })).value
    ).toEqual({ deleted: changed.slug });
    expect((await call(env, token, "delete_collection", { slug: changed.slug })).error).toBe(
      "No collection of yours has this address."
    );
  });

  it("save a palette a public collection holds in its view there, under the account's own title", async () => {
    const watched = watchLimits(testEnv());
    const env = watched.env;
    const held = fresh();
    await createCollection(
      env,
      { kind: "agent", id: "grabient" },
      {
        title: unique("Held"),
        description: "",
        tags: [],
        visibility: "public",
        items: [{ seed: held, style: "radialSwatches", steps: 9, angle: 90 }]
      }
    );
    const { account, token } = await connected(env);
    watched.asked.length = 0;
    const saved = (await call(env, token, "save_palette", { seed: held, title: "  Mine   own " }))
      .value;
    // it joins the gallery as the site already shows it, and that is no news of the account's making
    expect(saved).toEqual({
      seed: held,
      url: `${ORIGIN}/${held}?style=radialSwatches&steps=9`,
      style: "radialSwatches",
      steps: 9,
      angle: 90,
      saved: true,
      title: "Mine own",
      likes: 1
    });
    expect(await galleryPalette(env, held)).toMatchObject({ style: "radialSwatches", steps: 9 });
    // an app's save counts against the account's day and the apps' own, never the site's hearts'
    expect(watched.asked).toEqual(expect.arrayContaining(["toggleLikeDaily", "mcpLikesDaily"]));
    expect(watched.asked).not.toContain("likesDaily");
    expect((await call(env, token, "list_saved_palettes")).value.palettes).toEqual([
      expect.objectContaining({ seed: held, title: "Mine own", named: true, likes: 1 })
    ]);
    // taken out, it is named in the view its like was kept in
    expect((await call(env, token, "save_palette", { seed: held, saved: false })).value).toEqual({
      seed: held,
      url: `${ORIGIN}/${held}?style=radialSwatches&steps=9`,
      style: "radialSwatches",
      steps: 9,
      angle: 90,
      saved: false,
      likes: 0,
      note: "It is out of the saved palettes and stays in the public gallery."
    });
    // an account's apps bring fifty palettes new to Grabient a day; one it already holds is no such save
    await checkLimits(env, [[`user:${account.id}`, "mcpPublishDaily", 50]]);
    expect((await call(env, token, "save_palette", { seed: fresh() })).error).toMatch(
      /^This account's limit of 50 saves of palettes new to Grabient a day is reached\./
    );
    expect((await call(env, token, "save_palette", { seed: held })).value).toMatchObject({
      saved: true
    });
  });
});

describe("the admins' tools", () => {
  it("make personas, plan their likes, and apply what is due", async () => {
    const env = testEnv();
    const { token } = await connected(env, { admin: true });
    const SEED = fresh();
    await run(
      env.DB,
      "INSERT INTO k_palettes (seed, style, steps, angle, created_at) VALUES (?, 'linearGradient', 7, 90, ?) ON CONFLICT DO NOTHING",
      SEED,
      Date.now()
    );
    const personas = (
      await call(env, token, "personas", {
        add: [{ handle: "ash", taste: ["dusk", "dusk", "Dark"] }]
      })
    ).value;
    expect(personas.personas).toContainEqual({
      handle: "ash",
      name: "ash",
      taste: ["dusk"],
      likes: 0
    });
    const due = new Date(Date.now() - 60_000).toISOString();
    const planned = (
      await call(env, token, "schedule", {
        label: "test batch",
        items: [
          { kind: "like", due, persona: "ash", seed: SEED },
          { kind: "like", due, persona: "nobody", seed: SEED }
        ]
      })
    ).value;
    expect(planned).toMatchObject({
      label: "test batch",
      queued: 1,
      skipped: [{ item: 2, why: "persona is the handle of one of the site's personas." }]
    });
    const again = (
      await call(env, token, "schedule", {
        label: "test batch",
        items: [{ kind: "like", due, persona: "ash", seed: SEED }]
      })
    ).value;
    expect(again).toMatchObject({ queued: 0, alreadyScheduled: 1 });
    const report = await applyQueue(env);
    expect(report).toMatchObject({ done: 1, failed: 0 });
    const listed = (await call(env, token, "schedule_list", { status: ["done"] })).value;
    expect(listed.items).toEqual([
      expect.objectContaining({
        kind: "like",
        status: "done",
        persona: "ash",
        seed: SEED,
        label: "test batch"
      })
    ]);
    const log = (await call(env, token, "contribution_log", { tool: "schedule" })).value;
    expect(log.changes[0]).toMatchObject({ app: "Claude", tool: "schedule", target: "test batch" });
  });

  it("record reviews and read the admins' record", async () => {
    const env = testEnv();
    const { account, token } = await connected(env, { admin: true });
    const SEED = fresh();
    const marked = await call(env, token, "review_mark", {
      run: "pass 1",
      reviews: [
        { seed: SEED, verdict: "good" },
        { seed: SEED, verdict: "bad", search: "Sea  Glass" }
      ]
    });
    expect(marked.value).toEqual({ recorded: 2 });
    const reviews = (await call(env, token, "review_list", { search: "sea glass" })).value;
    expect(reviews.reviews).toEqual([
      expect.objectContaining({
        seed: SEED,
        about: "search:sea glass",
        verdict: "bad",
        run: "pass 1"
      })
    ]);
    await recordAction(env, {
      actorId: account.id,
      action: "remove",
      seed: SEED,
      why: { reasons: ["muddy", "nope"], comment: " too\ndull " }
    });
    const record = (await call(env, token, "curation_record", { kinds: ["remove"], seed: SEED }))
      .value;
    expect(record.actions[0]).toMatchObject({
      action: "remove",
      seed: SEED,
      reasons: ["muddy"],
      comment: "too dull"
    });
    const standing = (await call(env, token, "palette_standing", { seeds: [SEED] })).value;
    expect(standing.palettes[0]).toMatchObject({ seed: SEED, locked: false, takenOutBefore: true });
  });

  it("read what Grabient's collections lack in a language, and keep a translation", async () => {
    const env = testEnv();
    const { token } = await connected(env, { admin: true });
    const { slug } = await createCollection(
      env,
      { kind: "agent", id: "grabient" },
      {
        title: "Sunset gradients",
        description: "",
        tags: [],
        visibility: "public",
        items: [{ seed: SEED, style: "linearGradient", steps: 7, angle: 90 }]
      }
    );
    const missing = (await call(env, token, "translations", { language: "zh-Hans" })).value;
    const entry = missing.items.find((item: { slug: string }) => item.slug === slug);
    expect(entry).toMatchObject({ title: "Sunset gradients" });
    const kept = (
      await call(env, token, "translations_save", {
        language: "zh-Hans",
        collections: [{ slug, source: entry.source, title: "日落渐变" }]
      })
    ).value;
    expect(kept).toEqual({ language: "zh-Hans", kept: { collections: [slug], tags: [] } });
    const refused = (
      await call(env, token, "translations_save", {
        language: "zh-Hans",
        collections: [{ slug, source: entry.source, title: "Sunset" }]
      })
    ).value;
    expect(refused.refused).toEqual([{ slug, why: "It isn't written in Chinese (Simplified)." }]);
  });

  it("publish palettes and a collection as Grabient, and leave out what an admin took out", async () => {
    const env = testEnv();
    const { account, token } = await connected(env, { admin: true });
    const [p, r, s, out] = [fresh(), fresh(), fresh(), fresh()];
    const blue = encodePalette(anchorsFromHexes(["#0a2a6b", "#1d4ed8"])!);
    await recordAction(env, { actorId: account.id, action: "delete", seed: out });
    const published = (
      await call(env, token, "gallery_publish", {
        palettes: [
          { seed: p, title: "Quiet evening", description: "A calm one." },
          { seed: r, style: "angularSwatches", steps: 9 },
          { seed: blue, title: "Amber dusk" },
          out
        ]
      })
    ).value;
    // a palette joins whatever becomes of its title, and a title its colors contradict is not written
    expect(published).toEqual({
      published: [p, r, blue],
      leftOut: [out],
      untitled: [{ seed: blue, words: ["amber"] }],
      untitledWhy: "Not written: the palette shows nothing these words name."
    });
    expect(await galleryPalette(env, r)).toMatchObject({ style: "angularSwatches", steps: 9 });
    // new to the gallery, each stands in the hot order at once
    expect(
      await count(
        env,
        "SELECT COUNT(*) AS n FROM k_palettes WHERE seed IN (?, ?, ?) AND hot = 0.5",
        p,
        r,
        blue
      )
    ).toBe(3);
    expect((await call(env, token, "gallery_publish", { palettes: [out] })).error).toBe(
      "Nothing to publish: every palette here was taken out by an admin before."
    );
    const titled = (await call(env, token, "inspect_palettes", { palettes: [p, blue] })).value;
    expect(titled.palettes.map((card: { title: string }) => card.title)).toEqual([
      "Quiet evening",
      expect.stringContaining("blue")
    ]);

    const slug = unique("tide-pools");
    const url = `${ORIGIN}/${slug}`;
    expect(
      (
        await call(env, token, "collection_publish", {
          slug,
          title: "Tide pools",
          tags: ["Sea"],
          palettes: [p, { seed: s, title: "Slow morning" }, out],
          gallery: true
        })
      ).value
    ).toEqual({ slug, url, status: "created", added: 2, leftOut: [out] });
    expect(await galleryPalette(env, s)).toMatchObject({ seed: s });
    // with its slug it only adds, and replaces the words given
    expect(
      (
        await call(env, token, "collection_publish", {
          slug,
          description: "Low water.",
          palettes: [p, fresh()]
        })
      ).value
    ).toEqual({ slug, url, status: "updated", added: 1 });
    expect((await collectionRecord(env, slug))?.input).toMatchObject({
      title: "Tide pools",
      description: "Low water.",
      tags: ["sea"],
      visibility: "public"
    });
    expect(
      (
        await call(env, token, "collection_publish", {
          slug: "about",
          title: "About",
          palettes: [p]
        })
      ).error
    ).toBe(
      "That address cannot be a collection's: use lowercase letters, digits and hyphens, and no word the site reserves."
    );
    const theirs = await createCollection(
      env,
      { kind: "user", id: account.id },
      {
        title: unique("Mine"),
        description: "",
        tags: [],
        visibility: "public",
        items: [{ seed: p, style: "linearGradient", steps: 7, angle: 90 }]
      }
    );
    expect(
      (await call(env, token, "collection_publish", { slug: theirs.slug, palettes: [s] })).error
    ).toBe("That address belongs to another collection.");
    const log = (await call(env, token, "contribution_log", { tool: "collection_publish" })).value;
    expect(log.changes[0]).toMatchObject({
      app: "Claude",
      tool: "collection_publish",
      target: slug,
      detail: { status: "updated", added: 1, titles: 0, gallery: false }
    });
  });

  it("redraw, replace and delete what the site made, each on the record, and never what a person liked", async () => {
    const env = testEnv();
    const { token } = await connected(env, { admin: true });
    const [p, q, liked] = [fresh(), fresh(), fresh()];
    const slug = unique("shore");
    await call(env, token, "collection_publish", {
      slug,
      title: "Shore",
      palettes: [{ seed: p, title: "Quiet evening" }, liked],
      gallery: true
    });
    const reader = await makeAccount(env);
    await run(
      env.DB,
      "INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at) VALUES (?, ?, 7, 'linearGradient', 90, ?)",
      reader.id,
      liked,
      Date.now()
    );
    const LOCKED =
      "A person liked this palette, so it stays as it is. Publish an improved palette beside it instead.";
    for (const [tool, args] of [
      ["palette_view", { seed: liked, style: "radialGradient" }],
      ["palette_replace", { from: liked, to: q }],
      ["palette_remove", { seed: liked }]
    ] as const)
      expect((await call(env, token, tool, args)).error).toBe(LOCKED);

    const steps = (await galleryPalette(env, p))!.steps;
    expect(
      (
        await call(env, token, "palette_view", {
          seed: p,
          style: "radialGradient",
          reasons: ["form", "nope"],
          comment: " better\nround "
        })
      ).value
    ).toEqual({ seed: p, style: "radialGradient", steps, angle: 90, changed: true });
    expect(
      (await call(env, token, "palette_view", { seed: p, style: "radialGradient" })).value
    ).toMatchObject({
      changed: false
    });
    expect((await call(env, token, "palette_view", { seed: p, steps: 500 })).error).toBe(
      "Send the style, steps or angle to change, each valid."
    );
    expect(
      (await call(env, token, "palette_view", { seed: p, collection: slug, angle: 45 })).value
    ).toEqual({
      seed: p,
      collection: slug,
      style: "linearGradient",
      steps,
      angle: 45,
      changed: true
    });
    expect((await collectionRecord(env, slug))?.input.items[0]).toMatchObject({
      seed: p,
      angle: 45
    });

    expect(
      (await call(env, token, "palette_replace", { from: p, to: q, reasons: ["dull"] })).value
    ).toEqual({ from: p, to: q, url: `${ORIGIN}/${q}`, gallery: true, collections: [slug] });
    // the new palette stands where the old one stood, drawn as it was, under its title
    const standing = (await call(env, token, "palette_standing", { seeds: [q, p] })).value.palettes;
    expect(standing[0]).toMatchObject({
      seed: q,
      title: "Quiet evening",
      locked: false,
      likes: { admins: 0, readers: 0, personas: 0, oldSite: 0 },
      gallery: { style: "radialGradient", angle: 90 },
      collections: [{ slug, position: 0, style: "linearGradient", angle: 45 }]
    });
    expect(standing[1]).toMatchObject({
      seed: p,
      gallery: null,
      collections: [],
      takenOutBefore: true
    });
    expect((await call(env, token, "palette_replace", { from: q, to: p })).error).toBe(
      "An admin took the new palette out before. It stays out."
    );

    expect(
      (await call(env, token, "palette_remove", { seed: q, reasons: ["dull"], comment: "flat" }))
        .value
    ).toEqual({ deleted: q, gallery: true, collections: [slug] });
    expect(await galleryPalette(env, q)).toBeNull();
    expect((await collectionRecord(env, slug))?.input.items.map(item => item.seed)).toEqual([
      liked
    ]);
    const record = (await call(env, token, "curation_record", { collection: slug })).value;
    expect(
      record.actions.map((action: { action: string; seed: string }) => [action.action, action.seed])
    ).toEqual([
      ["remove", q],
      ["edit", p],
      ["view", p]
    ]);
    expect(record.actions[2]).toMatchObject({
      collection: slug,
      before: { style: "linearGradient", steps, angle: 90 },
      after: { style: "linearGradient", steps, angle: 45, via: "mcp", app: "Claude" }
    });
    const whole = (await call(env, token, "curation_record", { seed: p, kinds: ["view"] })).value;
    expect(whole.actions.at(-1)).toMatchObject({
      action: "view",
      reasons: ["form"],
      comment: "better round",
      before: { style: "linearGradient" },
      after: { style: "radialGradient", via: "mcp", app: "Claude" }
    });
    expect(whole.counts.view).toBeGreaterThanOrEqual(2);
  });

  it("read a Grabient collection as the admins judge it, and take out all but what an admin liked", async () => {
    const env = testEnv();
    const { account, token } = await connected(env, { admin: true });
    const [kept, gone, absent] = [fresh(), fresh(), fresh()];
    const slug = unique("lagoon");
    await call(env, token, "collection_publish", {
      slug,
      title: "Lagoon",
      palettes: [kept, { seed: gone, title: "Slow morning" }]
    });
    // an admin's save through an app is the admin's own like, kept with how it was made
    await call(env, token, "save_palette", { seed: kept });
    const record = (await collectionRecord(env, slug))!;
    await addNote(env, record.id, account.id, "First note");
    await addNote(env, record.id, account.id, "Second note");
    const reader = await makeAccount(env);
    await castFitVote(env, record.id, gone, reader.id, "down");
    await call(env, token, "review_mark", {
      reviews: [{ seed: gone, verdict: "bad", collection: slug, note: "too loud" }]
    });

    const listed = (await call(env, token, "site_collections", { query: "LAGOON" })).value;
    expect(listed.collections).toContainEqual(
      expect.objectContaining({ slug, title: "Lagoon", palettes: 2, liked: 1, reviewed: 1 })
    );
    const read = (await call(env, token, "site_collection", { slug })).value;
    expect(read).toMatchObject({ slug, title: "Lagoon", visibility: "public" });
    expect(read.notes.map((note: { text: string }) => note.text)).toEqual([
      "First note",
      "Second note"
    ]);
    expect(read.items).toEqual([
      expect.objectContaining({ n: 1, seed: kept, likes: 1, liked: true, locked: true }),
      expect.objectContaining({
        n: 2,
        seed: gone,
        likes: 0,
        title: "Slow morning",
        fit: { up: 0, down: 1 },
        reviews: [{ about: "fit", verdict: "bad", note: "too loud" }]
      })
    ]);
    expect(read.items[1].liked ?? read.items[1].locked).toBeUndefined();
    const likes = (await call(env, token, "liked_palettes", { collection: slug })).value;
    expect(likes).toMatchObject({
      total: 1,
      palettes: [{ seed: kept, from: { via: "mcp" }, in: [slug] }]
    });

    expect(
      (
        await call(env, token, "collection_remove_palettes", {
          slug,
          seeds: [kept, gone, absent],
          reasons: ["off"]
        })
      ).value
    ).toEqual({
      slug,
      removed: [gone],
      keptBecauseAnAdminLikedThem: [kept],
      notInTheCollection: [absent]
    });
    expect((await collectionRecord(env, slug))?.input.items.map(item => item.seed)).toEqual([kept]);
    // taken out, it never returns: a plan that names it leaves it out
    const due = new Date(Date.now() - 60_000).toISOString();
    await call(env, token, "schedule", {
      items: [{ kind: "collection", due, slug, palettes: [gone, absent] }]
    });
    const applied = await applyQueue(env);
    expect(applied?.items.at(-1)?.result).toMatchObject({
      slug,
      status: "updated",
      added: 1,
      skipped: [gone]
    });
    expect((await collectionRecord(env, slug))?.input.items.map(item => item.seed)).toEqual([
      kept,
      absent
    ]);
  });

  it("apply a planned collection when it is due, then compute the gallery's scores again", async () => {
    const env = testEnv();
    const { token } = await connected(env, { admin: true });
    const [a, b] = [fresh(), fresh()];
    const slug = unique("new-tides");
    const due = new Date(Date.now() - 60_000).toISOString();
    const planned = (
      await call(env, token, "schedule", {
        label: "tides",
        items: [
          {
            kind: "collection",
            due,
            slug,
            title: "New tides",
            palettes: [{ seed: a, title: "Slow morning" }, b]
          },
          { kind: "collection", due, slug: "about", title: "About", palettes: [a] }
        ]
      })
    ).value;
    expect(planned).toMatchObject({
      label: "tides",
      queued: 1,
      skipped: [{ item: 2, why: "payload.slug names the collection." }]
    });
    const report = await applyQueue(env);
    expect(
      report?.items.find(item => (item.result as { slug?: string }).slug === slug)
    ).toMatchObject({
      kind: "collection",
      status: "done",
      result: { slug, status: "created", added: 2, held: 0, skipped: [], texts: 1 }
    });
    expect(report?.scores).toMatchObject({ palettes: expect.any(Number) });
    expect((await collectionRecord(env, slug))?.input).toMatchObject({
      title: "New tides",
      visibility: "public",
      items: [{ seed: a }, { seed: b }]
    });
    // nothing due is nothing to say, so the job logs nothing
    expect(await applyQueue(env)).toBeUndefined();
  });

  it("schedule the tags under the search from the vocabulary alone, and rank what people search for", async () => {
    const env = testEnv();
    const { token } = await connected(env, { admin: true });
    const label = unique("autumn");
    const read = (await call(env, token, "search_tags")).value;
    expect(read.now).toHaveLength(24);
    expect(read.now).toContain("sunset");
    const added = (
      await call(env, token, "search_tags", {
        label,
        add: [
          { words: "Ocean" },
          { words: "zzqx flurb" },
          { words: "autumn", from: "2027-01-01", until: "2027-01-03" }
        ]
      })
    ).value;
    expect(added).toMatchObject({
      added: 2,
      refused: [
        {
          words: "zzqx flurb",
          why: "The site does not answer these words as one search of its vocabulary."
        }
      ]
    });
    // a tag scheduled for now leads the row; one for later waits
    expect(added.now[0]).toBe("ocean");
    const mine = added.scheduled.filter((tag: { label?: string }) => tag.label === label);
    expect(mine).toEqual([
      expect.objectContaining({ words: "ocean", showing: true }),
      {
        id: expect.stringMatching(/^[a-z0-9]{20}$/),
        words: "autumn",
        from: "2027-01-01T00:00:00.000Z",
        until: "2027-01-04T00:00:00.000Z",
        label,
        showing: false
      }
    ]);
    expect(
      (await call(env, token, "search_tags", { remove: { ids: [mine[0].id] } })).value
    ).toMatchObject({ removed: 1 });
    const after = (await call(env, token, "search_tags", { remove: { label } })).value;
    expect(after.removed).toBe(1);
    expect(after.scheduled.filter((tag: { label?: string }) => tag.label === label)).toEqual([]);
    expect((await call(env, token, "search_tags", { remove: {} })).error).toBe(
      "Name what to remove by ids or by a label."
    );

    // three searches in words nobody reads show as unread; one person's never do
    const today = Math.floor(Date.now() / DAY);
    const words = unique("glorptide").replace(/[^a-z]/g, "");
    await run(
      env.DB,
      "INSERT INTO k_search_unread (day, page, words, count) VALUES (?, 'palettes', ?, 3), (?, 'palettes', ?, 1)",
      today,
      words,
      today,
      `${words} once`
    );
    const demand = (await call(env, token, "search_demand", { limit: 300 })).value;
    expect(demand.searches.slice(0, 2)).toEqual(["blue", "green"]);
    expect(demand.unread).toContain(words);
    expect(demand.unread).not.toContain(`${words} once`);
  });

  it("weigh what readers used by its place, and say how well a search is answered", async () => {
    const env = testEnv();
    const { token } = await connected(env, { admin: true });
    const [first, second] = [fresh(), fresh()];
    const slug = unique("used");
    await call(env, token, "collection_publish", {
      slug,
      title: "Used",
      palettes: [first, second]
    });
    const today = Math.floor(Date.now() / DAY);
    const use = (seed: string, action: string, format: string, position: number, n: number) =>
      run(
        env.DB,
        `INSERT INTO k_palette_use (day, seed, action, format, surface, collection, position, view, count)
         VALUES (?, ?, ?, ?, 'collection', ?, ?, 'linearSwatches:7:90', ?)`,
        today,
        seed,
        action,
        format,
        slug,
        position,
        n
      );
    await use(first, "open", "", 0, 4);
    await use(first, "copy", "css", 0, 9);
    await use(second, "download", "png", 1, 2);
    await run(
      env.DB,
      "INSERT INTO k_palette_use (day, seed, action, surface, collection, count) VALUES (?, '', 'view', 'collection', ?, 30)",
      today,
      slug
    );
    const raw = (await call(env, token, "palette_use", { collection: slug })).value;
    expect(raw).toMatchObject({
      collection: slug,
      days: 28,
      views: 30,
      palettes: [
        { seed: first, opens: 4, takes: 9, formats: { css: 9 }, places: { 1: 13 } },
        { seed: second, opens: 0, takes: 2, formats: { png: 2 }, places: { 2: 2 } }
      ]
    });
    const weighed = (await call(env, token, "visitor_signals", { collection: slug, minUses: 10 }))
      .value;
    expect(weighed).toMatchObject({
      slug,
      views: 30,
      uses: 15,
      opens: 4,
      takes: 11,
      enough: true,
      counted: true,
      // both were drawn as a gradient and taken as swatches
      viewsTaken: { slug, takes: 11, styleChanged: 11 }
    });
    expect(weighed.palettes.map((palette: { seed: string }) => palette.seed)).toEqual([
      first,
      second
    ]);
    expect((await call(env, token, "visitor_signals", { collection: "about" })).error).toBe(
      "That is not a collection slug."
    );

    const words = unique("tarn").replace(/[^a-z]/g, "");
    await run(
      env.DB,
      "INSERT INTO k_search_counts (day, page, words, count, used) VALUES (?, 'palettes', ?, 8, 1), (?, 'mcp', ?, 5, 0)",
      today,
      words,
      today,
      words
    );
    const reader = await makeAccount(env);
    await run(
      env.DB,
      "INSERT INTO k_search_votes (query, seed, user_id, vote, created_at, updated_at) VALUES (?, ?, ?, -1, ?, ?)",
      words,
      first,
      reader.id,
      Date.now(),
      Date.now()
    );
    const searches = (await call(env, token, "search_use", { words })).value;
    // apps' searches are counted by page and left out of each search's own rate
    expect(searches.pages.mcp.count).toBeGreaterThanOrEqual(5);
    expect(searches.searches).toEqual([
      expect.objectContaining({ words, count: 8, used: 1, rate: 0.125, covered: false })
    ]);
    expect(searches.votes).toEqual([{ words, seed: first, up: 0, down: 1 }]);

    const signups = (await call(env, token, "signups", { weeks: 1 })).value;
    expect(signups.accounts).toBeGreaterThanOrEqual(1);
    expect(signups.admins).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(signups)).not.toContain(reader.email);
  });

  it("read the site's own counts through the analytics binding, in the dialect it speaks", async () => {
    const queries: string[] = [];
    const ANALYTICS = {
      async query({ query }: { query: string }) {
        queries.push(query);
        return query.includes("toStartOfDay")
          ? {
              data: [
                { day: "2026-10-13 00:00:00", event: "mcp", n: 3 },
                { day: "2026-10-13 00:00:00", event: "limit", n: 2 }
              ]
            }
          : {
              data: [
                {
                  event: "mcp",
                  a: "account",
                  b: "save_palette",
                  c: "ok",
                  d: "/mcp",
                  e: "Claude",
                  n: 3
                },
                { event: "limit", a: "mcpAccountBudget", b: "site", c: "", d: "", e: "", n: 2 },
                { event: "unknown", a: "x", n: 9 }
              ]
            };
      }
    };
    const env = testEnv({ ANALYTICS, DEPLOYMENT: "staging" });
    const { token } = await connected(env, { admin: true });
    expect((await call(env, token, "site_usage", { days: 3, limit: 1 })).value).toMatchObject({
      dataset: "grabient_staging_usage",
      days: 3,
      empty: false,
      totals: { mcp: 3, limit: 2, oauth: 0 },
      events: {
        mcp: [
          {
            server: "account",
            tool: "save_palette",
            outcome: "ok",
            address: "/mcp",
            client: "Claude",
            count: 3
          }
        ]
      },
      daily: [{ day: "2026-10-13", mcp: 3, limit: 2 }],
      ceilings: [{ limit: "mcpAccountBudget", count: 2 }]
    });
    /* the binding takes one SELECT over one dataset under events.analyticsEngine, bounded below in time, and weighs
       its sums by each point's sample interval itself */
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query).toMatch(/^SELECT /);
      expect(query).toContain(
        "FROM events.analyticsEngine.grabient_staging_usage WHERE timestamp >= NOW() - INTERVAL '3' DAY"
      );
      expect(query).toContain("SUM(double1) AS n");
      expect(query).not.toMatch(/sample_?interval/i);
    }
    const none = { ...env, ANALYTICS: { query: async () => ({ data: [] }) } };
    expect((await call(none, token, "site_usage")).value).toMatchObject({
      empty: true,
      note: "Nothing counted yet: the dataset appears with its first write, after a deploy with the USAGE binding."
    });
    const refusing = {
      ...env,
      ANALYTICS: {
        query: async () => {
          throw new Error("Input was invalid: no such field");
        }
      }
    };
    expect((await call(refusing, token, "site_usage")).error).toBe(
      "Analytics Engine could not be read: Input was invalid: no such field"
    );
  });

  it("say what the site's own counts need when the deploy cannot read them", async () => {
    const env = testEnv({ ANALYTICS: undefined });
    const { token } = await connected(env, { admin: true });
    expect((await call(env, token, "site_usage")).error).toBe(
      "This deploy has no ANALYTICS binding to read its counts with."
    );
  });
});

describe("the directories' proofs", () => {
  it("answer each token exactly as set, and nothing while it is unset", async () => {
    const env = testEnv({
      OPENAI_APPS_CHALLENGE: "challenge-token",
      MCP_REGISTRY_AUTH: "v=MCPv1; k=ed25519; p=abc"
    });
    const challenge = directoryProof(get("/.well-known/openai-apps-challenge"), env);
    expect([challenge.headers.get("Content-Type"), await challenge.text()]).toEqual([
      "text/plain; charset=utf-8",
      "challenge-token"
    ]);
    expect(await directoryProof(get("/.well-known/mcp-registry-auth"), env).text()).toBe(
      "v=MCPv1; k=ed25519; p=abc"
    );
    expect(directoryProof(get("/.well-known/mcp-registry-auth"), testEnv()).status).toBe(404);
  });
});
