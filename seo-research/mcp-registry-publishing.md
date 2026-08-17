# Publishing grabient to the official MCP Registry — verified runbook

Researched 2026-08-16 against the registry source and docs. Everything here was
read from `modelcontextprotocol.io/registry/*` or the registry's Go source; the
older `docs/guides/publishing/*` paths in circulation are 404 now.

## Status of the registry itself

**Preview, not GA** — every registry doc page carries: "The MCP Registry is
currently in preview. Breaking changes or data resets may occur before general
availability." Launched 2025-09-08 (Anthropic, GitHub, PulseMCP, Microsoft), no
GA date published ~11 months on. Practical consequence: **keep `server.json` in
git and treat republishing as cheap**, because a data reset could wipe the entry.

`search=grabient` currently returns **0 results** — the namespace is unclaimed.

## The namespace grant is broader than expected

One proof of domain ownership on `grabient.com` grants **two** publish patterns:

- `com.grabient/*` — e.g. `com.grabient/palette`, `com.grabient/mcp`
- `com.grabient.*` — e.g. `com.grabient.admin/metrics`, `com.grabient.api/x`

So a single verification covers the public palette server *and* the private
analytics server, with no second record. (Rationale in the registry source: DNS
implies hierarchy, same as ACME DNS-01.)

## Two ways to prove ownership — HTTP is the better fit here

**HTTP (recommended for grabient)** — we already control the Worker on that
hostname, so this is a route addition living in the codebase rather than a DNS
change:

```bash
openssl genpkey -algorithm Ed25519 -out key.pem
PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "v=MCPv1; k=ed25519; p=${PUBLIC_KEY}" > mcp-registry-auth   # serve at /.well-known/mcp-registry-auth
mcp-publisher login http --domain grabient.com --private-key "${PRIVATE_KEY_HEX}"
```

**DNS (alternative)** — same crypto, TXT record. **The record goes on the APEX**
(`grabient.com`), *not* `_mcp.grabient.com`. This is the most commonly botched
step; the registry source even probes for the mistake and returns a targeted
error. Value format: `v=MCPv1; k=ed25519; p=<base64>`.

`--private-key` is **hex**, not PEM (Ed25519 = 64 hex chars). Default algorithm
is ed25519; ECDSA P-384 requires `--algorithm ecdsap384` or it fails with a
confusing "invalid seed length" error.

## `server.json` for a remote server

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "com.grabient/palette",
  "title": "Grabient Palettes",
  "description": "Search, build and render deterministic cosine gradient palettes",
  "version": "1.0.0",
  "remotes": [
    { "type": "streamable-http", "url": "https://grabient.com/mcp" }
  ]
}
```

Constraints that actually bite:

- **`description` maxLength is 100 characters.** Tightest real constraint.
- Only `name`, `description`, `version` are required. **No `repository`, no
  `packages`, no npm publish** for a remote-only server — and remote-only skips
  package-ownership verification entirely.
- `remotes[].type` is **`"streamable-http"`** (hyphen). Only other legal value is
  `"sse"`, which is deprecated on a 12-month offramp — publish it only for
  legacy clients.
- URL must be **https** (the Go validator rejects http even though the JSON
  schema regex allows it); localhost is banned.
- **Versions are immutable.** Any metadata fix requires a new `version` string.
- `$schema` current version is `2025-12-11`; 2026-dated schema URLs 404.

## Two servers, one entry

Cloudflare's own registry entry (`com.cloudflare.mcp/mcp`) carries **30 remotes**
in a single record, mixing authless and authenticated endpoints, with per-remote
`headers` declaring required auth. That is the idiomatic shape and the model to
copy: one grabient entry listing both the public palette endpoint and (if we want
it discoverable) the Access-protected analytics endpoint, the latter declaring
its auth headers:

```json
{
  "type": "streamable-http",
  "url": "https://admin.grabient.com/mcp",
  "headers": [
    { "name": "CF-Access-Client-Id", "isRequired": true, "isSecret": true },
    { "name": "CF-Access-Client-Secret", "isRequired": true, "isSecret": true }
  ]
}
```

Notably, the remote URL's host does **not** have to match the namespace domain —
verified in the source (no comparison exists) and in production (Cloudflare's 30
remotes are all on hosts other than the namespace domain).

## Publish flow

```bash
brew install mcp-publisher          # or the documented curl one-liner
mcp-publisher login http --domain grabient.com --private-key "$HEX"
mcp-publisher validate              # reports all issues at once
mcp-publisher publish
```

No reachability probe: the registry never fetches the remote URL, and there is no
background health checker that can unlist a server. Removal is manual moderation
only (illegal content, malware, spam, completely broken servers). Unpublishing is
a soft delete via `mcp-publisher status --status deleted`, despite the FAQ still
claiming deletion is impossible.

## Where Cloudflare fits

**Cloudflare runs no public directory of third-party MCP servers** and has no
"add your server" flow anywhere. Its "catalog" language refers only to its own
first-party servers, and MCP Server Portals are per-organization admin-curated
allowlists behind Cloudflare One, not a public listing. The official MCP Registry
is the channel; Cloudflare publishes into it like everyone else.

## Prerequisites before any of this

The server has to exist first. Publishing is ~15 minutes once `grabient.com/mcp`
responds; the work is building it, not listing it.
