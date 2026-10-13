import { insufficientScope, type OAuthResourceContext } from "@cloudflare/workers-oauth-provider";
import { NO_STORE, readBytes } from "@grabient/server/auth/http.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";
import { checkLimits, type LimitCheck, mcpListLimits } from "@grabient/server/limits/check.ts";
import { appName, MCP_PATH } from "../oauth/clients.ts";
import {
  discovery,
  type McpProps,
  onSiteOrigin,
  RESOURCE_METADATA_PATH,
  resourceServer
} from "../oauth/server.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import { readArgs } from "./args.ts";
import { instructions, serverInfo, type Tier } from "./info.ts";
import {
  BAD_PARAMS,
  eraOf,
  type Failure,
  failure,
  failureBody,
  LEGACY,
  META,
  NO_METHOD,
  NO_RESOURCE,
  readMessage,
  SUPPORTED
} from "./protocol.ts";
import { readSkill, SKILL_RESOURCE, SKILLS_EXTENSION, skillsGet, skillsList } from "./skill.ts";
import {
  type Grant,
  LIMITER_DOWN,
  limitWords,
  refuse,
  type Tool,
  type ToolContext,
  type ToolResult
} from "./tool.ts";
import { accountTools } from "./tools/account.ts";
import { adminTools } from "./tools/admin.ts";
import {
  drawsView,
  KEPT,
  PALETTES_VIEW,
  VIEW_TOOL,
  VIEW_TOOL_META,
  viewExtension,
  viewOn
} from "./view.ts";
import { readView, VIEW_RESOURCE } from "./view-page.ts";

/* The MCP server at /mcp, for an app signed in to a Grabient account. Every request carries an access token: the
   OAuth library answers one without a valid token with its 401 challenge, checks the token's audience and expiry, and
   reads the account's role from the database (oauth/server.ts) before anything here runs.

   Two tiers. Every connection has the account's tools (tools/account.ts). A connection of an admin account that holds
   the `admin` scope, which an admin chooses at consent, also has the admins' tools (tools/admin.ts), which change the
   site. What a call is shown and told is its tier's alone: an ordinary connection is never told the admins' tools
   exist, and asking for one answers as for any unknown tool. */

/** An account's call carries a few palettes; an admin's a whole collection with its titles, or a batch for the queue. */
const BODY_MAX = 64 * 1024;
const ADMIN_BODY_MAX = 512 * 1024;
/** The tools and the instructions change with a deploy: an app may keep them an hour. */
const LISTED = { ttlMs: 3_600_000, cacheScope: "private" } as const;

/** What a request waited on, for whoever measures the server from outside: the token check (the library's, before
    the handler), the limiter and the tool, in the order each began. */
class Timings {
  readonly started = performance.now();
  readonly #spent = new Map<string, number>();
  add(name: string, ms: number) {
    this.#spent.set(name, (this.#spent.get(name) ?? 0) + ms);
  }
  async time<T>(name: string, work: () => Promise<T>): Promise<T> {
    const from = performance.now();
    try {
      return await work();
    } finally {
      this.add(name, performance.now() - from);
    }
  }
  header(): string {
    return [...this.#spent].map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`).join(", ");
  }
}

/** What the handler is given: what the library verified, and the Worker's own context riding along. */
type McpContext = OAuthResourceContext<McpProps> & { worker: ExecutionContext; timings: Timings };

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
const fail = (error: Failure) => reply(failureBody(error), error.status);

/** A refusal before the library, readable from a browser app as the library's answers are. */
function refused(
  request: Request,
  body: unknown,
  status: number,
  headers: Record<string, string> = {}
) {
  const from = request.headers.get("Origin");
  const cors: Record<string, string> = from
    ? {
        "Access-Control-Allow-Origin": from,
        "Access-Control-Expose-Headers": "Retry-After",
        Vary: "Origin"
      }
    : {};
  return reply(body, status, { ...headers, ...cors });
}

/** A tool as a connection lists it, every hint stated as it holds for this connection's account: Anthropic's
    directory asks each tool for a title and its hints, and an app reads a hint left out at its worst. */
const listed = (tool: Tool, grant: Grant | null, view = false) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: tool.inputSchema,
  annotations: {
    title: tool.title,
    readOnlyHint: tool.hints.readOnly,
    destructiveHint: tool.hints.destructive,
    idempotentHint: tool.hints.idempotent,
    openWorldHint:
      typeof tool.hints.openWorld === "function"
        ? tool.hints.openWorld(grant)
        : tool.hints.openWorld
  },
  ...(view && tool.name === VIEW_TOOL
    ? { _meta: VIEW_TOOL_META }
    : tool.meta
      ? { _meta: tool.meta }
      : {})
});

/** An ordinary account's tools as its connection lists them while the view is on: what the site's server card and
    agent catalog name. */
export const accountToolList = () => accountTools.map(tool => listed(tool, null, true));
export { SUPPORTED, serverInfo };

const HANDLER = {
  fetch: (request: Request, env: Env, ctx: OAuthResourceContext<McpProps>) =>
    answer(request, env, ctx as McpContext)
};

/** Whether the Worker should hand a path (without its language) to serveMcp. */
export const mcpPath = (path: string) => path === MCP_PATH || path === RESOURCE_METADATA_PATH;

/** /mcp and its metadata document. */
export async function serveMcp(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const asked = new URL(request.url);
  // a person who opens the address in a browser is shown how an app connects; an app never asks for a page
  if (
    asked.pathname === MCP_PATH &&
    request.method === "GET" &&
    (request.headers.get("Accept") ?? "").includes("text/html")
  ) {
    return new Response(null, {
      status: 302,
      headers: { ...NO_STORE, Location: new URL("/mcp-server", asked).toString() }
    });
  }
  // with no sign-in secret nobody can sign in, so no app is told to
  if (!env.BETTER_AUTH_SECRET || !env.OAUTH_KV)
    return refused(request, { error: "Sign-in is unavailable." }, 503);
  request = onSiteOrigin(env, request);
  const url = new URL(request.url);
  const server = resourceServer(url.origin, HANDLER);
  // the library sets the verified token on this object: the Worker's own context is never written to
  const timings = new Timings();
  const context = {
    worker: ctx,
    timings,
    waitUntil: (promise: Promise<unknown>) => ctx.waitUntil(promise),
    passThroughOnException() {}
  } as unknown as ExecutionContext;
  if (url.pathname === RESOURCE_METADATA_PATH)
    return discovery(await server.fetch(request, env, context));
  if (request.method !== "OPTIONS") {
    if (await flagOff(env, "mcp")) {
      return refused(request, { error: "The MCP server is paused." }, 503, {
        "Retry-After": "300"
      });
    }
    // an Origin that is no origin is refused; any real one is allowed, a desktop app's own scheme too, since a token
    // and never a cookie opens the server
    const from = request.headers.get("Origin");
    if (from !== null && !/^[a-z][a-z0-9+.-]*:\/\/[^\s/]+$/i.test(from))
      return refused(request, { error: "Invalid Origin." }, 403);
  }
  /* Nothing here remembers a token or counts an address: a refused token costs its one read each time, and a good one
     is never stopped by what else its address sent (an app's servers carry every account's tokens from a few). */
  const bearer = /^Bearer\s/i.test(request.headers.get("Authorization") ?? "");
  const response = await server.fetch(request, env, context);
  if (response.status === 401)
    countUsage(env, "mcp", "challenge", bearer ? "token" : "none", "refused", url.pathname);
  const spent = timings.header();
  if (!spent || response.status === 401) return response;
  const timed = new Response(response.body, response);
  timed.headers.append("Server-Timing", spent);
  return timed;
}

/** A request the library let through. */
async function answer(request: Request, env: Env, ctx: McpContext): Promise<Response> {
  const timings = ctx.timings;
  timings.add("auth", performance.now() - timings.started);
  if (!ctx.auth.scope.includes("account")) return insufficientScope(ctx.auth, ["account"]);
  // no stream is offered and no session is kept: only POST
  if (request.method !== "POST")
    return reply({ error: "Send JSON-RPC requests with POST." }, 405, { Allow: "POST, OPTIONS" });
  const grant: Grant = {
    userId: ctx.auth.userId ?? ctx.props.userId,
    role: ctx.props.role,
    scopes: ctx.auth.scope,
    clientId: ctx.auth.clientId ?? "",
    clientName: appName(ctx.props.app)
  };
  // the admin tier is the role and the scope together, the role read with this call
  const admin = grant.role === "admin" && grant.scopes.includes("admin");
  const tier: Tier = admin ? "admin" : "account";

  const bytes = await readBytes(request, admin ? ADMIN_BODY_MAX : BODY_MAX).catch(() => null);
  const message = readMessage(bytes);
  if (message === "notification") return new Response(null, { status: 202, headers: NO_STORE });
  if ("code" in message) return fail(message);
  const era = eraOf(message, request.headers);
  if ("code" in era) return fail(era);
  const { modern } = era;
  const { id, method, params, meta } = message;
  const origin = new URL(request.url).origin;
  const done = (result: Record<string, unknown>) =>
    reply({
      jsonrpc: "2.0",
      id,
      result: modern
        ? {
            resultType: "complete",
            ...result,
            _meta: {
              ...(result._meta as Record<string, unknown> | undefined),
              [`${META}serverInfo`]: serverInfo(origin)
            }
          }
        : result
    });
  const toolResult = (result: ToolResult) =>
    done({
      content: result.content,
      ...(result._meta ? { _meta: result._meta } : {}),
      ...(result.isError ? { isError: true } : {})
    });

  /* A tool call counts against the account's minute in this isolate, its day and the site's day. Everything else,
     which apps send every turn, counts against a minute of its own and, past the isolate's first two hundred of a
     day, a day of its own, so listing never spends the tools' allowance. */
  const calls = method === "tools/call";
  const who = `mcp:${grant.userId}`;
  const checks: LimitCheck[] = calls
    ? [
        [who, admin ? ["mcpAdmin", "mcpAdminDaily"] : ["mcpAccount", "mcpAccountDaily"]],
        ["mcp-account", "mcpAccountBudget"]
      ]
    : mcpListLimits(env, who);
  const allowed = await timings.time("limiter", () => checkLimits(env, checks));
  if (!allowed?.success) {
    // the limit's own words, or that the limiter could not answer: never too many requests when it may not be so
    const words = allowed ? limitWords(allowed) : LIMITER_DOWN;
    if (calls) return toolResult(refuse(words));
    return allowed
      ? reply({ error: words }, 429, {
          "Retry-After": String(Math.max(1, allowed.reset - Math.floor(Date.now() / 1000)))
        })
      : reply({ error: words }, 503, { "Retry-After": "5" });
  }

  const view = await viewOn(env);
  const capabilities = {
    resources: {},
    extensions: { [SKILLS_EXTENSION]: {}, ...viewExtension(view) }
  };
  if (method === "initialize" && !modern) {
    const wanted = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
    return done({
      protocolVersion: LEGACY.includes(wanted) ? wanted : LEGACY[0],
      capabilities: { tools: { listChanged: false }, ...capabilities },
      serverInfo: serverInfo(origin),
      instructions: instructions(origin, tier)
    });
  }
  if (method === "ping" && !modern) return done({});
  if (method === "server/discover") {
    return done({
      supportedVersions: SUPPORTED,
      capabilities: { tools: {}, ...capabilities },
      instructions: instructions(origin, tier),
      ...LISTED
    });
  }
  // the list is its tier's: it varies by the token, never by the connection
  if (method === "tools/list") {
    return done({
      tools: [
        ...accountTools.map(tool => listed(tool, grant, view)),
        ...(admin ? adminTools.map(tool => listed(tool, grant)) : [])
      ],
      ...(modern ? LISTED : {})
    });
  }
  if (method === "resources/list") {
    return done({ resources: [VIEW_RESOURCE, SKILL_RESOURCE], ...(modern ? KEPT : {}) });
  }
  if (method === "resources/templates/list")
    return done({ resourceTemplates: [], ...(modern ? KEPT : {}) });
  if (method === "resources/read") {
    const read =
      params.uri === PALETTES_VIEW
        ? readView(origin, modern)
        : await readSkill(params.uri, origin, modern);
    if (read) return done(read);
    const uri = typeof params.uri === "string" ? params.uri.slice(0, 200) : null;
    return fail(failure(id, modern ? BAD_PARAMS : NO_RESOURCE, "Resource not found", 200, { uri }));
  }
  if (method === "skills/list") return done(await skillsList(origin, modern));
  if (method === "skills/get") {
    const skill = await skillsGet(params.uri, origin, modern);
    return skill ? done(skill) : fail(failure(id, BAD_PARAMS, "Skill not found"));
  }
  if (calls) {
    const name = typeof params.name === "string" ? params.name : String(params.name);
    const own = accountTools.find(tool => tool.name === name);
    const tool = own ?? (admin ? adminTools.find(candidate => candidate.name === name) : undefined);
    if (!tool) return fail(failure(id, BAD_PARAMS, `Unknown tool: ${name.slice(0, 80)}`));
    const args =
      params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};
    // an account's tool is handed its arguments read as its schema says; an admin's reads its own
    const read = own ? readArgs(tool.inputSchema, args) : { args };
    const c: ToolContext = {
      env,
      ctx: ctx.worker,
      request,
      origin,
      grant,
      admin,
      view:
        view &&
        drawsView(meta, modern, {
          clientId: grant.clientId,
          kind: ctx.props.kind,
          host: ctx.props.host
        })
    };
    return toolResult(
      "error" in read
        ? counted(env, tier, name, grant, refuse(read.error))
        : await run(tool, read.args, c, tier, timings)
    );
  }
  return fail(
    failure(id, NO_METHOD, `Method not found: ${method.slice(0, 80)}`, modern ? 404 : 200)
  );
}

const counted = (env: Env, tier: Tier, name: string, grant: Grant, result: ToolResult) => {
  countUsage(env, "mcp", tier, name, result.isError ? "refused" : "ok", MCP_PATH, grant.clientName);
  return result;
};

/** A tool's run, timed and counted. A throw is logged and answered in words that say nothing was changed unless the
    tool said so. */
async function run(
  tool: Tool,
  args: Record<string, unknown>,
  c: ToolContext,
  tier: Tier,
  timings: Timings
) {
  try {
    return counted(
      c.env,
      tier,
      tool.name,
      c.grant,
      await timings.time("tool", () => tool.run(args, c))
    );
  } catch (error) {
    countUsage(c.env, "mcp", tier, tool.name, "failed", MCP_PATH, c.grant.clientName);
    console.error(
      "mcp: a tool failed",
      tool.name,
      error instanceof Error ? `${error.name}: ${error.message}` : error
    );
    return refuse(
      "The tool failed on the server. Nothing was changed by this call unless it says so; try again."
    );
  }
}
