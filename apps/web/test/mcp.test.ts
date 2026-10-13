/// <reference types="vite/client" />
import { createExecutionContext } from "cloudflare:test";
import { encodePalette } from "@grabient/engine/codec.ts";
import { randomPalette } from "@grabient/engine/random.ts";
import { describe, expect, it } from "vitest";
import skillMd from "../../../skills/grabient/SKILL.md?raw";
import { run } from "../src/server/db/d1.ts";
import type { Env } from "../src/server/env.ts";
import { setFlag } from "../src/server/flags/flags.ts";
import { applyQueue } from "../src/server/mcp/admin/queue.ts";
import { recordAction } from "../src/server/mcp/admin/record.ts";
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
import { createCollection } from "../src/server/mcp/site.ts";
import { connect } from "./connect.ts";
import {
  type Account,
  address,
  get,
  makeAccount,
  makeAdmin,
  ORIGIN,
  type TestEnv,
  testEnv
} from "./helpers.ts";

/** A fixture as this test's origin answers it: grabient4's were captured at grabient.com. */
const here = <T>(golden: T): T =>
  JSON.parse(JSON.stringify(golden).replaceAll("https://grabient.com", ORIGIN));
const SEED = "kSWUkczDNDewdRK";
const OTHER = "kQf5EOWSTcQ";
/** A palette no other test has touched: the tests of a file share its database. */
const fresh = () => encodePalette(randomPalette());
const MODERN = "2026-07-28";

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
  const response = await serveMcp(
    new Request(`${ORIGIN}/mcp`, {
      method: "POST",
      headers: { ...headers, ...options.headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: sent })
    }),
    env,
    createExecutionContext()
  );
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

/* Words that tell a model what to do: a tool's description says what it does, and the instructions say the order of
   work. */
const ORDERS =
  /\b(must|always|use it|use schedule|read this|check it|give the|give each|make the new seed|spread items)\b/i;
/** The admin tools whose descriptions lost a sentence that told the model what to do. */
const REWORDED = new Set([
  "liked_palettes",
  "visitor_signals",
  "palette_replace",
  "palette_remove",
  "gallery_publish",
  "collection_publish",
  "collection_remove_palettes",
  "schedule",
  "schedule_list",
  "personas"
]);

describe("the tools", () => {
  it("are the account's fourteen, exactly as grabient4 listed them", async () => {
    const env = testEnv();
    const { token } = await connected(env);
    const tools = (await rpc(env, token, "tools/list")).body?.result.tools;
    expect(JSON.stringify(tools)).toBe(JSON.stringify(accountGolden));
    for (const tool of tools as { description: string }[]) {
      expect(tool.description.length).toBeLessThan(450);
      expect(tool.description).not.toMatch(ORDERS);
    }
    expect(JSON.stringify({ tools }).length).toBeLessThan(17_000);
  });

  it("are the admins' twenty-eight more for an admin who chose them, every hint stated and no order given", async () => {
    const env = testEnv();
    const { token } = await connected(env, { admin: true });
    const tools = (await rpc(env, token, "tools/list")).body?.result.tools as {
      name: string;
      description: string;
      annotations: Record<string, unknown>;
    }[];
    const account = tools.slice(0, 14);
    // an admin's own collections may be public, so changing one reaches the site
    for (const tool of account) {
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
    const admin = tools.slice(14);
    expect(admin.map(tool => tool.name)).toEqual(adminGolden.map(tool => tool.name));
    for (const [i, tool] of admin.entries()) {
      const { description, ...rest } = tool;
      const { description: before, ...golden } = adminGolden[i]!;
      expect(rest, tool.name).toEqual(golden);
      expect(Object.keys(tool.annotations)).toEqual([
        "title",
        "readOnlyHint",
        "destructiveHint",
        "idempotentHint",
        "openWorldHint"
      ]);
      expect(description, tool.name).not.toMatch(ORDERS);
      if (!REWORDED.has(tool.name)) expect(description, tool.name).toBe(before);
    }
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
