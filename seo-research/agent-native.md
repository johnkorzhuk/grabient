# Agent-Native Adoption Path for Grabient

Research date 2026-08-16. Scope: **TOOLING-for-AI** (agents *calling* grabient), not
SEO-for-AI (agents *citing* it). Labels: **MEASURED** = I fetched/ran it,
**REPORTED** = a source asserts it, **INFERRED** = my reasoning from those.

---

## 1. The backcast

The end-state is reached through one dominant channel and two supporting ones.
Dominant: **a remote MCP server on grabient's own domain, listed in the official MCP
registry under a DNS-verified `com.grabient` namespace** — the only channel where a
palette *corpus* beats the local-math color tools that already exist. Supporting:
(a) a **no-auth JSON API with permissive CORS**, which lets any third party — or any
ad-hoc agent — use grabient without grabient's involvement; (b) a **published Agent
Skill**, which carries the cosine-coefficient knowledge no competitor has. All three
are blocked today by two small defects: no JSON, and no CORS headers.

---

## 2. What grabient looks like to an agent today (MEASURED)

| Probe | Result |
| --- | --- |
| `/api/png?seed=…`, `/{seed}.png`, `/palettes/{q}.png` | `200 image/png`, `cache-control: public, max-age=86400, s-maxage=604800` |
| **`access-control-*` on all three** | **0 — none present** |
| `OPTIONS /api/png` | `404` |
| `/api/palette?seed=`, `/api/search?q=` | `404` |
| `/palettes/warm-sunset.json`, `Accept: application/json` | `200 text/html` (ignored) |
| `/mcp`, `/.well-known/mcp.json` | `404` |
| `/llms.txt` | `200`, 7,023 bytes |
| Palette page HTML | **117,674 bytes**, **27 distinct hex** — 8 are the palette, ~19 are UI chrome (`#09090b`, `#71717b`, `#3b82f6`…) |

**(a) The CORS gap is a hard blocker.** Figma plugins execute from a `null` origin and
must `fetch()` to place an image or read data (REPORTED:
[corsfix](https://corsfix.com/blog/fix-figma-plugin-api-cors) — plugins "run from a
null origin, which can cause APIs to reject requests unless they allow all origins").
Same for Claude artifacts, v0/Lovable/Bolt preview iframes, ChatGPT canvas. An
`<img src>` works without CORS; **every programmatic use does not.** INFERRED: grabient
is unusable from inside any browser-sandboxed agent runtime today.

**(b) The HTML is parseable but economically absurd.** The colors *are* there (21
occurrences of `#ff5acd`, a real `linear-gradient(90deg,#ffd25f,#ff5f6d,#a17fff…)`),
so an agent *can* scrape them — but it pays ~117KB (≈29k tokens) for ~8 hex codes and
must separate them from 19 chrome colors. JSON would be ~300 bytes. The argument for
JSON is **cost and ambiguity, not impossibility.**

---

## 3. The most useful single data point: thecolorapi.com

MEASURED — `GET https://www.thecolorapi.com/scheme?hex=ff5acd&mode=analogic&count=5`
returns `200`, `access-control-allow-origin: *`, `application/json`, 7,341 bytes,
shape `{mode, count, colors[].hex.value, seed, image, _links, _embedded}`.

MEASURED — the official MCP registry contains `io.github.pipeworx-io/colorapi`:
*"Color API MCP — wraps thecolorapi.com (free, no auth)"*, served at
`https://gateway.pipeworx.io/colorapi/mcp`. The same operator also ships
`io.github.pipeworx-io/color-pizza`, wrapping color.pizza's free naming API.

That is the thesis in one data point: **a free, no-auth, CORS-open JSON color API got
pulled into the agent ecosystem by a third party at zero cost and zero effort to its
owner.** Grabient has "free" and "no-auth" and is missing exactly the two properties
that made thecolorapi wrappable. INFERRED: shipping JSON + CORS converts grabient from
"not agent-addressable" to "wrappable by anyone, including grabient." It also names a
risk — ship JSON without an MCP server and someone else may wrap it and own the
registry listing, the namespace, and the relationship.

---

## 4. Prior art / first-mover check — MEASURED against the official registry

Queried `registry.modelcontextprotocol.io/v0/servers?search=…`, deduped by name:

- **`palette`: 2 distinct servers.** `io.github.Br0ski777/color-palette` (harmonies +
  x402 micropayments), `io.github.lazymac2x/color-palette` (a Cloudflare Workers
  server). That is the whole category.
- **`gradient`: 4 distinct, 2 of them real** — `io.github.ryudi84/gradient` and
  `io.github.ryudi84/gradient-forge-mcp`, same author, both CSS *syntax* builders. The
  others are unrelated (`com.gradientdecisions/merchant-check`, an MSP billing tool).
- **`color`: 16 distinct** — converters, contrast checkers, harmony generators; several
  are false positives matching the substring "colorado."
- **`design token`: 0.**
- **Every color/palette/gradient server is `io.github.*`.** The only non-GitHub
  namespace anywhere in those results is unrelated fintech. **No DNS-verified brand
  exists in this category.**

GitHub stars off-registry (MEASURED via API): `color-scheme-mcp` 8★ (last push
2025-05-31), `design-token-bridge-mcp` 5★, `color-palette-mcp` 3★ (last push
2025-08-31), `coolors-mcp` 2★ (unaffiliated with coolors.co).

**Verdict: populated, not contested.** Every incumbent is a one-person hobby project in
a `io.github.*` namespace doing pure local computation — harmonies, conversions,
contrast math — with **no corpus and no search**; several are stale. INFERRED:
grabient's wedge is what none of them have — ~866 curated permalinks, semantic search
over them, a parametric model, and a 9-year-old domain with real uptime. Nobody gets
displaced; the corpus-backed slot is empty. Adjacent, non-competing:
[GradientDeck](https://gradientdeck.com/) ships an MCP page for its CSS toolkit
(REPORTED; no adoption numbers disclosed).

---

## 5. Mechanism ranking

### 5.1 llms.txt — good content, dead channel

REPORTED, unusually well-evidenced. [EZY Research](https://www.ezy.ai/research/do-ai-bots-read-llms-txt),
83 sites with server logs, 2026-04-27 → 2026-07-19:

| Crawler | robots.txt | llms.txt |
| --- | --- | --- |
| OpenAI | 3,990 | **7** |
| Anthropic | 3,120 | **9** |
| Perplexity | 775 | **0** |
| Google | 5,125 | 67 |
| Meta | 172 | **193** |

Corroborated by a second set (REPORTED,
[365i](https://www.365i.co.uk/news/2026/03/01/ai-discovery-files-wordpress-plugin/)):
across 19 log sets Feb–Apr 2026, major AI crawlers hit `/llms.txt` on 3 of 19 sites —
41 requests against ~1.1M AI-crawler page fetches. No major lab has publicly stated its
production systems read llms.txt.

I read grabient's live `/llms.txt` in full (MEASURED). **The content is excellent** — it
documents `channel(t) = a + b·cos(2π(c·t + d))`, all four coefficient vectors, the four
global modifiers, the `t = i/(steps-1)` sampling rule, the 301-to-canonical-seed
behavior, design tips ("Pastels: a≈0.75, b≈0.2"), and a worked example. It is better
agent documentation than anything the incumbent color MCPs ship.

**The problem is delivery, not content.** INFERRED: stop investing in llms.txt as a
*channel* (keep the file — Meta reads it, cheap standards-track insurance) and **port
the content where agents actually read**: MCP tool descriptions, a `SKILL.md`, a JSON
docs endpoint linked from the pages. llms.txt v2 is a copy job, not a writing job.

### 5.2 MCP registries — table stakes, not distribution

REPORTED scale: mcp.so ~20,222 servers; Glama ~37,000; Smithery 6,000–7,000+; PulseMCP
11,840+ ([truefoundry](https://www.truefoundry.com/blog/best-mcp-registries),
[roxyapi](https://roxyapi.com/blogs/mcp-registries-where-to-list-your-server)).
REPORTED: an audit of 1,847 servers found **52% abandoned**
([rapidclaw](https://rapidclaw.dev/blog/mcp-servers-dead-what-it-means-2026)), and the
ecosystem's named failure is "the discovery and trust layer" — people pick servers by
search ranking and star count.

INFERRED: listing #20,000 buys nothing alone. But the same reporting names the scarce
signals — **last-commit recency, endpoint uptime, a real owner** — and grabient
satisfies all three by construction, because the MCP server would ride the *same Worker
already serving a 9-year-old production site*. A DNS-verified `com.grabient` namespace
would make it the **only brand-verified server in the color category** (MEASURED, §4).
List everywhere because it is free; the *namespace* is the actual asset.

Mechanics (REPORTED, official docs): remote servers need **no npm package** — a
`remotes` array suffices:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "com.grabient/palettes",
  "title": "Grabient Palettes",
  "description": "Search, construct, and render cosine gradient palettes",
  "version": "1.0.0",
  "remotes": [{ "type": "streamable-http", "url": "https://grabient.com/mcp" }]
}
```

Publish via the `mcp-publisher` CLI; **DNS authentication** unlocks the `com.grabient`
prefix ([quickstart](https://modelcontextprotocol.io/registry/quickstart),
[remote servers](https://modelcontextprotocol.io/registry/remote-servers)). No fee, no
review queue.

### 5.3 Figma — the catalog is a dead end, the plugin is the channel

MEASURED (fetched figma.com/mcp-catalog): the Figma MCP Catalog lists **MCP *clients*
connecting TO Figma's server** (Claude, ChatGPT, Cursor, VS Code, Copilot CLI, Warp,
Zed, Android Studio). It does **not** list third-party servers; submission is "apply to
register your client… reach out to your account team." **No channel here for grabient.**

REPORTED ([Figma blog](https://www.figma.com/blog/the-figma-canvas-is-now-open-to-agents/)):
agents now write to the canvas via `use_figma`, creating and editing designs from
existing components and variables — but **image support is listed as "coming soon."**
INFERRED and important: **the Figma path is hex values and variables, not PNGs.**
Grabient's PNG-only API aims at the wrong surface; a JSON hex array maps directly onto
Figma color variables today.

Figma Community is still a real channel — REPORTED: Coolors claims 2.5M Figma users,
and Community works "like a mobile app store" with visible install counts. I could not
verify Coolors' exact install count (figma.com/community returns 403 to automated
fetch). Publishing is free; a plugin needs
`networkAccess.allowedDomains: ["https://grabient.com"]` **and grabient must send
`Access-Control-Allow-Origin: *`** or its fetches fail from the null origin.

### 5.4 App-builder agents (v0 / Lovable / Bolt) — no API call to win

REPORTED ([Design Systems Collective](https://www.designsystemscollective.com/design-systems-lovable-bolt-v0-and-replit-50a0a197bc35),
[sailop](https://sailop.com/blog/bolt-new-honest-review-2026)): these converge on
shadcn/ui + Tailwind + Lucide + Inter + **"a blue or purple gradient hero"**, and colors
are chosen **by prompt, not by API call** — overriding requires naming a palette in the
prompt. INFERRED: (1) there is no runtime integration to win; nothing calls a color
service. (2) The generic-gradient-hero default *is* grabient's product, so the win is
upstream — in Cursor/Claude Code/Codex, where MCP and Skills actually load. **The
IDE-agent surface, not the app-builder surface, is the target.**

### 5.5 Agent Skills — the cheapest cross-vendor channel

MEASURED (fetched agentskills.io): an **open standard** (originated at Anthropic,
released openly). A skill is a folder with a `SKILL.md` carrying `name` + `description`
+ instructions, loaded by **progressive disclosure** — name/description at startup, full
text only on a matching task. The client showcase lists Claude, Claude Code, ChatGPT &
Codex, Cursor, GitHub Copilot, VS Code, Gemini CLI, Goose, OpenHands, Roo Code, Kiro,
JetBrains Junie, Amp, Factory, Tabnine and ~30 more.

INFERRED: highest leverage-per-hour artifact after the API itself. One `SKILL.md` —
essentially the existing llms.txt "Constructing a palette URL from scratch" section —
reaches every listed agent with **no server, no protocol, no hosting**. It is also the
natural home for knob-tweaking knowledge ("make this brighter" → raise `exposure`) that
a tool schema can only gesture at.

### 5.6 Organic model recommendation — real, but that is the SEO-for-AI lane

REPORTED: models surface brands via training data + live retrieval + entity clarity,
Claude leaning on earned media and staying conservative without multi-source
corroboration ([houseofmartech](https://houseofmartech.com/blog/how-chatgpt-gemini-and-claude-each-decide-which-brands-to-mention)).
Out of scope except one crossover: **an MCP registry entry and a public Skill repo are
themselves indexable third-party artifacts** — exactly the corroboration those systems
reward. The tooling work feeds the citation work.

---

## 6. Groundwork spec

### 6.1 JSON endpoints — prerequisite, and nearly free

MEASURED: `apps/web/src/palette.ts:181-190` already computes server-side
`{ id, coeffs, globals, style, steps, angle, seed, hexColors }` via `deserializeCoeffs`
→ `applyGlobals` → `cosineGradient` → `rgbToHex`. `apps/web/src/semantic-search.ts:153`
already exposes `searchSemanticPalettes(): Promise<SemanticSearchResult[]>`. The PNG
routes are one-liners at `apps/web/src/index.ts:1052-1053`.

INFERRED effort: **serialization wrappers over functions that already run on every page
render.** Two routes beside the existing PNG ones:

- `GET /api/palette.json?seed=&steps=&style=&angle=` → `{ seed, url, coeffs:{a,b,c,d},
  globals:{exposure,contrast,frequency,phase}, steps, hexColors:[…],
  css:"linear-gradient(…)", png:"https://grabient.com/{seed}.png" }`
- `GET /api/search.json?q=&limit=` → `{ query, results:[{ seed, url, hexColors, png }] }`

Copy thecolorapi's shape decisions: self-referential `_links`-style URLs so an agent can
cite the page it took colors from, and mirror the existing
`cache-control: public, max-age=86400, s-maxage=604800`.

### 6.2 CORS — 30 minutes, unblocks four surfaces

Add `Access-Control-Allow-Origin: *` to `/api/png`, `/api/png/query`, `/{seed}.png`,
`/palettes/{q}.png` and the new JSON routes, and answer `OPTIONS` instead of 404. These
are public, unauthenticated, read-only, already-edge-cached responses — no credential to
leak. Note the repo's standing rule that **every response carries an explicit cache
policy** (CLAUDE.md, two prior production incidents); the new routes must not be the
exception.

### 6.3 llms.txt v2 — a content port, not a rewrite

Given §5.1 the goal shifts to "make the llms.txt content reachable through channels
agents use." Keep the file, then:

1. Add the two JSON endpoints to "Machine-readable resources," plus an **"If you are an
   agent, start here"** block at the top pointing at `/api/palette.json`,
   `/api/search.json`, `/mcp`.
2. Add worked *task* examples, not just URL specs:
   - *"Make this palette brighter"* → append globals, `exposure` +0.15, refetch JSON.
   - *"Return 5 pastel palettes"* → `GET /api/search.json?q=pastel&limit=5`.
   - *"Build a two-tone sweep"* → `c = 0.5` everywhere, 12 comma-separated values,
     follow the 301, cite the canonical URL.
3. Copy the same body into `SKILL.md` and the MCP tool descriptions. Same words, three
   channels — only one of which is llms.txt.

### 6.4 MCP server — scoped design

Host at `https://grabient.com/mcp` on the **existing Worker**. REPORTED: Cloudflare's
Agents SDK provides `createMcpHandler` for stateless Streamable HTTP, supports the
2026-07-28 spec, and explicitly supports deploying **without authentication**
([docs](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)).
Marginal hosting ≈ $0 — same Worker, same zone, already-cached upstream renders.

| Tool | Args | Returns | Effort |
| --- | --- | --- | --- |
| `search_palettes` | `query`, `limit` | seeds, hex, page URLs | thin — wraps `searchSemanticPalettes` |
| `get_palette` | `seed`, `steps?`, `style?`, `angle?` | hex, coeffs, globals, CSS, URLs | thin — wraps `exportItemData` |
| `build_palette` | `a`,`b`,`c`,`d`, globals? | canonical seed + URL + hex | thin — `serializeCoeffs` |
| `tweak_palette` | `seed`, Δexposure/Δcontrast/Δfrequency/Δphase | new seed + URL + hex | thin — mutate globals, reserialize |
| `render_png` | `seed` \| `query`, `w`,`h`,`style`,`angle`,`steps` | PNG URL | trivial — URL builder |

`tweak_palette` is the differentiated one: it is the literal expression of the owner's
"knobs an agent can turn," and **no competitor can copy it**, because adjusting a
palette requires a parametric model behind a stable seed and every incumbent generates
colors from scratch.

### 6.5 Agent Skill

Public repo `grabient/agent-skill` with `SKILL.md`: `name: grabient-palettes`,
`description: "Find, construct, and adjust gradient color palettes via grabient.com —
semantic search over a curated corpus, plus a deterministic cosine model whose
brightness/contrast/frequency/phase can be tuned by URL."` Body = §6.3 content. Zero
infrastructure; works across the ~40 skills-compatible clients.

### 6.6 Distribution acts (all free)

Official MCP registry via DNS auth (`modelcontextprotocol.io/registry/quickstart` +
`/registry/remote-servers`) · Smithery (smithery.ai) · mcp.so · Glama
(glama.ai/mcp/servers) · PulseMCP (pulsemcp.com) · Agent Skills (agentskills.io,
github.com/agentskills/agentskills) · Figma Community (figma.com/community —
**requires CORS**).

---

## 7. Staged adoption path

**Stage 0 — ship now (days, $0).** *Artifact:* `Access-Control-Allow-Origin: *` + real
`OPTIONS` on all PNG routes; `/api/palette.json`, `/api/search.json`; llms.txt v2
pointing at both. *Distribution act:* none — this is the prerequisite. *Evidence:*
thecolorapi.com is free + no-auth + JSON + `ACAO: *` and was organically wrapped into
the MCP ecosystem by a third party at zero owner effort (MEASURED, §3). *Cost:* $0 —
same Worker, reusing functions that already run.

**Stage 1 — 3 months ($0).** *Artifacts:* remote MCP server at `grabient.com/mcp`
(5 tools, §6.4); published `SKILL.md`. *Distribution acts:* publish
`com.grabient/palettes` to the official registry via **DNS auth**; mirror to Smithery,
mcp.so, Glama, PulseMCP; push the skill repo. *Evidence:* remote servers need no package
and no fee (REPORTED); the category holds **2 palette servers, both hobby namespaces,
zero DNS-verified brands** (MEASURED, §4); Agent Skills has ~40 supporting clients
(MEASURED). *Cost:* $0 — Cloudflare supports authless remote MCP on the existing Worker.

**Stage 2 — 12 months (~$0, time only).** *Artifacts:* a Figma Community plugin writing
palettes into Figma color variables; a public agent-facing docs page so the spec is
indexable rather than living only in a 7KB text file. *Distribution acts:* Figma
Community publish; keep registry entries fresh (last-commit recency is a scarce trust
signal). *Evidence:* Community is app-store-like with visible install counts and Coolors
as proof of demand (REPORTED); the Figma MCP Catalog is **not** a route for third-party
servers (MEASURED, §5.3); `use_figma` writes designs but image support is "coming soon,"
so **hex/variables** is the right shape (REPORTED).

---

## For the strategy

1. **Send `Access-Control-Allow-Origin: *` on every PNG and JSON route; answer
   `OPTIONS`.** `[free]` — MEASURED zero CORS headers today, so grabient cannot be
   `fetch()`ed from a Figma plugin, a Claude artifact, or a v0/Lovable preview. One
   header separates "invisible to browser-sandboxed agents" from "usable by all of
   them," on responses that are public and read-only anyway.

2. **Ship `/api/palette.json` and `/api/search.json`.** `[free]` — the palette page is
   117KB with 19 chrome hexes mixed into 8 real ones; JSON is ~300 bytes and
   unambiguous. The computation already exists server-side, so this is serialization,
   and it is the precondition for everything below.

3. **Stand up a remote MCP server at `grabient.com/mcp` (5 tools).** `[free]` — the
   entire registry holds 2 palette servers and 2 real gradient servers, all local-math
   hobby projects with no corpus; semantic search over ~866 palettes is the thing none
   of them can replicate, and Cloudflare hosts authless MCP on the existing Worker.

4. **Publish to the official MCP registry under DNS-verified `com.grabient`.** `[free]`
   — every color/palette/gradient server today is `io.github.*`, so brand verification
   is uncontested. With 52% of servers abandoned and registries drowning in 20k–37k
   listings, owner identity and uptime are the scarce signals, and a 9-year-old
   production domain supplies both for free.

5. **Publish a `SKILL.md` Agent Skill (the llms.txt body, reformatted).** `[free]` —
   Agent Skills is an open standard whose showcase spans Claude, Codex, Cursor, Copilot,
   VS Code, Gemini CLI and ~35 more, loaded by progressive disclosure so hosts carry it
   almost for free. One markdown file reaches every one of those surfaces.

6. **Make `tweak_palette` (exposure/contrast/frequency/phase deltas) a first-class
   tool.** `[free]` — it is the owner's "agent turns the knobs" vision made concrete and
   structurally uncopyable: adjusting a palette needs a parametric model behind a stable
   seed, and every incumbent generates colors from scratch instead.

7. **Stop investing in llms.txt as a channel; port its content to MCP tool descriptions
   and `SKILL.md`.** `[free]` — two independent log studies show OpenAI fetching
   llms.txt 7 times vs robots.txt 3,990, Anthropic 9 vs 3,120, Perplexity 0. The content
   is excellent and should be reused verbatim; shipping it only at `/llms.txt` ships it
   to nobody. Keep the file as cheap insurance — Meta does read it.

8. **Publish a Figma Community plugin writing palettes into Figma color variables.**
   `[cheap]` — Community is an app-store-like channel with visible install counts and
   Coolors as proof of demand, and the Figma MCP Catalog offers no server-side route in.
   Target variables rather than images, since `use_figma` writes designs today but image
   support is still "coming soon." Last only because it costs real implementation time
   and strictly depends on items 1–2.
