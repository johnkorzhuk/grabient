# @grabient/server

What every Worker on Grabient's database shares: the D1 helpers and migrations, sign-in (Better Auth), rate limits and
the `RateLimiter` Durable Object, feature flags, usage counts and the email sending seam. It imports nothing from an
app, Solid or the browser. A Worker imports its modules by path, `@grabient/server/auth/gate.ts`, and exports
`RateLimiter` from its entry.

## Feature flags and what they cost

A flag is a row of `k_flags` in a deploy's database, so staging and production switch apart. No row means on, `all`
off turns every flag off, and each isolate reads the table every half minute. A flag answers before the paid call it
guards, and what stands in still serves a finished page. "At switchover" is the state production starts in.

| Flag | Stops | When off | At switchover |
| --- | --- | --- | --- |
| `all` | Every flag below | Every fallback below | On |
| `model-search` | Workers AI for words the vocabulary lacks, account vector search, the sync's collection embeddings | Search answers from its vocabulary, names and colors; a collection keeps its last vector | On |
| `share-images` | Drawing cards and PNGs | Kept pictures still answer; a share card goes to `/grabient.png`, a palette's PNG to its SVG in the same view and size; a PNG of several palettes answers 503 | On |
| `mcp` | `/mcp`, app registration, new consents | 503 with `Retry-After: 300`; `/connect` says connecting apps is paused | On |
| `mcp-view` | The palette view inside AI apps | Tiles come as words, each with its PNG's address | On |
| `search-rebuild` | The ten-minute snapshot build | Search keeps the last snapshot | On |
| `session-replay` | Forwarding recordings to PostHog | `/e` answers 204 and records nothing | Off, until PostHog has a replay billing limit |
| `palette-use` | `/api/used` writes | 204, nothing counted | On |
| `client-documents` | Advertising client metadata documents | New apps register themselves; connected apps keep working | On |
| `rising-3m`, `rising-1y` | Those Rising frames, which cost nothing | Rising skips the frame | The owner's choice |
| `newsletter` | Issues and test sends through Resend | Nothing is sent; `/newsletter` shows the issues; unsubscribing works | Off, until a Resend plan covers every subscribed account |
| `saving` | Accounts' and apps' writes: likes, collections, votes, MCP save tools | Writes answer 503 with `Retry-After: 300`, and a page keeps them queued as it does offline; MCP save tools refuse in words; reads work | On |
| `email` | Sign-in links and codes, the contact form | Sign-in says to try later or use Google; contact says it is unavailable; deletion emails and owner alerts still go | On |

The switchover sets the two that start off, on production's database alone:

```sql
INSERT INTO k_flags (name, enabled, updated_at) VALUES ('newsletter', 0, 0), ('session-replay', 0, 0)
ON CONFLICT (name) DO UPDATE SET enabled = 0;
```

A paid path no flag stops has a ceiling in `src/limits/config.ts` and fails closed: token refreshes by grant, account
and site, the connected-apps list by account, unknown MCP tokens by address, registrations by site. An account's write
goes through `src/limits/writes.ts` (`writeRefusal`), which applies `saving` and, on staging, gives admins alone
`STAGING_WORK_SCALE` times the work limits under site keys of their own.

## Migrations

`migrations/` holds the D1 schema. `0000_baseline` creates the oldest tables where they are missing, so it changes
nothing on production's database. `0022` to `0054` are applied to live databases and never change. A new migration
takes the next number and only adds; a table is dropped only once no deployed version reads it.
