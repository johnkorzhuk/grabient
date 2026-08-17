# Remote MCP servers for Grabient — design & implementation

Researched 2026-08-16. Every factual claim carries a source URL. Anything I could
not confirm from an official doc is in [§7 UNVERIFIED](#7-unverified) — it is not
mixed into the recommendations.

Two servers are in scope:

- **Server A** — public, anonymous palette tools at `grabient.com/mcp`.
- **Server B** — private, read-only analytics tools at `admin.grabient.com/mcp`.

---

## 0. TL;DR

**Stack.** `agents@0.20.1` (`createMcpHandler` from `agents/mcp/server`) +
`@modelcontextprotocol/server@2.0.0` + `zod@^4.4.3`. Streamable HTTP only; SSE is
deprecated. Spec revision **2026-07-28**. **No Durable Object is required** — the
protocol went stateless three weeks ago and `McpAgent` is now feature-frozen. Both
servers mount as a single Hono route inside their existing Workers; no new Worker,
no new binding.

**Server A** lives in `apps/web` as `app.all("/mcp", ...)`, reusing the `DB`,
`VECTORIZE`, `AI` and cache bindings already attached. Authless. Abuse control is
Zod input caps plus the `RateLimiter` Durable Object that is already deployed —
**not** the zone WAF, whose single free-plan rule is already spent on
`/api/*`, `*.png`, `*.json`. Listable in the official MCP Registry under
`com.grabient/palettes` via a DNS TXT record on the apex.

**Server B: enable Cloudflare Access Managed OAuth on the existing Access
application.** It turns Access itself into the OAuth authorization server, serves
all the `/.well-known/` discovery the MCP spec demands, and forwards the same
signed JWT the Worker already verifies — so `access.ts` needs **no change at
all**, and granting or revoking a person is a dashboard policy edit with no
deploy. Add a service token on a separate Service Auth policy only if headless
automation is genuinely needed; that path *does* require the `access.ts` change
in §3.5, because service-token JWTs carry `common_name` and no `email`.

**Build Server B first** — it is a dashboard toggle, it is private, and Server A
ships into the Worker that serves the live site.

**Top three gotchas.**
1. `allowedHostnames` defaults to localhost + `workers.dev` only. Ship without it
   and the server passes the staging smoke test, then 4xxs on the real hostname.
2. Managed OAuth and a self-hosted OAuth server are mutually exclusive on one
   hostname — Access takes over the 401 and the `/.well-known/*` paths. Never
   define those routes in `apps/admin`.
3. `@modelcontextprotocol/sdk` is the **legacy v1** package;
   `@modelcontextprotocol/server` is v2. Most tutorials online, including
   Cloudflare's own `remote-mcp-cf-access` template, are still on v1 + `McpAgent`
   + a Durable Object.

---

## 1. Current stack (August 2026)

### 1.1 The stack changed three weeks ago

The thing to internalise before writing any code: **`McpAgent` is deprecated and
the Durable Object requirement is gone.** On 2026-07-28 the MCP specification
shipped a revision that makes the protocol fully stateless, and Cloudflare's
Agents SDK v0.20.0 (2026-07-27) followed it.

> "This new specification thus also removes the need for `McpAgent`. While
> Durable Objects remain the right primitive when an application itself needs
> state, MCP itself no longer requires a Durable Object to speak the protocol.
> Servers can scale faster on request scoped infrastructure such as Cloudflare
> Workers."
> — [blog.cloudflare.com/mcp-v2](https://blog.cloudflare.com/mcp-v2/)

The Cloudflare API docs for `McpAgent` now open with:

> "`McpAgent` remains available only for existing legacy servers while they
> migrate. It is feature-frozen."
> — [McpAgent · Cloudflare Agents docs](https://developers.cloudflare.com/agents/model-context-protocol/apis/agent-api/)

Both of our servers are greenfield, so both use the new path and **neither needs
a Durable Object**.

### 1.2 Packages and versions

Verified against the npm registry on 2026-08-16 and against the official
[`cloudflare/agents` `examples/mcp-worker`](https://github.com/cloudflare/agents/tree/main/examples/mcp-worker)
`package.json`:

| Package | Version | Role |
|---|---|---|
| `agents` | `0.20.1` | Cloudflare SDK. We use exactly one export: `agents/mcp/server` → `createMcpHandler`. |
| `@modelcontextprotocol/server` | `2.0.0` | Official MCP TypeScript SDK v2. Provides `McpServer`, `registerTool`, `isLegacyRequest`. |
| `@modelcontextprotocol/core` | `2.0.0` | Transitive dep of `server@2.0.0` (pinned exact). Not installed directly. |
| `zod` | `^4.4.3` | Tool input schemas. `@modelcontextprotocol/server@2.0.0` requires `zod ^4.2.0`. |
| `@cloudflare/workers-oauth-provider` | `0.10.3` | **Only if** we add OAuth. Not needed for either server as designed below. |

The migration guide states the install line explicitly:

> **Before (SDK v1):** `npm i agents @modelcontextprotocol/sdk@1.30.0 zod`
> **After (SDK v2):** `npm i agents @modelcontextprotocol/server@2.0.0 zod`
> — [Migrate to MCP SDK v2](https://developers.cloudflare.com/agents/model-context-protocol/guides/migrate-to-mcp-sdk-v2/)

`@modelcontextprotocol/sdk@1.30.0` is the **legacy v1** package. Do not install
it. It is only referenced by `McpAgent`, which we are not using.

> Note the deceptive naming: `@modelcontextprotocol/sdk` is v1, and
> `@modelcontextprotocol/server` is v2. They are different packages, not
> different versions of one package.

### 1.3 Transport: Streamable HTTP. SSE is deprecated.

> "**Streamable HTTP** — The standard transport method for remote MCP
> connections, introduced in March 2025 […] existing `McpAgent` deployments can
> retain SSE temporarily while they migrate, but new servers should use the
> stateless Streamable HTTP handler."
> — [Transport · Cloudflare Agents docs](https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/)

The spec deprecated HTTP+SSE:

> "The Streamable HTTP transport replaces the HTTP+SSE transport from protocol
> version 2024-11-05."
> — [Transports · MCP spec 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

The 2026-07-28 release lists the legacy HTTP+SSE transport among features
deprecated with a **12-month minimum support window**
([blog.modelcontextprotocol.io/posts/2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/)).

**Decision: Streamable HTTP only. We never expose an `/sse` endpoint.**

### 1.4 Protocol revision string — read this carefully

The current spec revision is **`2026-07-28`**
([blog.modelcontextprotocol.io/posts/2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/)).

But if you inspect `@modelcontextprotocol/core@2.0.0` you will find:

```js
LATEST_PROTOCOL_VERSION = "2025-11-25"
SUPPORTED_PROTOCOL_VERSIONS = [LATEST_PROTOCOL_VERSION, "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"]
DEFAULT_NEGOTIATED_PROTOCOL_VERSION = "2025-03-26"
```

This is **not** a contradiction and you should not "fix" it. Those constants
describe the **legacy `initialize` handshake** version ladder only. The
2026-07-28 revision removed `initialize` entirely, so it does not appear in a
negotiation list. In the SDK source, `2026-07-28` appears as the revision that
*introduced* `server/discover`, `subscriptions/listen` and MRTR, and that
*deprecated* Roots / Sampling / Logging / `ToolUseContent` (all tagged
`@deprecated Deprecated as of protocol version 2026-07-28 (SEP-2577)`).

The SDK models this as two **eras** — `"modern"` (2026-07-28) and `"legacy"`
(2025-era and older) — and `createMcpHandler` serves both from one endpoint by
default. Practical consequence: **the full revision ladder is
2024-10-07 → 2024-11-05 → 2025-03-26 → 2025-06-18 → 2025-11-25 → 2026-07-28**,
and you do not hardcode any of it.

New wire details in 2026-07-28, relevant because they interact with WAF rules:

> "The specification now mandates `Mcp-Method` and `Mcp-Name` headers on
> requests, enabling gateways and WAFs to understand MCP traffic without parsing
> JSON bodies."
> — [blog.cloudflare.com/mcp-v2](https://blog.cloudflare.com/mcp-v2/)

```http
POST /mcp HTTP/1.1
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: search
Content-Type: application/json
```

`Mcp-Session-Id` is **gone** in the modern era — that header belonged to the
`initialize`-based session model that 2026-07-28 removed
([blog.modelcontextprotocol.io/posts/2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/)).
It may still appear from 2025-era clients hitting the legacy compatibility path.

### 1.5 The canonical skeleton

Verbatim from
[`cloudflare/agents/examples/mcp-worker/src/server.ts`](https://github.com/cloudflare/agents/tree/main/examples/mcp-worker)
(fetched from `raw.githubusercontent.com`, 2026-08-16):

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

function createServer() {
  const server = new McpServer({
    name: "Hello MCP Server",
    version: "1.0.0"
  });

  server.registerTool(
    "hello",
    {
      description: "Returns a greeting message",
      inputSchema: { name: z.string().optional() }
    },
    async ({ name }) => {
      return {
        content: [
          {
            text: `Hello, ${name ?? "World"}!`,
            type: "text"
          }
        ]
      };
    }
  );

  return server;
}

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(createServer)(request, env, ctx);
  }
} satisfies ExportedHandler;
```

Two things to note. First, you pass the **factory itself**, not a constructed
server — this changed in SDK v2:

> **Before:** `return createMcpHandler(createServer())(request, env, ctx);`
> **After:** `return createMcpHandler(createServer)(request, env, ctx);`
> "The handler now creates one server per MCP request rather than reusing a
> shared instance."
> — [Migrate to MCP SDK v2](https://developers.cloudflare.com/agents/model-context-protocol/guides/migrate-to-mcp-sdk-v2/)

Second, its `wrangler.jsonc` has **no `durable_objects` block and no
`migrations`** — confirming DOs are not required.

### 1.6 `createMcpHandler` options (authoritative)

Taken from the shipped type definitions in `agents@0.20.1`
(`dist/handler-stateless-*.d.ts`), which matches
[the API reference](https://developers.cloudflare.com/agents/model-context-protocol/mcp-handler-api/):

```ts
interface CreateStatelessMcpHandlerOptions extends Omit<CreateMcpHandlerOptions, "bus"> {
  /** Exact pathname handled by this Worker wrapper. @default "/mcp" */
  route?: string;
  /** CORS headers applied by the Worker wrapper. Pass `false` to disable. */
  corsOptions?: CORSOptions | false;
  /**
   * Restrict `Host` headers to these hostnames. Localhost and `workers.dev`
   * endpoints receive matching defaults; custom domains rely on Cloudflare
   * routing unless this option is set.
   */
  allowedHostnames?: string[];
  /**
   * Restrict present browser `Origin` headers to these hostnames. Requests
   * without an Origin (including non-browser MCP clients) remain valid. […]
   */
  allowedOriginHostnames?: string[] | "*";
  /** Application props exposed through getMcpAuthContext(). */
  authContext?: McpAuthContext;
}

type StatelessMcpHandler = {
  (request: Request, env: unknown, ctx: ExecutionContext): Promise<Response>;
  fetch(request: Request, options?: McpHandlerRequestOptions): Promise<Response>;
  notify: ServerNotifier;
};
```

Inherited from `CreateMcpHandlerOptions` in `@modelcontextprotocol/server@2.0.0`:
`legacy?: "stateless" | "reject"` (default `"stateless"`),
`responseMode?: "auto" | "sse" | "json"` (default `"auto"`),
`onerror?: (error: Error) => void`, plus `maxSubscriptions` and `keepAliveMs`.

**The handler is a plain callable** — `(request, env, ctx) => Promise<Response>`.
That is what makes §2.2 (mounting inside Hono) work.

### 1.7 Can an MCP server share a Worker with existing Hono routes?

**Yes.** Nothing about `createMcpHandler` requires a dedicated Worker. It is a
function returning a callable that takes `(request, env, ctx)`, and the docs
describe composing it:

> "Compose within another handler by invoking the returned callable directly
> with request, env, and ctx parameters."
> — [createMcpHandler — API Reference](https://developers.cloudflare.com/agents/model-context-protocol/mcp-handler-api/)

Routing gotchas, in the order they will bite you:

1. **`route` is an exact pathname, default `/mcp`.** Requests to other paths get
   a 404 *from the handler*. If you mount inside Hono at `/mcp` you must also set
   `route: "/mcp"` so the two agree.
2. **`allowedHostnames` must be set for custom domains.** The default allow-list
   covers localhost and `workers.dev` only; the type comment says custom domains
   "rely on Cloudflare routing unless this option is set". For `grabient.com` and
   `admin.grabient.com` this must be explicit. This is the single easiest way to
   ship a server that works on `*.workers.dev` and 4xxs on the real hostname.
3. **CORS defaults to wildcard.** `corsOptions` defaults to permissive. For
   Server A that is what we want; for Server B set `corsOptions: false`.
4. **`Mcp-Session-Id` is not our problem** in the modern era (§1.4), but if a
   2025-era client connects it goes down the `legacy: "stateless"` path, where
   GET and DELETE are answered `405` by design.
5. **Existing global middleware runs first.** In `apps/web` the `app.use("*")`
   middleware appends HSTS/CSP/`X-Content-Type-Options` and an
   `Access-Control-Allow-Origin: *` for public API paths; in `apps/admin` the
   `app.use("*")` middleware runs `verifyAccess` on everything. Neither breaks
   MCP, but both apply to `/mcp` — which for Server B is exactly what we want.

---

## 2. Server A — public palette MCP

### 2.1 Where it lives

**Inside the existing `apps/web` Hono Worker.** Reasons:

- The tools (`search_palettes`, `get_palette`, `build_palette`, `tweak_palette`,
  `render_png`) are thin wrappers over logic already in
  `apps/web/src/search.ts`, `palette.ts`, `palette-json.ts`, `semantic-search.ts`
  and the PNG renderer. A separate Worker would need a service binding back to
  this one or a duplicated copy of `packages/data-ops`.
- All five bindings it needs (`DB`, `VECTORIZE`, `AI`, `SEARCH_CACHE`,
  `OG_IMAGE_CACHE`) are already attached to both env blocks.
- No new bindings, no new Durable Object, no new deploy target.

The one caution from `CLAUDE.md` applies: this touches the Worker that serves
grabient.com, so it goes through `pnpm deploy:staging` and a smoke test first.

### 2.2 Skeleton

New file `apps/web/src/mcp.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

// One server per request — the factory is called per MCP request, so it must
// stay cheap. Do not open a DB connection here; do it inside the tool.
function createServer(env: Env) {
  const server = new McpServer({
    name: "grabient",
    version: "1.0.0",
  });

  server.registerTool(
    "search_palettes",
    {
      description:
        "Search Grabient's gradient palettes by natural-language description. " +
        "Returns seeds, coefficients and grabient.com URLs.",
      inputSchema: {
        query: z.string().min(1).max(120).describe("e.g. 'warm sunset', 'muted forest'"),
        limit: z.number().int().min(1).max(20).default(8),
      },
    },
    async ({ query, limit }) => {
      const results = await searchPalettes(env, query, limit); // existing code
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  // get_palette, build_palette, tweak_palette, render_png register the same way.

  return server;
}

export const mcpHandler = createMcpHandler(
  // The factory receives request context; close over env via the Hono binding.
  (ctx) => createServer(currentEnv!),
  {
    route: "/mcp",
    // REQUIRED for a custom domain — defaults cover localhost/workers.dev only.
    allowedHostnames: ["grabient.com", "www.grabient.com", "grabient-lite.<sub>.workers.dev"],
    // Public read-only surface: any origin, matching the existing PNG/JSON policy.
    allowedOriginHostnames: "*",
    onerror: (err) => console.error("mcp", err),
  },
);
```

Mount in `apps/web/src/index.ts`, above the catch-all `/{seed}` route:

```ts
import { mcpHandler } from "./mcp";

app.all("/mcp", (c) => mcpHandler(c.req.raw, c.env, c.executionCtx));
```

> The `env` plumbing above is written as a sketch, not copy-paste code: the
> factory signature is `McpServerFactory`, which receives a request context
> rather than `env`. In a Hono mount the clean pattern is to build the handler
> per request (`createMcpHandler(() => createServer(c.env), {...})`) or to close
> over `c.env` in the route. Both work because the handler is a plain callable;
> pick one when implementing and keep it consistent.

### 2.3 Cache policy — do not skip this

`CLAUDE.md` records two production incidents from cache-policy mistakes, and
`/mcp` is a POST surface returning per-query results. It must be
**`no-store`**, and it must not fall into the edge-cached list-HTML path. Add
`/mcp` to the `no-store` branch explicitly rather than relying on POST not being
cached.

### 2.4 Rate limiting and abuse posture

Threat model for an authless server: it is an unauthenticated compute endpoint
where `search_palettes` hits Vectorize + Workers AI (paid units) and
`render_png` burns CPU. Abuse costs money, not data.

Note a distinction that matters here: **the Cloudflare *zone* plan (Free) is not
the Workers plan.** `apps/web` already declares a Durable Object with
`"new_classes": ["RateLimiter"]` (a KV-backed, non-SQLite DO), and
`developers.cloudflare.com` states the Workers Free plan "can only create and
access SQLite-backed Durable Objects"
([Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)).
A KV-backed DO deploying successfully implies the account is on **Workers Paid**
even though the zone is Free. Confirm before relying on it.

**The zone WAF is not available to us — its single free rule is already spent.**
Verbatim from
[Rate limiting rules · availability](https://developers.cloudflare.com/waf/rate-limiting-rules/),
the Free row: **1** rule, counting period **10 s only**, mitigation timeout
**10 s only**, counting characteristics **IP only**, and available fields in the
rule expression limited to **Path, Verified Bot**. The zone's one rule is the
existing 300 req/10s on `/api/*`, `*.png`, `*.json`. Two consequences: adding a
rule for `/mcp` means *modifying* that rule, not adding one; and because `Host`
is not an available field on Free, a single rule cannot distinguish
`grabient.com/mcp` from `admin.grabient.com/mcp` anyway. **Do the rate limiting
in the Worker.**

Layered posture, cheapest first:

1. **Cap the blast radius in tool schemas.** `limit: z.number().int().max(20)`,
   `query: z.string().max(120)`, a hard cap on `render_png` dimensions. Zod
   rejects out-of-range input before any binding is touched. Free, synchronous,
   and the most reliable control here — do this first and do it always.
2. **Reuse the existing `RateLimiter` Durable Object.** Already deployed, already
   bound as `RATE_LIMITER` in both env blocks, config in
   `apps/web/src/rate-limit.ts`:
   ```ts
   export const rateLimitConfig = {
     toggleLike: { requests: 20, window: 60 },
     contactForm: { requests: 5, window: 600 },
   } as const;
   ```
   Add entries keyed on `CF-Connecting-IP`, **tiered by cost** — `get_palette`
   and `build_palette` are pure compute; `search_palettes` (Vectorize + AI) and
   `render_png` (resvg) are the ones that spend money:
   ```ts
   mcpCheap:     { requests: 120, window: 60 },
   mcpExpensive: { requests: 20,  window: 60 },
   ```
   Strongly-consistent counting, and no new binding.
3. **Or the Workers Rate Limiting binding**, if per-colo approximation is
   acceptable in exchange for not paying DO request cost. Note the config is a
   **top-level `ratelimits` key** — not `unsafe.bindings`, which is what older
   guides show:
   ```jsonc
   {
     "ratelimits": [
       { "name": "MCP_LIMITER", "namespace_id": "1001",
         "simple": { "limit": 100, "period": 60 } }
     ]
   }
   ```
   ```ts
   const { success } = await env.MCP_LIMITER.limit({ key: clientIp });
   if (!success) return new Response("429", { status: 429 });
   ```
   Constraints from
   [the binding docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/):
   `period` "Must be either 10 or 60"; "For each unique key you pass to your rate
   limiting binding, there is a unique limit per Cloudflare location"; requires
   Wrangler **4.36.0+** (repo is on `^4.112.0`, fine). The docs state no plan
   restriction — see [§7](#7-unverified).

Since `Mcp-Method` and `Mcp-Name` are now mandated request headers (§1.4), the
in-Worker limiter can key on the tool name cheaply, without parsing the JSON
body. That is the practical advantage of doing this in code rather than the WAF.

### 2.5 Registry submission

Covered in [§4](#4-discovery-registry-submission-and-observability-server-a).

---

## 3. Server B — private analytics MCP

### 3.1 What already exists

`apps/admin/src/access.ts` verifies the Access assertion in-worker with `jose`,
then allow-lists on the `email` claim. It already anticipates this design:

```ts
// Identity-based logins carry `email`; service tokens carry `common_name`
// instead and are deliberately not accepted here.
if (typeof payload.email !== "string" || !payload.email) {
  return { ok: false, status: 403, reason: "assertion has no email claim" };
}
```

So the code path for service tokens exists as a deliberate, commented rejection.
The change in §3.5 flips it to an explicit, separately-allow-listed accept.

### 3.2 The option the brief did not know about: Managed OAuth

The brief asked me to choose between (a) service tokens, (b) "Access-as-IdP
OAuth", and (c) `workers-oauth-provider` + Google. There is a fourth option that
did not exist when the brief's mental model was formed, and it wins outright.

**Cloudflare Access Managed OAuth** turns Access itself into the OAuth 2.0
authorization server *for the application it is already protecting*:

> "When you protect an application with Cloudflare Access, by default non-browser
> clients — such as CLIs, AI agents, SDKs, and scripts — cannot complete the
> browser-based login redirect. They receive a `302` redirect with no usable
> token or authorization endpoint.
>
> Managed OAuth solves this by turning Access into a standard OAuth 2.0
> authorization server for your application. Access enforces the same policies as
> a browser login, and your origin sees no difference."
> — [Managed OAuth · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)

The decisive property for us:

> "Managed OAuth issues **opaque** access tokens (for example, `oauth:CvNoo...`),
> not JSON Web Tokens (JWTs) […] When a client presents an opaque token to your
> application, Cloudflare resolves the token into the user's identity on the
> backend and forwards a signed assertion to your origin. **From your origin's
> perspective, the request looks the same as a browser-authenticated request.**"
> — [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)

Meaning: **`apps/admin/src/access.ts` does not change at all.** The MCP client
does a normal OAuth flow against Access, and the Worker still receives a
`Cf-Access-Jwt-Assertion` JWT with a real `email` claim, verified by the same
`jose` code and filtered by the same `ADMIN_EMAILS` allow-list.

It also supports Dynamic Client Registration, which MCP clients need:

```json
{
  "oauth_configuration": {
    "enabled": true,
    "dynamic_client_registration": {
      "enabled": true,
      "allow_any_on_localhost": true,
      "allow_any_on_loopback": true,
      "allowed_uris": ["https://playground.ai.cloudflare.com/*"]
    },
    "grant": { "access_token_lifetime": "5m", "session_duration": "24h" }
  }
}
```

Dashboard path: **Zero Trust → Access controls → Applications → [app] → Edit →
Advanced settings → Managed OAuth**. Prerequisite: the client must support
RFC 8707 resource indicators — which the MCP spec *mandates* for all clients
("MCP clients **MUST** implement Resource Indicators for OAuth 2.0 as defined in
RFC 8707", [MCP 2026-07-28 authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)),
so every conformant MCP client qualifies.

Cloudflare documents this for MCP specifically:

> "Only enable Managed OAuth for MCP servers that validate the Access JWT sent by
> Cloudflare."
> — [Secure MCP servers · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/secure-mcp-servers/)

Our Worker does exactly that. We are in the intended category.

### 3.3 Comparison and recommendation

Primary requirement from the brief: **the owner can grant and revoke access to
other people easily.**

| | Grant a new person | Revoke | Worker code change | Headless automation | Verdict |
|---|---|---|---|---|---|
| **(a) Service tokens only** | Create a token, send the person a **shared secret** over some channel | Delete the token — but only that token; if two people share one, revoking hits both | Yes — must accept `common_name`, and the `email` allow-list stops working | Native | Rejected as the primary mechanism |
| **(b) Access for SaaS OIDC + `workers-oauth-provider`** | Add email to Access policy | Remove from Access policy | Large — new OAuth server, `OAUTH_KV`, 6 secrets, consent UI | Awkward | Rejected — see §3.7 |
| **(c) `workers-oauth-provider` + Google upstream + email allow-list** | Edit `ADMIN_EMAILS` and redeploy | Edit and redeploy | Large, and duplicates Access | Awkward | Rejected — worst of both |
| **(d) Managed OAuth on the existing Access app** | **Add their email to the Access policy in the dashboard. No deploy.** | **Remove from the policy. No deploy.** | **None** | Add a Service Auth policy alongside | **RECOMMENDED** |

> **Recommendation: (d) Managed OAuth on the existing Access application, plus a
> separate Service Auth policy carrying one service token for the owner's own
> headless automation.**
>
> One-line justification: it is the only option where granting or revoking a
> person is a dashboard policy edit with **no code change and no deploy**, while
> the Worker keeps the `jose` + `email` allow-list it already has.

Two supporting points. First, revocation under Managed OAuth is genuinely fast
because policies are re-evaluated on refresh:

> "For CLI tools, AI agents, and other non-browser clients, set a short access
> token lifetime (5–15 minutes) with a longer grant session duration (1–2
> weeks)… Access policies are re-evaluated on each token refresh, maintaining
> continuous identity verification."
> — [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)

Second, keep the in-worker `ADMIN_EMAILS` allow-list even though the Access
policy now also gates entry. That is the existing design intent, recorded in
`access.ts`: "this makes widening that policy insufficient on its own to grant
access to production data." Under option (d), granting someone access becomes a
**two-key operation** — add them to the Access policy *and* to `ADMIN_EMAILS`.
If you want single-key granting, drop the second gate deliberately and write
down that you did; do not let it erode by accident.

### 3.4 Service tokens for headless automation

For the owner's own scripts, add a **second policy on the same application**.
Policy evaluation order makes this safe:

> "Bypass and Service Auth policies are evaluated first, from top to bottom as
> shown in the UI. Then, Block and Allow policies are evaluated based on their
> order from top to bottom."
> — [Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)

So: **Service Auth** policy (Include → Service Token → *the specific token*) plus
the existing **Allow** policy (Include → Emails). Token requests match Service
Auth first; browsers and Managed OAuth clients fall through to Allow.

The documented trap:

> "Make sure to set the policy action to **Service Auth**; otherwise, Access will
> prompt for an identity provider login."
> — [Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)

Use the **Service Token** selector, never **Any Access Service Token** — the
latter admits any token in the whole account.

Request headers, verbatim from the same page:

```
CF-Access-Client-Id: <CLIENT_ID>
CF-Access-Client-Secret: <CLIENT_SECRET>
```

The Client ID ends in `.access` (e.g.
`88bf3b6d86161464f6509f7219099e57.access`). Default `duration` is `8760h`
(1 year); `forever` is permitted. **Revocation requires deleting the token** —
the dashboard's "Revoke existing tokens" is not enough:

> "When editing an Access application, selecting **Revoke existing tokens**
> revokes existing sessions but does not prevent the user from starting a new
> session. As long as the Client ID and Client Secret are still valid, they can
> be exchanged for a new token on the next request. To revoke access, you must
> delete the service token."
> — [Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)

### 3.5 The `access.ts` change — required only for the service-token path

Service-token JWTs **have no `email` claim**. Verbatim payload from
[Application token · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/):

```json
{
  "type": "app",
  "aud": ["32eafc7626e974616deaf0dc3ce63d7bcbed58a2731e84d06bc3cdf1b53c4228"],
  "exp": 1659474457,
  "iss": "https://yourteam.cloudflareaccess.com",
  "common_name": "e367826f93b8d71185e03fe518aff3b4.access",
  "iat": 1659474397,
  "sub": ""
}
```

Per that page's claim table: `common_name` is "The Client ID of the service token
(`CF-Access-Client-Id`)" and `sub` "Contains an empty string when authentication
was through a service token". There is no `email`, no `identity_nonce`, no
`country`, no `nbf`.

So the current code — which returns `403 "assertion has no email claim"` — will
reject every service-token request. That is correct today and must become a
deliberate, separately allow-listed accept.

**If (and only if) you add the Service Auth policy**, change `access.ts` as
follows. Note the identity is widened to a tagged union so callers cannot confuse
a machine for a person:

```ts
export type AccessResult =
  | { ok: true; kind: "user"; email: string }
  | { ok: true; kind: "service"; clientId: string }
  | { ok: false; status: 403 | 503; reason: string };
```

and replace the single email branch inside `verifyAccess` with:

```ts
    const { payload } = await jwtVerify(token, jwksFor(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience,
    });

    // Identity logins carry `email`. Service tokens carry `common_name` (the
    // Client ID, ending in `.access`) and an empty `sub`. They are accepted
    // only against their own allow-list: a valid signature for this AUD proves
    // the token belongs to this Access application, not that it is OURS. If
    // the policy ever uses "Any Access Service Token", every token in the
    // account would otherwise pass this check.
    if (typeof payload.email === "string" && payload.email) {
      const email = payload.email.toLowerCase();
      return allowListed(env.ADMIN_EMAILS, email)
        ? { ok: true, kind: "user", email }
        : { ok: false, status: 403, reason: `${email} is not an admin` };
    }

    if (typeof payload.common_name === "string" && payload.common_name) {
      const clientId = payload.common_name.toLowerCase();
      return allowListed(env.ADMIN_SERVICE_TOKENS, clientId)
        ? { ok: true, kind: "service", clientId }
        : { ok: false, status: 403, reason: "unknown service token" };
    }

    return { ok: false, status: 403, reason: "assertion has neither email nor common_name" };
```

with the existing allow-list parsing factored out (it must still fail closed on
an empty list):

```ts
function allowListed(raw: string | undefined, value: string): boolean {
  const allowed = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  // Empty list denies. Unconfigured must never mean unrestricted.
  return allowed.length > 0 && allowed.includes(value);
}
```

Then add `ADMIN_SERVICE_TOKENS` to `Env` in `apps/admin/src/env.d.ts` and set it
as a Wrangler secret. Callers of `verifyAccess` that do `c.set("email", ...)`
must handle `kind === "service"` — log the `clientId`, and consider refusing
service identities on any tool that returns PII (§5).

**If you skip service tokens entirely, `access.ts` needs no change at all.**

### 3.6 How a granted user connects

**Under Managed OAuth (the recommended path)** the user needs no secret at all —
the client discovers the auth server and opens a browser:

```bash
claude mcp add --transport http grabient-admin https://admin.grabient.com/mcp
```

That is the entire instruction you send a new teammate. They authenticate with
whatever IdP the Access policy already uses, and revocation is a policy edit.
This also works for header-less clients (Claude Desktop custom connectors,
ChatGPT), which is the second reason to prefer Managed OAuth.

**Under a service token (headless automation only):**

Claude Code accepts repeated header flags. From `claude mcp add --help` on the
installed CLI:

```
-H, --header <header...>     Set WebSocket headers (e.g. -H "X-Api-Key:
                             abc123" -H "X-Custom: value")
```

The `<header...>` variadic form and the two-flag example together confirm
multiple headers are supported (the published docs only ever show one). So:

```bash
claude mcp add --transport http grabient-admin https://admin.grabient.com/mcp \
  -H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" \
  -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}"
```

Better, use `.mcp.json` with variable interpolation so **no secret is written to
the file** — per
[code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp), `${VAR}` and
`${VAR:-default}` expand in both `url` and `headers`:

```json
{
  "mcpServers": {
    "grabient-admin": {
      "type": "http",
      "url": "https://admin.grabient.com/mcp",
      "headers": {
        "CF-Access-Client-Id": "${CF_ACCESS_CLIENT_ID}",
        "CF-Access-Client-Secret": "${CF_ACCESS_CLIENT_SECRET}"
      }
    }
  }
}
```

Use `local` or `user` scope, **never `project` scope** — `.mcp.json` at project
scope is committed.

Client header support differs sharply, which is the deciding practical factor:

| Client | Remote HTTP | Custom headers | Notes |
|---|---|---|---|
| **Claude Code** | Yes | **Yes**, repeatable, with `${VAR}` expansion | Also has `headersHelper` to fetch short-lived tokens at connect time |
| **Cursor** | Yes | Yes — `"Authorization": "Bearer ${env:VAR}"` in `.cursor/mcp.json` | |
| **VS Code / Copilot** | Yes | Yes — `headers` + `${input:...}` prompted secrets in `.vscode/mcp.json` | |
| **Claude Desktop / claude.ai** | Yes (Custom Connectors) | **No** — only OAuth client ID/secret | Needs Managed OAuth, or `mcp-remote --header` as a proxy |
| **ChatGPT** | Yes | **No** documented support | OAuth recommended, not required |

Cloudflare's own MCP portal docs show the `mcp-remote` fallback shape for
header-less clients, which is the same trick if you ever need it
([MCP server portals](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/)):

```json
{
  "mcpServers": {
    "example-portal": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://<host>/mcp",
        "--header", "CF-Access-Client-Id: <CLIENT_ID>",
        "--header", "CF-Access-Client-Secret: <CLIENT_SECRET>"]
    }
  }
}
```

### 3.7 Why not the `remote-mcp-cf-access` template

Cloudflare does publish an official Access + MCP template at
[`cloudflare/ai/demos/remote-mcp-cf-access`](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-cf-access),
referenced from
[Authorization · Cloudflare Agents docs](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/).
It works, but it is the wrong shape for us on two counts.

**It is built on the deprecated stack.** Its `package.json` pins
`agents: "^0.17.1"` and `@cloudflare/workers-oauth-provider: "^0.8.1"`, its
`src/index.ts` imports `McpAgent` from `agents/mcp` and `McpServer` from
`@modelcontextprotocol/sdk/server/mcp.js` (SDK **v1**), and its `wrangler.jsonc`
declares a `durable_objects` binding with a `new_sqlite_classes` migration.
Adopting it means adopting `McpAgent`, which is feature-frozen (§1.1).

**It solves a problem we do not have.** That template makes your Worker an OAuth
*server* to MCP clients and an OAuth *client* to Access-for-SaaS — six secrets,
a KV namespace, a consent screen, and CSRF/state handling you now own. Managed
OAuth gets the same outcome with a dashboard toggle.

Most importantly, the two designs are **mutually exclusive on one hostname**:

> "If you run your own OAuth server behind an Access application and rely on your
> own `WWW-Authenticate` headers, do not enable this feature. Enabling managed
> OAuth replaces the `401` response behavior on the protected application."
> — [Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)

Under Managed OAuth, Access owns the discovery surface on our own hostname —
`https://admin.grabient.com/.well-known/oauth-authorization-server`, and a
Cloudflare-specific
`https://admin.grabient.com/.well-known/cloudflare-access-protected-resource/`
advertised via `WWW-Authenticate` on the 401
([Authenticate coding agents](https://developers.cloudflare.com/cloudflare-one/access-controls/authenticate-agents/)).
So the answer to "do I need to bypass Access for `/.well-known/oauth-*`?" is
**no — do the opposite**: let Access serve them and do not define those routes in
Hono at all. A route collision here is a silent auth break.

### 3.8 Discovery endpoints (spec requirement)

For completeness, the current spec requires of a protected MCP server:

> "MCP servers **MUST** implement OAuth 2.0 Protected Resource Metadata
> ([RFC9728]). MCP clients **MUST** use OAuth 2.0 Protected Resource Metadata for
> authorization server discovery."
>
> "MCP authorization servers **MUST** provide at least one of the following
> discovery mechanisms: OAuth 2.0 Authorization Server Metadata ([RFC8414]) […]
> OpenID Connect Discovery 1.0"
> — [MCP 2026-07-28 authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

and a 401 shaped like:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource",
                         scope="files:read"
```

Under recommendation (d) **Access satisfies all of this on our behalf.** We
implement none of it. That is the single largest reason to prefer (d).

Also worth noting from the same spec page: Dynamic Client Registration is now
deprecated in favour of Client ID Metadata Documents (CIMD) —
"Dynamic Client Registration is deprecated and retained for backwards
compatibility with authorization servers that do not support Client ID Metadata
Documents" — and the 2026-07-28 blog says DCR is slated for removal after summer
2027. Access's DCR support is therefore correct *today* but is on a clock.

---

## 4. Discovery, registry submission and observability (Server A)

### 4.1 The official MCP Registry

**Status: preview, not GA.** Every registry page carries: "The MCP Registry is
currently in preview. Breaking changes or data resets may occur before general
availability."
([modelcontextprotocol.io/registry/authentication](https://modelcontextprotocol.io/registry/authentication))

Only **Server A** can be listed. The registry requires that "A remote server
**MUST** be publicly accessible at its specified URL"
([Remote servers](https://modelcontextprotocol.io/registry/remote-servers)),
which permanently excludes the Access-protected `admin.grabient.com/mcp`.

**Step 1 — install the publisher.**

```bash
brew install mcp-publisher
# or download the release binary for your platform
```

**Step 2 — prove the `grabient.com` namespace over DNS.** The TXT record goes on
the **apex**, not on an `_mcp` subdomain:

```bash
MY_DOMAIN="grabient.com"
openssl genpkey -algorithm Ed25519 -out key.pem
PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "${MY_DOMAIN}. IN TXT \"v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\""
```

Publish that TXT record, then:

```bash
PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"
mcp-publisher login dns --domain "${MY_DOMAIN}" --private-key "${PRIVATE_KEY}"
```

An HTTP alternative exists (host the same string at
`/.well-known/mcp-registry-auth`), which would be trivial to serve from the Hono
app if DNS is inconvenient.

**Step 3 — write `server.json`.** Domain-based namespaces use the reverse-DNS
form, so ours is `com.grabient/<name>`. Note the transport type string is
**`streamable-http`** with a hyphen:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "com.grabient/palettes",
  "title": "Grabient Palettes",
  "description": "Search, build and render gradient palettes from grabient.com",
  "version": "1.0.0",
  "websiteUrl": "https://grabient.com",
  "remotes": [
    { "type": "streamable-http", "url": "https://grabient.com/mcp" }
  ]
}
```

`packages` is not required — a remote-only entry is valid, and `remotes` and
`packages` may coexist. There is no documented restriction on authless servers.

**Step 4 — publish.**

```bash
mcp-publisher init      # scaffolds server.json
mcp-publisher publish
```

### 4.2 Cloudflare's catalog is first-party only

Cloudflare "runs a catalog of managed remote MCP servers"
([Cloudflare's own MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/)),
but that catalog contains only Cloudflare's own servers, enumerated in the
`cloudflare/mcp-server-cloudflare` repo. **No third-party submission process was
found.** The official MCP Registry is the only listing route.

### 4.3 Testing and observability

**Testing before launch.** Two official tools:

```bash
npx @modelcontextprotocol/inspector@latest
```
plus the Workers AI Playground at
[playground.ai.cloudflare.com](https://playground.ai.cloudflare.com/), which
Cloudflare documents for exactly this
([Test a remote MCP server](https://developers.cloudflare.com/agents/model-context-protocol/guides/test-remote-mcp-server/)).
Note the Inspector's dev-server port and auth env var changed in v2 — if you
follow a stale snippet showing port `5173`/`MCP_PROXY_AUTH_TOKEN` and it fails,
that is why.

**Runtime observability.** Workers Logs is free-plan eligible — "included in both
the Free and Paid Workers plans" — at **200,000 events/day with 3-day
retention**
([Workers Logs pricing](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#pricing)).
Enable in `wrangler.jsonc`:

```jsonc
{ "observability": { "enabled": true, "head_sampling_rate": 1 } }
```

Two practical notes. **Log objects, not interpolated strings** — `console.log({
tool, ms, ok })` gets indexed as queryable fields, `console.log(\`tool=${tool}\`)`
does not. And **watch the budget**: at roughly 2 log events per request the
200k/day allowance is consumed at about 100k requests/day, so sample or trim once
`/mcp` gets real traffic.

For durable per-tool metrics, **Analytics Engine** is the better home — 3-month
retention versus Workers Logs' 3 days:

```jsonc
{ "analytics_engine_datasets": [{ "binding": "MCP_METRICS", "dataset": "mcp_tool_calls" }] }
```

**Tail Workers are Paid-only**
([Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/)),
so do not design around them. Cloudflare ships no MCP-specific observability
dashboard; the MCP-aware logging it does offer (tool-execution logs) is a feature
of **MCP server portals** in Cloudflare One
([MCP governance](https://developers.cloudflare.com/agents/model-context-protocol/governance/)),
which is a different product from a self-hosted server.

---

## 5. Risks

Ordered by how likely they are to actually happen here.

### R1 — Route collision silently breaks Access auth (Server B)
Under Managed OAuth, Access serves `/.well-known/oauth-authorization-server` and
`/.well-known/cloudflare-access-protected-resource/` **on `admin.grabient.com`
itself**. `apps/admin` is a Hono app with `app.use("*")` and a catch-all. If a
future route or the notFound handler answers those paths first, MCP clients get a
malformed discovery document and fail in a way that looks like a client bug.
**Mitigation:** never define `/.well-known/*` routes in `apps/admin`; add a
comment in `index.ts` recording why. Verify after enabling Managed OAuth by
curling both paths and checking they return Access's JSON, not our HTML.

### R2 — Service-token secret leakage (Server B)
A service token is a bearer secret with a **1-year default lifetime** that grants
full analytics access. It will end up in a shell history, a CI variable, or a
teammate's `~/.claude.json`. Unlike an OAuth grant it carries no user identity,
so a leak is unattributable.
**Mitigation:** prefer Managed OAuth for humans and issue **at most one** service
token, for the owner's own automation. Set a short `duration` and refresh it
rather than using `forever`. Enable the "Expiring Access Service Token"
notification. Remember revocation = **delete the token** (§3.4). Never put the
secret in `.mcp.json` at `project` scope, which is committed.

### R3 — Widening the Access policy silently widens data access (Server B)
The whole point of the in-worker `ADMIN_EMAILS` gate is that changing the Access
policy alone should not be enough. Adopting Managed OAuth makes it tempting to
delete that gate for one-step granting.
**Mitigation:** keep both gates, and treat "add to Access policy + add to
`ADMIN_EMAILS`" as the documented grant procedure. If you consciously choose
one-step granting, record the decision in `CLAUDE.md` — this is exactly the class
of change that file exists to protect.

### R4 — PII exposure through analytics tools (Server B)
Search Console, GA4 and D1 product metrics can return data that is personal or
close to it: individual user rows, IPs, rare long-tail queries that identify one
person, email addresses in D1. An MCP tool hands that to a third-party model
provider, which is a different disclosure than a human reading a dashboard. This
compounds with the privacy policy the repo just corrected (commit `e056e40`).
**Mitigation:** design the tools to aggregate, not to select. No `query_d1` /
arbitrary-SQL tool — expose named, parameterised metrics only. Enforce a minimum
bucket size (suppress rows with count < 5). Never return raw email/user-ID
columns. If service tokens are enabled, consider refusing PII-adjacent tools when
`kind === "service"`, since there is no human identity to attribute the read to.

### R5 — Cost abuse on the authless server (Server A)
`search_palettes` spends Vectorize + Workers AI units and `render_png` burns CPU,
with no authentication and no per-caller identity beyond IP. An agent in a retry
loop is indistinguishable from an attacker.
**Mitigation:** the layered posture in §2.4 — Zod caps first (free and reliable),
then the existing `RateLimiter` DO keyed on `CF-Connecting-IP`, tiered so the
expensive tools get a tighter window. Add a Workers Analytics/log-based alert on
`/mcp` request volume so a runaway is noticed in hours, not on the invoice.

### R6 — Confused deputy (Server A, if write tools are added later)
The classic MCP OAuth failure: our server holds a user's credential and a
malicious client induces it into acting with that authority. It does not apply to
Server A today because every tool is anonymous and read-only. It applies the
moment "save palette to my account" exists.
**Mitigation:** if write tools land, do not hand-roll OAuth — use
`@cloudflare/workers-oauth-provider`, which implements the consent screen, PKCE,
state binding and CSRF protections
([Securing MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/guides/securing-mcp-server/)).
The spec's own requirements apply: tokens must be audience-bound
("MCP servers **MUST** validate that access tokens were issued specifically for
them as the intended audience"), and "MCP servers **MUST NOT** accept or transit
any other tokens"
([MCP 2026-07-28 authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)).
Keep write tools on a **separate route with a separate scope** so the read
surface stays authless.

### R7 — `allowedHostnames` misconfiguration (both servers)
The default host allow-list covers localhost and `workers.dev` only. Ship without
setting it and the server works in dev and on the staging `workers.dev` host, then
fails on the real hostname — after the mandated staging smoke test has passed.
**Mitigation:** set `allowedHostnames` explicitly for every environment, and make
the staging smoke test hit the custom hostname, not just `workers.dev`.

### R8 — CORS preflight blocked by Access (Server B, browser clients only)
Access returns 403 to every `OPTIONS` preflight regardless of login state:
> "If you make a preflighted cross-origin request to an Access-protected domain,
> the OPTIONS request will return a `403` error. This error occurs regardless of
> whether you have logged in to the domain."
> — [CORS · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/)
**Mitigation:** none needed for Claude Code / Claude Desktop / Inspector CLI —
non-browser clients send no preflight. Only if a browser-based client (e.g. the
Workers AI Playground) must reach Server B, use **Advanced settings → CORS
settings → Bypass options requests to origin**, and note that doing so shifts
CORS enforcement to our Worker.

### R9 — Deploying to the wrong Worker (Server A)
`CLAUDE.md` records that two applications once both claimed
`grabient-production` and a deploy replaced the live site. Adding `/mcp` to
`apps/web` means MCP work is now on the critical path of the live site.
**Mitigation:** unchanged from existing practice — always `--env`,
`pnpm deploy:staging` and smoke test first, never add bindings to the inert
top-level wrangler config.

### R10 — Prompt injection through returned content (both servers)
Tool output is fed straight into a model's context. For Server A that includes
user-supplied palette names and search strings; for Server B it includes Search
Console query text, which is attacker-controllable by anyone who can make a
search engine record a query.
**Mitigation:** return structured JSON rather than prose, never echo untrusted
text as an instruction-shaped string, and keep tools read-only so an injected
instruction has no privileged action to reach for.

---

## 6. Effort and build order

Estimates are for someone already fluent in this repo. They assume the tools wrap
existing logic rather than adding new palette features.

| # | Stage | Effort | Notes |
|---|---|---|---|
| 1 | **Spike: `createMcpHandler` in `apps/web` behind a flag** — one trivial tool, mounted in Hono, tested with `npx @modelcontextprotocol/inspector@latest` locally | 2–4 h | De-risks the whole plan. Confirms Hono composition, `route`, and `allowedHostnames` before any real tool exists. |
| 2 | **Server A tools** — `get_palette`, `build_palette`, `tweak_palette` (pure, cheap) | 0.5–1 d | Thin wrappers over `palette.ts` / `palette-json.ts`. Most of the work is writing tool descriptions an LLM can actually use. |
| 3 | **Server A expensive tools** — `search_palettes` (Vectorize + AI), `render_png` | 0.5–1 d | Includes Zod caps and the `rateLimitConfig` entry. |
| 4 | **Server A rate limiting + cache policy** | 2–4 h | Add `mcpTool` to `rateLimitConfig`, key on `CF-Connecting-IP`, force `no-store` on `/mcp`. |
| 5 | **Staging deploy + smoke test on the real hostname** | 2 h | Mandated by `CLAUDE.md`. Must exercise the custom hostname (R7). |
| 6 | **Server B: enable Managed OAuth on the existing Access app** | 0.5–1 h | Dashboard toggle + DCR settings. **No code.** Verify the two `/.well-known/` paths (R1). |
| 7 | **Server B tools** — Search Console, CF GraphQL, GA4, D1 metrics | 1–2 d | Wrappers over the existing `search-console.ts`, `traffic.ts`, `queries.ts`. The real cost is the aggregation/suppression rules from R4, not the plumbing. |
| 8 | **Server B mount + verify auth** | 2–4 h | `app.all("/mcp", ...)` below the existing `verifyAccess` middleware. Confirm an un-allow-listed identity gets 403. |
| 9 | *(optional)* **Service token + `access.ts` change** | 3–5 h | Only if headless automation is actually needed. Includes the union-type refactor and its call sites. |
| 10 | *(optional)* **Registry submission for Server A** | 2–4 h | See §4. Mostly DNS propagation waiting. |
| 11 | *(later)* **OAuth write tools on Server A** | 3–5 d | Genuinely separate project — `workers-oauth-provider`, `OAUTH_KV`, consent UI, better-auth bridging. Do not scope-creep this into stage 2. |

**Recommended order: 1 → 6 → 8 → 7 → 2 → 3 → 4 → 5.**

The non-obvious part is doing **Server B before Server A**. Three reasons: stage 6
is a dashboard toggle with no code, so it validates the entire auth story for
almost nothing; Server B is private, so a mistake there is not a public incident;
and Server A ships into the Worker that serves the live site, which is the one
place `CLAUDE.md` most wants you to be careful. Get the pattern right where it is
cheap to be wrong.

Stage 11 is deliberately last and deliberately separate. Adding OAuth to Server A
converts it from "zero-friction public tool" to "thing with a consent screen",
which is in direct tension with the maximum-adoption goal. If write tools are
wanted, strongly consider a **second route** (`/mcp/account`) with its own
`createMcpHandler` and its own OAuth wrapper, leaving `/mcp` authless forever.

---

## 7. UNVERIFIED

Everything here is a gap in the official documentation, not a guess I am
presenting as fact. Each item names the cheapest way to settle it.

1. **Workers Rate Limiting binding on the Workers Free plan.** The
   [binding docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
   state no plan restriction, and none appears on the Workers pricing or limits
   pages — but there is also no positive "included in Free" statement. *Settle
   by:* adding the binding to the staging Worker and deploying.

2. **Whether this account is on Workers Free or Workers Paid.** `apps/web`
   declares `"new_classes": ["RateLimiter"]` (a KV-backed, non-SQLite Durable
   Object), while
   [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
   says the Free plan "can only create and access SQLite-backed Durable
   Objects". A successfully deployed KV-backed DO therefore implies Workers Paid,
   but I could not confirm the account tier. This matters for item 1, for Tail
   Workers, and for cost modelling. *Settle by:* checking the dashboard.

3. **Whether the Workers Rate Limiting binding formally exited beta.** It was
   announced as an open beta; the current docs page carries no beta banner.
   Inconclusive either way.

4. **Free-plan WAF action availability.** The
   [availability table](https://developers.cloudflare.com/waf/rate-limiting-rules/)
   gives rule counts, periods, characteristics and fields per plan, but does not
   break out which *actions* (block vs managed challenge) each plan may use.
   Low impact — §2.4 recommends not using the WAF here at all.

5. **Whether Managed OAuth has a Zero Trust plan requirement.** The
   [Managed OAuth page](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
   states no plan gate. Since the entire Server B recommendation rests on this
   feature, **verify it in the dashboard before committing to the plan** — this
   is the single highest-value unknown in this document. Fallback if it is
   gated: service tokens (§3.4) plus the `access.ts` change (§3.5), which loses
   easy per-person granting.

6. **Whether the MCP Registry actively probes a remote URL at publish time**, and
   whether the remote host must match the DNS-authenticated domain. The
   requirement that the server "MUST be publicly accessible" is documented; the
   enforcement mechanism is not. *Settle by:* publishing and observing.

7. **Whether `repository` is required in `server.json` for a remote-only entry.**
   The official remote example omits it, which implies optional, but no
   statement says so.

8. **Whether Claude Desktop / claude.ai Custom Connectors accept an authless
   remote server.** The
   [support article](https://support.claude.com/en/articles/11175166-about-custom-connectors-remote-mcp)
   documents OAuth client ID/secret fields and never states that auth is
   mandatory, but documents no no-auth path either. Affects Server A's reach.
   *Settle by:* adding `https://grabient.com/mcp` as a custom connector after
   stage 5.

9. **Whether ChatGPT connectors can send custom headers.** Not documented;
   treated as unsupported above.

10. **Whether a Bypass policy scoped to `/.well-known/*` takes precedence over
    Access's own Managed OAuth handlers on those paths.** Not documented either
    way. Moot under the recommended design (§3.7 says let Access own those
    paths), and relevant only if you reject the recommendation.

11. **Whether Access sets the `CF_Authorization` cookie for service-token
    requests.** The docs say browsers "also" receive the cookie, which implies
    non-browser clients do not, but no sentence states it outright. Immaterial —
    `access.ts` already prefers the `Cf-Access-Jwt-Assertion` header, which
    Cloudflare explicitly recommends "since the cookie is not guaranteed to be
    passed".

12. **The exact `McpServerFactory` signature and the cleanest way to close over
    Hono's `c.env`.** I confirmed the handler is a plain callable and that the
    factory receives a request context containing `era`, `authInfo` and
    `requestInfo`, but did not confirm a canonical Hono-composition example from
    Cloudflare. The §2.2 snippet is therefore marked as a sketch. *Settle by:*
    the stage-1 spike — this is precisely what it is for.

13. **Header casing `CF-Access-Client-Id` vs `CF-Access-Client-ID`.** The prose
    docs and the API reference disagree. HTTP header names are case-insensitive,
    so this is a documentation inconsistency rather than a functional one.

---

## Owner decisions — 2026-08-16

**Total isolation between the two servers, no exceptions.** The analytics server
is internal-only and must never be reachable without Cloudflare Access. Concretely:

- The two servers stay in separate Workers on separate hostnames — `apps/web`
  serves `grabient.com/mcp` (authless, palette math only), `apps/admin` serves
  `admin.grabient.com/mcp` (Access-protected). This is already the deployment
  shape; do not collapse them for convenience.
- **Analytics tools must never be registered in the `apps/web` worker**, not even
  behind a flag or "temporarily for testing." That is the single change that
  would create real exposure, and it is the rule to enforce in review.
- **Only the public palette server is published to the MCP registry.** There is
  no reason to advertise an internal tool in a public catalog; people who are
  granted access configure it by URL directly.

**On registry namespace verification (clarification, because it reads as
alarming):** proving control of `grabient.com` is a *publishing credential*, not
an access grant. It establishes the right to name entries `com.grabient/…` in the
public catalog. It grants nobody access to any server, creates no trust path
between the two, and exposes nothing that DNS does not already make public. The
fact that one proof would *permit* publishing `com.grabient.admin/...` is
irrelevant when we simply never publish that entry.

**Distribution channels:** Cloudflare has no public third-party MCP directory
today, so the official registry is the only listing channel. Treat that as a
snapshot rather than a permanent constraint — the ecosystem is young, and new
surfaces are likely to open as adoption grows. Worth re-checking before each
release rather than assuming today's answer holds.

**Production deploy of the SEO batch is deferred** until the work reaches a more
polished state. Staging remains the integration target in the meantime.
