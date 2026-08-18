# Authenticating the admin MCP server for Claude, ChatGPT and Kimi

Research date: **2026-08-17**. Server under discussion: `https://admin.grabient.com/mcp`
(Cloudflare Workers + Hono, `apps/admin/src/mcp.ts`, behind Cloudflare Access —
see `apps/admin/src/access.ts`).

Every capability claim below carries a URL that was actually fetched while writing
this. Claims I could not confirm from an official source are marked **UNVERIFIED**
with the exact gap named. Nothing here is written from memory.

---

## 0. Live facts measured against the real deployment

These are not documentation claims; they are `curl` observations against the
production hostname on 2026-08-17, and they change the answer materially.

**a. The `/mcp` endpoint today answers an unauthenticated MCP POST with `302`, not `401`.**

```
$ curl -X POST https://admin.grabient.com/mcp -H 'Accept: application/json, text/event-stream' \
    -H 'MCP-Protocol-Version: 2026-07-28' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

HTTP/2 302
location: https://grabient.cloudflareaccess.com/cdn-cgi/access/login/admin.grabient.com?...
www-authenticate: Cloudflare-Access resource_metadata="https://admin.grabient.com/.well-known/cloudflare-access-protected-resource/mcp"
```

Two problems for MCP clients: the status is `302` (Anthropic's connector docs state
"The `401` status is required" for the discovery handshake —
<https://claude.com/docs/connectors/building/authentication>), and the challenge
scheme is `Cloudflare-Access`, not `Bearer` as RFC 6750 / the MCP spec expect.
**No MCP client can currently negotiate auth with this server.** This is the
concrete reason nothing works today.

**b. Cloudflare already serves a protected-resource metadata document for the app**, and
its `resource` value already matches the MCP URL exactly:

```
$ curl https://admin.grabient.com/.well-known/cloudflare-access-protected-resource/mcp
{"resource":"https://admin.grabient.com/mcp","protected":true,
 "team_domain":"grabient.cloudflareaccess.com",
 "authorization_servers":["https://grabient.cloudflareaccess.com"],
 "authentication_methods":[{"name":"cloudflared", ...}]}
```

Note the only advertised non-browser method today is `cloudflared` — i.e. Managed
OAuth is **not** enabled on this application yet.

**c. The team's Access authorization server is already live and OAuth-capable**, on
the current free Zero Trust plan:

```
$ curl https://grabient.cloudflareaccess.com/.well-known/oauth-authorization-server
{"issuer":"https://grabient.cloudflareaccess.com",
 "authorization_endpoint":".../cdn-cgi/access/oauth/authorization",
 "token_endpoint":".../cdn-cgi/access/oauth/token",
 "response_types_supported":["code"],
 "grant_types_supported":["authorization_code","refresh_token"],
 "token_endpoint_auth_methods_supported":["client_secret_basic","client_secret_post","none"],
 "revocation_endpoint":".../cdn-cgi/access/oauth/revoke",
 "registration_endpoint":".../cdn-cgi/access/oauth/registration",
 "code_challenge_methods_supported":["S256"]}
```

This is the single most useful finding in this report. The account already exposes
RFC 8414 metadata with a **dynamic client registration endpoint**, **S256 PKCE**, and
**public-client (`none`) token auth** — exactly the three things Claude, Claude Code
and ChatGPT need. What is missing is only the per-application toggle that makes
Access return `401 Bearer` instead of `302` (see §2).

Caveat worth recording: the metadata does **not** advertise
`client_id_metadata_document_supported`, so CIMD-capable clients will fall back to
DCR. Per Anthropic, Claude "selects CIMD only when your authorization server metadata
advertises **both** `client_id_metadata_document_supported: true` **and** `none` in
`token_endpoint_auth_methods_supported`... If either is missing, Claude falls back to
DCR" (<https://claude.com/docs/connectors/building/authentication>). DCR is present,
so this is fine — it just means a new client registration per fresh connection.

---

## 1. Client × auth method matrix

"Custom headers" is the column that decides whether Cloudflare Access **service
tokens** (`CF-Access-Client-Id` / `CF-Access-Client-Secret` —
<https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/>)
are usable at all in that client.

| Client | (a) OAuth 2.1 auth-code + DCR | (b) Static bearer token | (c) Arbitrary custom HTTP headers | (d) Unauthenticated | Citation |
|---|---|---|---|---|---|
| **claude.ai web / desktop / mobile** | **Yes** — `oauth_dcr` and `oauth_cimd` "Supported out of the box"; optional pre-registered client ID/secret in Advanced settings | **Yes, but beta + gated** — `static_headers`, "in beta... contact Anthropic for early access" | **No (effectively)** — header *names* are restricted to a reviewed allowlist ("`authorization`, `x-api-key`, `x-auth-token`"); max 4 headers. `CF-Access-Client-Id`/`-Secret` are **not** named and would need an allowlist addition via an Anthropic rep | Yes (`none` / authless) | <https://claude.com/docs/connectors/building/authentication>, <https://claude.com/docs/connectors/custom/remote-mcp> |
| **Claude Code CLI** | **Yes** — DCR, CIMD, and pre-registered credentials (`--client-id` / `--client-secret`); `/mcp`, `claude mcp login <name>` | **Yes** — `claude mcp add --transport http x URL --header "Authorization: Bearer …"` | **Yes, fully arbitrary** — `--header`/`-H` (repeatable), `headers` in `.mcp.json`, plus `headersHelper` to generate headers at connect time | Yes | <https://code.claude.com/docs/en/mcp> |
| **ChatGPT (connectors / developer mode)** | **Yes** — "OAuth, No Authentication, and Mixed Authentication"; CIMD with `none` or `private_key_jwt`; "Dynamic client registration remains supported when configured" | **No** | **No** — "nor can it present custom API keys or customer-provided mTLS certificates" | Yes ("No Authentication") | <https://developers.openai.com/api/docs/guides/developer-mode>, <https://developers.openai.com/apps-sdk/build/auth>, <https://developers.openai.com/api/docs/mcp> |
| **OpenAI API (Responses API MCP tool)** — *not ChatGPT* | n/a (you supply the token) | **Yes** — `authorization` parameter carrying an access token | **No** — only `authorization` is documented | Yes | <https://developers.openai.com/api/docs/guides/tools-connectors-mcp> |
| **Kimi Code CLI** | **Yes** — `--auth oauth`, then `kimi mcp auth <name>` (or `/mcp-config login <server>`) | **Yes** — `headers` / `bearerTokenEnvVar` in `mcp.json` | **Yes, fully arbitrary** — `kimi mcp add --transport http NAME URL --header "KEY: VALUE"`; `headers` map in `~/.kimi/mcp.json` | Yes | <https://moonshotai.github.io/kimi-cli/en/customization/mcp.html>, <https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html> |
| **Kimi consumer chat (kimi.com web app)** | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** | **UNVERIFIED** | — |

### Notes on the matrix

- **Kimi ambiguity.** "Kimi" in the request is ambiguous. I verified **Kimi Code CLI**
  thoroughly from two official Moonshot properties. I could **not** find any official
  documentation for adding a custom remote MCP connector in the **kimi.com consumer
  chat product**; the only web-surface MCP configuration I found documented is the
  Kimi API **Playground**, which is described as sourcing MCP services from a
  ModelScope partnership rather than an arbitrary user-supplied URL
  (<https://platform.kimi.ai/docs/guide/configure-the-modelscope-mcp-server> appeared
  in search results but I did not fetch it, so treat even that as unconfirmed).
  **If the owner means kimi.com chat rather than the CLI, that row is unanswered.**
- **The two Kimi CLI docs disagree on surface details.** The moonshotai.github.io copy
  documents `kimi mcp add --transport http … --header "KEY: VALUE"` and `--auth oauth`;
  the www.kimi.com copy documents the same capabilities through `mcp.json` (`headers`,
  `bearerTokenEnvVar`) and `/mcp-config login`. Both agree on the **capabilities**
  (static headers: yes; OAuth: yes), which is all the matrix depends on. The exact flag
  spelling should be confirmed against the installed version.
- **claude.ai `static_headers` is the trap.** It reads like "yes, custom headers", but
  the docs are explicit: "Claude accepts a fixed set of standard authentication and
  routing header names such as `authorization`, `x-api-key`, and `x-auth-token`. Header
  names are restricted to this allowlist for security reasons... To request an addition
  to the allowlist, contact your Anthropic representative." Cloudflare's service-token
  headers are non-standard names. **UNVERIFIED**: whether `CF-Access-Client-Id` /
  `CF-Access-Client-Secret` happen to already be on that allowlist — the full list is
  not published. Assume no.
- **ChatGPT is the binding constraint.** OpenAI's own docs rule out every non-OAuth
  option: no API keys, no custom headers, no client-credentials/service-account grants.
  So **service tokens can never work in ChatGPT**, and any plan that depends on headers
  is a two-client plan at best.

---

## 2. Cloudflare Access "Managed OAuth" and MCP server portals

### What exists

**Managed OAuth** shipped **2026-03-20**
(<https://developers.cloudflare.com/changelog/post/2026-03-20-managed-oauth/>). It
"allows non-browser clients — such as CLIs, AI agents, SDKs, and scripts — to
authenticate with Access-protected applications using a standard OAuth 2.0
authorization code flow." It is **opt-in for existing self-hosted applications** and
**enabled by default on new MCP server portals**.

The mechanism (<https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/>):

1. **"Access returns a `401` response instead of a `302` redirect to non-browser
   clients. The `401` includes a `WWW-Authenticate` header that points the client to
   Access's OAuth discovery metadata."** ← this is precisely the defect measured in §0a.
2. The client fetches authorization server metadata from the `/.well-known/` endpoint,
   conforming to **RFC 8414 and RFC 9728**; the doc gives the path
   `https://<your-app-domain>/.well-known/oauth-authorization-server`.
3. Standard authorization-code flow in the user's browser against the Access login,
   backed by the existing IdP (Google SSO here).
4. Access issues an **opaque** access token (documented format `oauth:CvNoo…`) — not a
   JWT. The client cannot decode it and does not need to.
5. **Cloudflare resolves the token and forwards a signed assertion to the origin in the
   `Cf-Access-Jwt-Assertion` header, identical to browser-authenticated requests.**

That last point is the important one for this codebase: **`apps/admin/src/access.ts`
needs no changes at all.** It already verifies `Cf-Access-Jwt-Assertion` against the
team JWKS and checks `email` against `ADMIN_EMAILS`. Cloudflare's own guidance is the
mirror image of this: "Only enable Managed OAuth for MCP servers that validate the
Access JWT sent by Cloudflare"
(<https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/secure-mcp-servers/>).
This Worker does exactly that.

**Prerequisites**, quoted: "A self-hosted Access application, MCP server application,
or MCP server portal" and "An OAuth client that supports RFC 8707". The MCP spec makes
`resource` (RFC 8707) a **MUST** for clients (§3), so any spec-compliant client
qualifies.

**Settings available** (Advanced settings tab): allow localhost clients, allow loopback
clients, allowed redirect URIs (supports `/*` wildcard), grant session duration, access
token lifetime. Cloudflare's own recommendation for CLI/agent use is a **5–15 minute
access token lifetime with a 1–2 week grant session**. DCR is supported: clients may
dynamically register redirect URIs matching the allowed patterns, or on
localhost/loopback when those toggles are on. **Claude Code needs the loopback/localhost
toggles**, because it uses an RFC 8252 loopback redirect on an ephemeral port and
declares `http://localhost/callback` and `http://127.0.0.1/callback` in its CIMD
(<https://claude.com/docs/connectors/building/authentication>). **claude.ai needs
`https://claude.ai/api/mcp/auth_callback`** in the allowed redirect URIs (same source).

**Documented limitation that matters:** "Cannot enable on applications running their own
OAuth server with custom `WWW-Authenticate` headers." That rules out combining Managed
OAuth with option (b) below.

### MCP server portals

A separate, heavier feature
(<https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/>):
it "consolidate[s] multiple MCP servers onto a single HTTP endpoint", served at
`https://<subdomain>.<domain>/mcp`, with per-tool/per-prompt curation and per-request
Access logging. Setup is *Zero Trust → Access controls → AI controls*: register the
upstream server under the **MCP servers** tab (name, optional server ID, **HTTP URL**,
policies), then **Add MCP server portal** (name, custom domain + subdomain, member
servers, policies). Prerequisites: "An active domain on Cloudflare" using full or
partial (CNAME) setup, plus "An identity provider configured on Cloudflare Zero Trust".
Via API/Terraform you must hand-create "a proxied CNAME record that points your portal
subdomain to `gateway.agents.cloudflare.com`". Limits: max 40 MCP servers per portal;
HTTP transport only (stdio unsupported); "Some MCP servers block proxy-based clients",
returning 403. Managed OAuth is on by default for portals: "Non-browser clients
authenticate to the portal using a standard OAuth 2.0 authorization code flow via
managed OAuth."

Portals are the right tool for aggregating several servers with tool-level governance.
For **one** server that already sits on its own Access-protected hostname, they add a
second hostname, a CNAME, and a proxy hop for no benefit the toggle doesn't already give.

### Plan requirements — **UNVERIFIED**

**I could not find any official Cloudflare statement about which Zero Trust plan
Managed OAuth or MCP server portals require.** The Managed OAuth doc, the MCP portals
doc, the AI-controls index, and the changelog entry all contain **no** plan-tier
information; I checked each. `cloudflare.com/plans/zero-trust-services/` did not render
a feature matrix. The service tokens doc says only "Included with Purchase of Access".
The only strong signal is the empirical one from §0c: **this account's free-plan team
domain already serves a fully-populated OAuth authorization server with a DCR
endpoint**, which is the infrastructure Managed OAuth rides on. That makes it likely —
not proven — that the toggle is available. **Verification is a 30-second dashboard
check** (see §6, step 1), and it must be done before committing to this path.

I also could not verify whether, once Managed OAuth is enabled, Access changes the
`WWW-Authenticate` scheme from the observed `Cloudflare-Access` to `Bearer`. The doc
says the `401` "points the client to Access's OAuth discovery metadata" but does not
print the header. Since Claude and ChatGPT both key on RFC 6750 `Bearer` challenges,
**this is the single highest-risk unknown in the recommended plan** and is what step 2
of §6 tests.

---

## 3. What the MCP spec requires of authorization (revision 2026-07-28)

The **current** protocol revision is **2026-07-28**
(<https://modelcontextprotocol.io/specification/versioning>). It removed the
`initialize` handshake and `Mcp-Session-Id`; every request now carries its own protocol
version and capabilities, and an optional `server/discover` RPC replaces the handshake
for clients that want capabilities up front
(<https://blog.modelcontextprotocol.io/posts/2026-07-28/>). Statelessness does not
change the auth story much — authorization was already per-request HTTP — but it does
mean `Authorization` must be on **every** request.

From <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization>,
with the normative keywords as written:

**Framing:** "Authorization is **OPTIONAL** for MCP implementations." HTTP-transport
implementations that do support it **SHOULD** conform to this specification. A protected
MCP server is an **OAuth 2.1 resource server**; the MCP client is an OAuth 2.1 client;
the authorization server may be co-hosted or separate.

**Server-side MUSTs** (this is the minimum bar):

| Requirement | Level | Who |
|---|---|---|
| Implement OAuth 2.0 Protected Resource Metadata (**RFC 9728**) | **MUST** | MCP server |
| Validate access tokens per OAuth 2.1 §5.2 | **MUST** | MCP server |
| Validate the token was issued **for them as the intended audience** (RFC 8707 §2) | **MUST** | MCP server |
| Return **401** for invalid/expired tokens; 403 for insufficient scope; 400 for malformed | **MUST** | MCP server |
| Accept **only** tokens valid for their own resources; **MUST NOT** accept or transit any other tokens | **MUST** | MCP server |
| Include a `scope` parameter in the `WWW-Authenticate` challenge | **SHOULD** | MCP server |
| Omit `offline_access` from `scopes_supported` / challenge scope | **SHOULD NOT** include | MCP server |

**Authorization-server MUSTs:**

| Requirement | Level |
|---|---|
| Implement OAuth 2.1 with appropriate measures for confidential and public clients | **MUST** |
| Provide **at least one** of RFC 8414 AS Metadata **or** OpenID Connect Discovery 1.0 | **MUST** |
| Support **Client ID Metadata Documents** | **SHOULD** |
| Support **Dynamic Client Registration** (RFC 7591) | **MAY** — and DCR is now "**deprecated** and retained for backwards compatibility with authorization servers that do not support Client ID Metadata Documents" |
| Include the `iss` parameter in authorization responses (RFC 9207) | **SHOULD** (flagged as a future **MUST**) |

**Client MUSTs** worth knowing because they constrain the server:

- Use RFC 9728 protected resource metadata for authorization server discovery — **MUST**.
- Implement RFC 8707 `resource` indicators; include `resource` in **both** authorization
  and token requests, identifying the canonical MCP server URI — **MUST**, "regardless
  of whether authorization servers support it".
- Send `Authorization: Bearer <token>` on **every** HTTP request — **MUST**.
- **Access tokens MUST NOT be included in the URI query string.**
- Validate the `iss` in the authorization response before redeeming the code (RFC 9207
  table) — **MUST**.

**Client registration** (<https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration>):
three mechanisms — CIMD, pre-registration, DCR — with a **SHOULD** priority order of
(1) pre-registered credentials, (2) CIMD if the AS advertises
`client_id_metadata_document_supported`, (3) DCR if the AS advertises a
`registration_endpoint`, (4) prompt the user. DCR carries an explicit deprecation
warning: "New implementations should use Client ID Metadata Documents instead."

**Minimum a server must implement for broad client support:**

1. Return **`401`** with **`WWW-Authenticate: Bearer resource_metadata="…"`** on an
   unauthenticated request. (Anthropic: "**Always return a `401`**… The `401` status is
   required — Claude does not honor a `WWW-Authenticate` header on a `200` response.")
2. Serve an **RFC 9728** protected resource metadata document whose `resource` matches
   the MCP URL **exactly as the user types it**, and whose `authorization_servers[0]` is
   the issuer. (Anthropic: "Claude uses the first entry and does not fall back to later
   entries".) The document may live on any HTTPS host — a useful escape hatch for
   Workers that cannot serve `/.well-known/*` at the root.
3. Have an authorization server that serves **RFC 8414** (or OIDC Discovery) metadata,
   supports **S256 PKCE**, and offers **CIMD and/or DCR** so clients with no prior
   relationship can get a `client_id`.
4. **Validate the audience** of every token.

Cloudflare Access, once Managed OAuth is on, is claimed to supply items 1–3 for you;
item 4 is Cloudflare's job too, since the Worker never sees an OAuth token — it sees
the `Cf-Access-Jwt-Assertion` it already verifies (with `audience: CF_ACCESS_AUD`, which
is the audience check).

---

## 4. The `agents` npm package

**Version:** `agents@0.20.1` is `latest` on the registry (checked via
`registry.npmjs.org/agents`, 645 published versions). The project's usage
(`createMcpHandler` from `agents/mcp/server`) is the **current** path.

**Is `McpAgent` deprecated? Yes — explicitly, in the package's own shipped docs.** From
`package/docs/mcp-servers.md` inside the `agents-0.20.1.tgz` tarball:

> | `createMcpHandler()` | … | New servers and the draft MCP protocol |
> | `McpAgent` (deprecated legacy path) | … | Existing stateful SDK v1 deployments |
>
> - **`createMcpHandler()`** is the current server-development path. It serves draft MCP
>   `2026-07-28` and supports stateless published 2025 clients by default.
> - **`McpAgent`** is a retained, feature-frozen SDK v1 path for existing stateful
>   deployments. New servers should use `createMcpHandler()`.

and later: "`McpAgent` … remains available for existing SDK v1 deployments but is
deprecated and feature-frozen". Cloudflare's public docs corroborate, referring to
"existing deprecated `McpAgent` routes"
(<https://developers.cloudflare.com/agents/model-context-protocol/authorization/>).
Also note a second deprecation that could bite later: passing an SDK **v1** server
object directly to `createMcpHandler` "is deprecated, emits a migration warning, and is
removed in the next major release."

**Does `agents` provide a built-in OAuth/auth helper? No — not in `agents` itself.** The
OAuth implementation lives in a **separate package**, `@cloudflare/workers-oauth-provider`.
From `package/docs/securing-mcp-servers.md` in the same tarball:

> Cloudflare's `workers-oauth-provider` lets you secure your MCP Server (or any
> application) running on a Cloudflare Worker. The provider handles token management,
> client registration, and access token validation automatically.

with the composition pattern being `new OAuthProvider({ authorizeEndpoint, tokenEndpoint,
clientRegistrationEndpoint, apiRoute: "/mcp", apiHandler: createMcpHandler(createServer),
defaultHandler: AuthHandler })`. Cloudflare's docs say the same: "Cloudflare provides an
OAuth Provider Library that implements the provider side of the OAuth 2.1 protocol."

What `agents` **does** provide is the *consumption* side: `createMcpHandler` surfaces
provider-issued token metadata to tool callbacks at `context.http.authInfo` (with
`clientId`, `scopes`), and `getMcpAuthContext().props` for application props. The docs
warn: "Do not log or return `context.http.authInfo.token`."

Practical consequence: **the `agents` package gives this project nothing toward auth
today.** Adding OAuth in-Worker means adopting `@cloudflare/workers-oauth-provider`, a
KV binding (`OAUTH_KV`), and hand-writing a consent dialog with CSRF protection, HTML
escaping of client metadata, and a CSP — all of which the package's
`securing-mcp-servers.md` spells out as *your* responsibility, at roughly 160 lines for
the trivial password-gate example it ships.

---

## 5. Recommendation, ranked

### Rank 1 — **Cloudflare Access Managed OAuth on the existing self-hosted application**

| | |
|---|---|
| **Claude Code** | Works. DCR + S256 PKCE + `none` public client all present in the live AS metadata (§0c); needs loopback/localhost redirects enabled. |
| **claude.ai** | Works. `oauth_dcr` is "supported out of the box"; needs `https://claude.ai/api/mcp/auth_callback` in allowed redirect URIs. |
| **ChatGPT** | Should work — OAuth is the *only* thing it supports, and "Dynamic client registration remains supported when configured". **UNVERIFIED end-to-end** against Access specifically. |
| **Kimi Code CLI** | Works. `--auth oauth` / `/mcp-config login`. |
| **Kimi web chat** | UNVERIFIED (see §1). |
| **Security** | Best of all options. Per-user identity, no shared secret, existing Google SSO, existing `ADMIN_EMAILS` second gate untouched, short-lived opaque tokens, revocable per user by editing the Access policy. |
| **Effort** | ~15 minutes of dashboard work. **Zero Worker code changes.** |
| **Risk** | Two unknowns: free-plan availability of the toggle, and whether Access's `401` uses a `Bearer` challenge. Both are testable in minutes and both are pass/fail before you tell anyone the URL. |

This is the answer the owner's stated goals point at: it grants named people access
without a shared credential, by construction.

### Rank 2 — **Service tokens where headers work, Managed OAuth or nothing elsewhere**

Works in **Claude Code** and **Kimi Code CLI** only. Impossible in **ChatGPT**
(official: cannot present custom API keys or headers). On **claude.ai**, only through
the `static_headers` beta *and* an allowlist addition for `CF-Access-Client-*`, which
requires an Anthropic representative — so realistically no.

The security trade-off is the real objection: a service token is a **shared static
credential** with no user identity, which is the opposite of "a few named people without
a shared credential". Cloudflare's own comparison is blunt: "Managed OAuth = user-based
authentication… Service tokens = machine-based authentication (shared secrets)".
`apps/admin/src/access.ts` already implements the `common_name` → `ADMIN_SERVICE_TOKENS`
path correctly, so effort here is near zero — which makes this an excellent **fallback
for the owner's own CLI** while Managed OAuth is being validated, and a poor primary.

Note it also requires an Access policy whose action is **Service Auth**, otherwise
Access still prompts for IdP login.

### Rank 3 — **Cloudflare MCP server portal in front of this server**

Same client support as Rank 1 (managed OAuth is on by default for portals), plus
tool-level curation and per-request logging. Costs a new subdomain, a proxied CNAME to
`gateway.agents.cloudflare.com`, and a proxy hop; and Cloudflare warns "Some MCP servers
block proxy-based clients". Worth revisiting if a second MCP server appears or if
per-tool access control per person becomes a requirement. Overkill for one server today.

### Rank 4 — **Implement OAuth in the Worker with `@cloudflare/workers-oauth-provider`**

Works with all OAuth-capable clients and gives total control. But it is **mutually
exclusive with Managed OAuth** ("Cannot enable on applications running their own OAuth
server with custom `WWW-Authenticate` headers"), which means removing Access from `/mcp`
and making the Worker the sole gate — dismantling a security boundary that currently
works. It also needs a KV namespace, a consent UI with CSRF tokens, input sanitisation,
a CSP, an upstream IdP to actually identify people, plus ongoing responsibility for
token storage and rotation. Choose this only if Rank 1 fails its verification, and
even then compare against Rank 3 first.

### Rank 5 — **Secret bearer token in the URL path**

The only approach that would work in **ChatGPT without OAuth** (it's just an "authless"
server on an unguessable path). Everything else about it is bad. The MCP spec says
access tokens "**MUST NOT** be included in the URI query string"; Anthropic calls a
credential in a URL "a security vulnerability: URLs are routinely recorded in server
logs, proxies, and browsing history" and marks it "**not recommended**". A path segment
is not meaningfully safer than a query parameter. It is also a shared credential with no
identity and no revocation short of rotating the path, and it requires punching a hole
in the Access policy so the Worker becomes the only gate. **Do not ship this.**

### Combinations that are simply impossible today

- **Cloudflare Access service tokens + ChatGPT** — ChatGPT cannot send custom headers,
  full stop. No workaround exists inside ChatGPT.
- **Cloudflare Access service tokens + claude.ai** — blocked by the header-name
  allowlist unless Anthropic adds `CF-Access-Client-Id`/`CF-Access-Client-Secret`, which
  requires an enterprise relationship.
- **Any client-credentials / service-account / M2M grant with claude.ai** — "A pure
  machine-to-machine `client_credentials` grant… is **not supported**. Every connection
  requires user consent."
- **Machine-to-machine OAuth with ChatGPT** — "ChatGPT does **not** support
  machine-to-machine OAuth grants such as client credentials, service accounts, or JWT
  bearer assertions."
- **Managed OAuth + a Worker-hosted OAuth server on the same application** — explicitly
  disallowed by Cloudflare.
- **Anything at all, in any client, in the current configuration** — the endpoint answers
  `302` with a non-`Bearer` challenge (§0a), which no MCP client can act on.

---

## 6. Setup steps for the recommended path

Do these in order and stop at the first failure; steps 1 and 2 are the verification
gates for the two UNVERIFIED risks.

**1. Confirm the toggle exists on the free plan (gate #1).**
Zero Trust → **Access controls** → **Applications** → the `admin.grabient.com`
application → ⋯ → **Edit** → **Advanced settings**. Look for **Managed OAuth**. If it is
absent or upsells a paid plan, stop: fall back to Rank 2 for Claude Code + Kimi CLI, and
accept that ChatGPT cannot be served without moving to Rank 3/4.
Equivalent API check:
`curl "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/access/apps/$APP_ID" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"`
and enable with `--json '{"oauth_configuration": {"enabled": true}}'` (needs
*Access: Apps and Policies Write*).

**2. Enable it, then re-run the §0a probe (gate #2).**
Turn on Managed OAuth and Save, then:

```bash
curl -s -D - -o /dev/null -X POST https://admin.grabient.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

You need to see **`HTTP/2 401`** and a **`WWW-Authenticate: Bearer …`** header. If it
still says `302`, or the scheme is still `Cloudflare-Access`, MCP clients will not
discover the flow — that is the failure mode this report flagged as highest-risk. Also
re-fetch the protected-resource document and confirm `authentication_methods` now
mentions OAuth rather than only `cloudflared`.

**3. Configure the Managed OAuth settings.**
In the same Advanced settings panel:
- **Allow localhost clients**: on — Claude Code and Kimi CLI redirect to
  `http://localhost:<ephemeral>/callback`.
- **Allow loopback clients**: on — Claude Code also declares `http://127.0.0.1/callback`.
- **Allowed redirect URIs**: add `https://claude.ai/api/mcp/auth_callback` for
  claude.ai/desktop/mobile. Add ChatGPT's callback once known —
  **UNVERIFIED**: I did not find OpenAI's published redirect URI for ChatGPT connectors;
  ChatGPT registers dynamically via DCR, so this may be unnecessary, but if the ChatGPT
  connection fails at the redirect step this is the first thing to check.
- **Access token lifetime**: 5–15 minutes; **Grant session duration**: 1–2 weeks
  (Cloudflare's own recommendation for CLI/agent use).

**4. Confirm the Worker needs no change — and confirm the second gate still holds.**
Access forwards `Cf-Access-Jwt-Assertion` exactly as for browser logins, so
`verifyAccess()` in `apps/admin/src/access.ts` keeps working unmodified: identity logins
carry `email`, checked against `ADMIN_EMAILS`. Nothing in `apps/admin/src/mcp.ts` changes.
Do **not** relax `allowedHostnames` in `analyticsMcpHandler`.

**5. Test with Claude Code first** (fastest feedback, best error messages):

```bash
claude mcp add --transport http grabient-analytics https://admin.grabient.com/mcp
claude mcp login grabient-analytics     # or /mcp inside a session
claude mcp list                          # expect: ✔ Connected
```

If you see "Incompatible auth server: does not support dynamic client registration",
the AS metadata regressed — recheck §0c. On a headless box add `--no-browser` and paste
the callback URL back at the prompt.

**6. Then claude.ai**: Customize → Connectors → **Add custom connector** → URL
`https://admin.grabient.com/mcp`. Leave Advanced settings (OAuth client ID/secret)
empty — DCR handles registration. Note Anthropic's egress range is `160.79.104.0/21`
and the AS host must be reachable from it; `grabient.cloudflareaccess.com` is public, so
this should be fine.

**7. Then Kimi Code CLI**:
`kimi mcp add --transport http --auth oauth grabient-analytics https://admin.grabient.com/mcp`
then `kimi mcp auth grabient-analytics` (or configure via `/mcp-config` and
`/mcp-config login` — confirm the flag spelling against your installed version, see §1).

**8. Then ChatGPT** (do this last; it has the least diagnostic output): Settings → Apps
→ Advanced settings → enable **Developer mode**, then Settings → Connectors → **Create**,
supply the URL, choose OAuth. Expect this one to be the flakiest: OpenAI applies safety
screening to connectors and has been observed rejecting servers with a generic
"Connector is not safe" 400.

**9. Granting access to other people.** Add their email to the Access application policy
**and** to `ADMIN_EMAILS` (both gates, by design — see the comment in `access.ts`). They
add the same URL in their own client and complete their own OAuth login. No credential
is ever shared. Revoke by removing the email from either list.

---

## 7. Explicit list of what I could NOT verify

1. **Whether Managed OAuth / MCP server portals are available on the free Zero Trust
   plan.** No official Cloudflare page states a plan requirement — I checked the Managed
   OAuth doc, the MCP portals doc, the AI-controls index, the changelog entry, and
   `cloudflare.com/plans/zero-trust-services/`. Indirect evidence (the account's own AS
   metadata is live and complete) is suggestive, not conclusive. **§6 step 1 resolves this.**
2. **Whether Access's Managed OAuth `401` uses a `Bearer` challenge.** The doc confirms
   a `401` replaces the `302` for non-browser clients and points at OAuth discovery, but
   does not print the header, and the *current* (OAuth-off) challenge uses the
   non-standard `Cloudflare-Access` scheme. **§6 step 2 resolves this.**
3. **Whether ChatGPT can complete an OAuth flow against Cloudflare Access end-to-end.**
   Both sides claim the right primitives (ChatGPT: OAuth + DCR; Access: DCR + S256 +
   public client). I found no report of the pairing being exercised, and no official
   redirect URI published for ChatGPT connectors.
4. **Whether the kimi.com consumer chat product supports custom remote MCP connectors
   at all.** The Kimi row in §1 is verified for the **Kimi Code CLI** only. If the owner
   meant the web chat, that question is open.
5. **The full contents of Anthropic's `static_headers` header-name allowlist**, and
   therefore whether `CF-Access-Client-Id`/`CF-Access-Client-Secret` are on it. The docs
   name three examples and say additions require an Anthropic representative. Assumed no.
6. **The exact current Kimi CLI flag syntax** — two official Moonshot doc surfaces
   describe the same capabilities with different interfaces (`kimi mcp add --header` vs
   `mcp.json` + `/mcp-config`). Capabilities are certain; spelling is not.
7. **help.openai.com's "Developer mode and MCP apps in ChatGPT" article** returned HTTP
   403 to the fetcher, so the ChatGPT claims here rest on `developers.openai.com`
   (developer-mode guide, Apps SDK auth guide, MCP guide) instead — all official OpenAI
   properties, which is arguably better sourcing anyway.

## Sources fetched

MCP spec: <https://modelcontextprotocol.io/specification/versioning> ·
<https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization> ·
<https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration> ·
<https://blog.modelcontextprotocol.io/posts/2026-07-28/>

Anthropic: <https://claude.com/docs/connectors/building/authentication> ·
<https://claude.com/docs/connectors/custom/remote-mcp> ·
<https://code.claude.com/docs/en/mcp> ·
<https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp>

OpenAI: <https://developers.openai.com/api/docs/mcp> ·
<https://developers.openai.com/api/docs/guides/developer-mode> ·
<https://developers.openai.com/apps-sdk/build/auth> ·
<https://developers.openai.com/api/docs/guides/tools-connectors-mcp>

Moonshot/Kimi: <https://moonshotai.github.io/kimi-cli/en/customization/mcp.html> ·
<https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html>

Cloudflare: <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/> ·
<https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/> ·
<https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/secure-mcp-servers/> ·
<https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/> ·
<https://developers.cloudflare.com/cloudflare-one/access-controls/authenticate-agents/> ·
<https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/> ·
<https://developers.cloudflare.com/changelog/post/2026-03-20-managed-oauth/> ·
<https://developers.cloudflare.com/agents/model-context-protocol/authorization/>

Package evidence: `registry.npmjs.org/agents` (v0.20.1) and the shipped
`docs/mcp-servers.md` + `docs/securing-mcp-servers.md` inside `agents-0.20.1.tgz`.

Live probes: `admin.grabient.com` and `grabient.cloudflareaccess.com`, 2026-08-17.
