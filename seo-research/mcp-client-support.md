# MCP client compatibility — what actually works, per client

Researched 2026-08-16 from official docs (URLs at the bottom of each claim in the
source report). Decides the auth architecture for both planned servers.

## Headline: no client requires OAuth

All five major clients document an authless remote-server path. So the **public
palette server can be authless and work everywhere**, with no adoption tax. That
was the open question and it is settled.

| Client | Authless remote OK? | Custom headers? |
|---|---|---|
| Claude Code CLI | yes | **yes** — `--header`/`-H`, repeatable; `headers` in `.mcp.json`; `headersHelper` for dynamic tokens |
| Cursor | yes | **yes** — `headers` + `${env:NAME}` interpolation |
| VS Code / Copilot | yes | **yes** — `headers` + `${input:...}` secret prompts |
| claude.ai / Claude Desktop connectors | yes (`none` auth type) | **beta, allowlisted names only**, max 4 |
| ChatGPT developer mode | yes (`noauth` scheme) | **no** — URL or Secure MCP Tunnel only |
| OpenAI Responses/Realtime API | yes | yes — `headers` object on the `mcp` tool |

## The consequence for the private analytics server

Service tokens (`CF-Access-Client-Id` / `CF-Access-Client-Secret`) work **out of
the box in Claude Code, Cursor and VS Code** — Cloudflare's own MCP Portals docs
show exactly this two-header pattern.

They do **not** work in:
- **ChatGPT** — no custom header support at all.
- **claude.ai / Claude Desktop connectors** — header names are restricted to a
  reviewed allowlist (documented examples: `authorization`, `x-api-key`,
  `x-auth-token`). Whether `cf-access-client-id` is on it is UNVERIFIED and would
  need an Anthropic rep to add. Also note Anthropic connects **from Anthropic's
  cloud**, not the user's machine, so the endpoint must be publicly reachable.

## Recommendation: Cloudflare Access Managed OAuth, with service tokens alongside

Cloudflare ships **Managed OAuth** for Access applications, which turns Access
into a standard OAuth 2.0 authorization server. Critically, "when managed OAuth
is enabled, Access returns a `401` response instead of a `302` redirect to
non-browser clients," carrying a `WWW-Authenticate` header pointing at Access's
OAuth discovery metadata — which is precisely the handshake an MCP client
expects.

Two properties make this the right answer to "easiest secure path where I can
still grant people access":

1. **Granting is adding an email to the Access policy.** Revoking is removing it.
   No secret is ever handed over, nothing to rotate or leak.
2. **The existing code already satisfies its requirement.** Cloudflare's docs
   state the MCP server "must validate the Access JWT sent in the
   `Cf-Access-Jwt-Assertion` header" — which `apps/admin/src/access.ts` already
   does, with `createRemoteJWKSet` + audience check + email allowlist, failing
   closed. Managed OAuth slots in under the auth layer that exists.

Keep **service tokens as the second door** for headless use (cron, CI, an agent
session with no human present). Both terminate at the same Access policy, so
authorization stays in one place. The only code change is teaching `access.ts` to
accept a service-token identity (`common_name` claim) in addition to `email`.

Caveats to verify at build time: Managed OAuth requires a client supporting
RFC 8707, and whether a given MCP client satisfies that in practice is
UNVERIFIED. Cloudflare also warns not to enable it if you run your own OAuth
server behind the same Access application — we do not.

## Spec change that simplifies the build

The 2026-07-28 MCP revision **made the protocol stateless**: the
`initialize`/`notifications/initialized` handshake is removed, and protocol-level
sessions plus the `Mcp-Session-Id` header are gone from Streamable HTTP — every
request now carries its protocol version and capabilities in `_meta`.

For a Workers implementation this is good news: there is no session state to
keep, which is the usual reason an MCP server needs a Durable Object. Worth
confirming against the Agents SDK's current requirements before assuming we can
skip DO bindings entirely.

Also deprecated in that revision: HTTP+SSE transport (12-month offramp), and OAuth
Dynamic Client Registration in favor of Client ID Metadata Documents. Anthropic
separately warns that DCR "causes Claude to register a new client on every fresh
connection," so CIMD is the direction of travel if we ever run our own OAuth.

## What a granted user would run

Claude Code, with a service token:

```bash
claude mcp add --transport http grabient-analytics https://admin.grabient.com/mcp \
  -H "CF-Access-Client-Id: <id>" -H "CF-Access-Client-Secret: <secret>"
```

Cursor (`~/.cursor/mcp.json`), keeping secrets in the environment:

```json
{
  "mcpServers": {
    "grabient-analytics": {
      "url": "https://admin.grabient.com/mcp",
      "headers": {
        "CF-Access-Client-Id": "${env:GRABIENT_CF_ID}",
        "CF-Access-Client-Secret": "${env:GRABIENT_CF_SECRET}"
      }
    }
  }
}
```

With Managed OAuth instead, the same clients need only the URL — the browser flow
handles identity, and access is governed entirely by the Access policy.
