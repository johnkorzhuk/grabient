# @grabient/server

What every Worker on Grabient's database shares: the D1 helpers and migrations, sign-in (Better Auth), rate limits and
the `RateLimiter` Durable Object, feature flags, usage counts, the email sending seam, and where a new account's
newsletter starts by region (`consent.ts`). It imports nothing from an app, Solid or the browser. A Worker imports its
modules by path, `@grabient/server/auth/gate.ts`, and exports `RateLimiter` from its entry.

## Feature flags and what they cost

A flag is a row of `k_flags` in a deploy's database, so staging and production switch apart. No row means on, `all`
off turns every flag off, and each isolate reads the table every half minute. A flag answers before the paid call it
guards, and what stands in still serves a finished page. A refusal names its flag in `X-Grabient-Paused`, so the Worker
counts no failure for it. "At switchover" is the state production starts in.

| Flag | Stops | When off | At switchover |
| --- | --- | --- | --- |
| `all` | Every flag below | Every fallback below | On |
| `model-search` | Workers AI for words the vocabulary lacks, account vector search, the sync's collection embeddings | Search answers from its vocabulary, names and colors; a collection keeps its last vector | On |
| `share-images` | Drawing cards and PNGs | Kept pictures still answer; a share card goes to `/grabient.png`, a palette's PNG to its SVG in the same view and size; a PNG of several palettes answers 503 | On |
| `mcp` | `/mcp`, app registration, new consents | 503 with `Retry-After: 300`; `/connect` says connecting apps is paused | On |
| `mcp-view` | The palette view inside AI apps | Tiles come as words, each with its PNG's address | On |
| `search-rebuild` | The ten-minute snapshot build | Search keeps the last snapshot | On |
| `palette-use` | `/api/used` writes | 204, nothing counted | On |
| `client-documents` | Advertising client metadata documents | New apps register themselves; connected apps keep working | On |
| `rising-3m`, `rising-1y` | Those Rising frames, which cost nothing | Rising skips the frame | The owner's choice |
| `newsletter` | The newsletter for readers: `/newsletter`, its link, `/api/newsletter`, its sitemap entry, issues to readers. It starts off: no row is off | Readers get Not found and no link; admins still read it, choose its lead and tip, send themselves a test, and prepare and arm a send, which waits; unsubscribing works | Off, until the first issue goes out on a Resend plan that covers every subscribed account |
| `saving` | Accounts' and apps' writes: likes, collections, votes, MCP save tools | Writes answer 503 with `Retry-After: 300`, and a page keeps them queued as it does offline; MCP save tools refuse in words; reads work | On |
| `email` | Sign-in links and codes, the contact form | Sign-in says to try later or use Google; contact says it is unavailable; deletion emails and owner alerts still go | On |
| `draw-past-ceiling` | Pages and the lists' and searches' data past the site's ten-minute ceilings, for readers with no lane | A page is the app's frame as a 503, which the browser draws the page into; a one-segment address that holds nothing leads to the search for its words, and a private collection's is, for a reader with no session, a 503 page that loads again after its wait; data is JSON 429; a search's share card is the site's card, and its other pictures a 429 | On, counting only |

The switchover sets the newsletter off on production's database alone, whatever rows grabient-lite's brings:

```sql
INSERT INTO k_flags (name, enabled, updated_at) VALUES ('newsletter', 0, 0)
ON CONFLICT (name) DO UPDATE SET enabled = 0;
```

A paid path no flag stops has a ceiling in `src/limits/config.ts` and fails closed: token refreshes by grant, account
and site, the connected-apps list by account, unknown MCP tokens by address, registrations by site. An account's write
goes through `src/limits/writes.ts` (`writeRefusal`), which applies `saving` and, on staging, gives admins alone
`STAGING_WORK_SCALE` times the work limits under site keys of their own.

## Render ceiling

Work no cache holds is counted for the whole site in ten minutes (`apps/web/src/server/ceiling.ts`, its limits in
`src/limits/config.ts`): `pageRender`, 3,000 pages, and `dataMiss`, 1,000 reads of the lists' and searches' data, their
suggestions and pictures among them. A list API page the record cache holds fresh is no read. An address outside the API
that no route serves is a page, which Start renders as not found; any method but GET and HEAD is refused before Start
renders, but on the API, the MCP and authorization servers and the documents apps read, where routes take others, and
where a route that takes only GET still has Start render a page for another method, uncounted, which the Worker answers
with a 405. A page that is no list, and a search's picture, also count against `renderMiss`, their address's minute in
the isolate, as a list counts against `listMiss`, and the search's suggestions against `suggestMiss` (240). Crawlers
Cloudflare verifies are drawn and never counted. Past a pool, a reader signed in draws from `renderAccount` (200 an
account) inside `renderSignedIn` (300 for every account), a browser on HTTP/3 that names no program from `renderHttp3`
(500), and a link preview from `renderPreview` (100); anyone else gets what stands in. While the limiter cannot answer,
an isolate counts alone against `renderLocal` (300), and again for readers signed in, the one lane left open. It fails
open: no reader waits on the limiter or on a read of the flags, the count is asked once the answer has begun, an
isolate's first read of its data center's word on a pool decides only what the work counts against, and what fails in
the ceiling draws the work. While `draw-past-ceiling` is on, nothing stands in, the lanes are looked at once the answer
has begun, and the `render` counts say what would have stood in; an isolate that has not read the flags yet takes the
flag as it starts. The ten-minute job mails "the render ceiling would be on", or "is on" while the flag is off, when a
pool ran out, and "cannot count" when the limiter could not count the work.

## Migrations

`migrations/` holds the D1 schema. `0000_baseline` creates the oldest tables where they are missing, so it changes
nothing on production's database. `0022` to `0054` are applied to live databases and never change. A new migration
takes the next number and only adds; a table is dropped only once no deployed version reads it.
