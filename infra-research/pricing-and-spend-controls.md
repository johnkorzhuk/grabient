# Cloudflare pricing and spend controls — grabient

**Researched 2026-08-17.** Every number below was read from a page fetched on that
date. The URL that produced each number is cited next to it. Cloudflare docs pages
carry a "Last updated" stamp; where I saw one I recorded it.

**Nothing here is recited from memory.** Where a number is not published, the row
says **UNVERIFIED** and states exactly what could not be confirmed. There are three
such gaps and they are listed together in [§10](#10-unverified--what-i-could-not-confirm).

Configuration read: `/home/korz/projects/grabient33/grabient/apps/web/wrangler.jsonc`.

Where this report needed a real-world number rather than a published rate, it cross-references
`infra-research/measured-consumption-2026-08-17.md` (Cloudflare GraphQL Analytics API telemetry for
this account). Those figures are always labelled as measured, never presented as list prices.

---

## 0. What is actually deployed

| Thing | Value | Where |
|---|---|---|
| Workers plan | Paid ($5/mo minimum) | given |
| Zone plan | Free | given |
| Worker CPU cap | `"limits": { "cpu_ms": 10000 }` | `wrangler.jsonc:53` |
| D1 | `grabient-prod` | `wrangler.jsonc:148-155` |
| KV | `SEARCH_CACHE`, `OG_IMAGE_CACHE` | `wrangler.jsonc:173-182` |
| R2 | `grabient-uploads` (avatars) | `wrangler.jsonc:186-191` |
| Vectorize | `grabient-palettes` | `wrangler.jsonc:164-169` |
| Workers AI | `@cf/google/embeddinggemma-300m` | `apps/web/src/semantic-search.ts:236` |
| Durable Object | `RateLimiter` | `wrangler.jsonc:156-163` |
| Static Assets | `./dist/client` | `wrangler.jsonc:145` |
| Workers Cache | `enabled: true`, `cross_version_cache: false` | `wrangler.jsonc:147` |
| Queues / Containers | **not present** — no `queues` or `containers` key anywhere in the config | `wrangler.jsonc` |

### The Durable Object is KV-backed, not SQLite-backed

The migration tag is:

```jsonc
"migrations": [{ "tag": "v1", "new_classes": ["RateLimiter"] }]
```

`new_classes` (not `new_sqlite_classes`) means the **key-value storage backend**.
This matters twice: it prices differently from SQLite-backed DOs (§1), and it
blocks a downgrade to the Workers Free plan (§3).

> "If you wish to downgrade from a Workers Paid plan to a Workers Free plan, you
> must first ensure that you have deleted all Durable Object namespaces with the
> key-value storage backend."
> — <https://developers.cloudflare.com/durable-objects/platform/pricing/>

Also worth knowing, because it means this backend cannot be recreated once dropped:

> "**Workers Paid plan**: Durable Objects with the SQLite storage backend are
> available. The key-value storage backend is only available to accounts that
> already have a key-value-backed namespace."
> — <https://developers.cloudflare.com/durable-objects/platform/pricing/>

---

## 1. Unit prices and included allowances (Workers Paid plan)

### Workers

Source: <https://developers.cloudflare.com/workers/platform/pricing/>

| Metric | Unit | Included (Paid) | Price above included |
|---|---|---|---|
| Requests | one inbound request to the Worker | 10 million / month | $0.30 per additional million |
| CPU time | milliseconds of CPU actually executing | 30 million CPU-ms / month | $0.02 per additional million CPU-ms |
| Duration | wall-clock | — | "No charge or limit for duration" |
| Account minimum | — | — | "minimum charge of $5 USD per month for an account" |

Four footnotes on that page change the shape of the bill and are easy to miss:

1. "Inbound requests to your Worker. Cloudflare does not bill for **subrequests**
   you make from your Worker." — so `fetch()` fan-out is free at the request layer.
2. "WebSocket connections made to a Worker are charged as a request, representing
   the initial `Upgrade` connection… WebSocket messages routed through a Worker do
   not count as requests."
3. "Requests to **static assets are free and unlimited**."
4. **"When Workers Caching is enabled, requests served from the Worker's cache are
   billed at the same per-request rate as requests that invoke the Worker. This
   includes requests to static assets and worker-to-worker invocations. CPU time is
   only billed when the Worker runs (on a cache miss or bypass)."**

Footnote 4 applies directly — this config sets `"cache": { "enabled": true }`. A
cache hit still costs $0.30/million. It saves CPU, not requests. Reinforced in the
FAQ on the same page:

> "Only requests that hit a Worker will count against your limits and your bill.
> Since Cloudflare Workers runs before the Cloudflare cache, the caching of a
> request still incurs costs."

### Workers Static Assets

Source: <https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>

> "Requests to static assets are free and unlimited. Requests to the Worker script
> (for example, in the case of SSR content) are billed according to Workers pricing."

Storage of the assets is not separately charged. Limits, from
<https://developers.cloudflare.com/workers/platform/limits/>: 100,000 files per
Worker version on Paid (20,000 on Free), 25 MiB per individual file.

Note the interaction with footnote 4 above: with Workers Caching enabled, a
*cached* static-asset response **is** billed as a request, even though an uncached
static-asset response is not. The two sentences are in tension and I flag it in §10.

### D1

Source: <https://developers.cloudflare.com/d1/platform/pricing/>

| Metric | Unit | Included (Paid) | Price above included |
|---|---|---|---|
| Rows read | rows **scanned**, not returned | 25 billion / month | $0.001 per million rows |
| Rows written | rows inserted/updated/deleted | 50 million / month | $1.00 per million rows |
| Storage | GB-month, summed across all DBs in the account | 5 GB | $0.75 per GB-month |

The unit is a scan, not a result:

> "Rows read measure how many rows a query reads (scans), regardless of the size of
> each row. For example, if you have a table with 5000 rows and run a
> `SELECT * FROM table` as a full table scan, this would count as 5,000 rows read.
> A query that filters on an unindexed column may return fewer rows to your Worker,
> but is still required to read (scan) more rows to determine which subset to return."

Row size is irrelevant: "A row that is 1 KB and a row that is 100 KB both count as
one row." Indexes cut reads but add writes: "Indexes will add an additional written
row when writes include the indexed column."

Also billable: "any queries you run against your database, including … from the
dashboard or Wrangler (the CLI)". Migrations and backfills cost money.

### Workers KV

Source: <https://developers.cloudflare.com/kv/platform/pricing/>

| Metric | Unit | Included (Paid) | Price above included |
|---|---|---|---|
| Keys read | one key | 10 million / month | $0.50 per million |
| Keys written | one key | 1 million / month | **$5.00 per million** |
| Keys deleted | one key | 1 million / month | $5.00 per million |
| List requests | one list call | 1 million / month | $5.00 per million |
| Stored data | GB-month | 1 GB | $0.50 per GB-month |

Two clauses that matter for a cache-shaped workload:

> "All operations incur charges, including fetches for non-existent keys that return
> a `null` (Workers API) or `HTTP 404` (REST API). These operations still traverse
> KV's infrastructure."

> "Workers KV pricing for read, write and delete operations is on a per-key basis."

A cache **miss** therefore costs a read *and* a write. Writes are 10× reads. KV
writes are the second most expensive knob in this stack (§9).

### R2

Source: <https://developers.cloudflare.com/r2/pricing/>

| Metric | Unit | Free tier (monthly) | Price above |
|---|---|---|---|
| Standard storage | GB-month | 10 GB-month | $0.015 per GB-month |
| Class A operations | request | 1 million / month | $4.50 per million |
| Class B operations | request | 10 million / month | $0.36 per million |
| Egress to Internet | — | Free | Free |

- Class A (mutating) includes `PutObject`, `ListObjects`, `CopyObject`,
  `CreateMultipartUpload`, `UploadPart`.
- Class B (reading) includes `GetObject`, `HeadObject`, `HeadBucket`.
- **Free operations**: "`DeleteObject`, `DeleteBucket` and `AbortMultipartUpload`."
  Old-avatar cleanup is free.

Rounding is upward and is a real (small) effect:

> "Cloudflare rounds up your usage to the next billing unit. For example: If you
> have performed one million and one operations, you will be billed for two million
> operations. If you have used 1.1 GB-month, you will be billed for 2 GB-month."

GB-month is a peak-based average: "A GB-month is calculated by averaging the *peak*
storage per day over a billing period (30 days)."

The free tier is stated as a flat "Free" column with no plan qualifier on that page.
Whether it is per-account or per-plan is not stated — see §10.

### Vectorize

Source: <https://developers.cloudflare.com/vectorize/platform/pricing/> (page stamped
"Last updated Apr 21, 2026")

| Metric | Unit | Included (Paid) | Price above included |
|---|---|---|---|
| Queried vector dimensions | dimension | 50 million / month | $0.01 per million |
| Stored vector dimensions | dimension | 10 million | $0.05 per 100 million |

**What a "queried dimension" is, and how topK factors in.** This is the question
worth being careful about, because the published formula does not behave the way the
name suggests.

> "**Queried Vector Dimensions**: The total number of vector dimensions queried. If
> you have 10,000 vectors with 384-dimensions in an index, and make 100 queries
> against that index, your total queried vector dimensions would sum to 3.878 million
> (`(10000 + 100) * 384`)."

The stated formula:

> "`((queried vectors + stored vectors) * dimensions * ($0.01 / 1,000,000)) + (stored vectors * dimensions * ($0.05 / 100,000,000))`"

And the worked example:

> "inserting 10,000 vectors of 768 dimensions each, and querying those 1,000 times
> per day (30,000 times per month) would be calculated as `((30,000 + 10,000) * 768) = 30,720,000`
> queried dimensions"

Reading the arithmetic rather than the prose:

- **`topK` does not appear in the formula at all.** Nothing on the page mentions
  `topK`, `returnMetadata`, or result count as a billing input. Per the published
  formula, a `topK: 48` query and a `topK: 1` query bill identically. Each query
  contributes exactly `1 × dimensions`.
- The **index size is added once per billing period**, not once per query. In the
  example, 10,000 stored vectors × 768 = 7,680,000 is added a single time alongside
  30,000 queries × 768 = 23,040,000.

So, practically: **monthly queried dimensions ≈ (number of queries + number of stored
vectors) × index dimension.** At 768 dimensions, each query costs
`768 × $0.01/1,000,000 = $0.00000768`, i.e. **$7.68 per million queries**.

This is ambiguous in one specific way, flagged in §10: the page also says "If you are
not issuing queries against your indexes, you are not billed for queried vector
dimensions", which does not reconcile cleanly with a formula in which the stored-vector
term sits inside the *queried* dimensions total.

Also billable: "any queries you issue against your index, including from the Workers
API, HTTP API and CLI all count as usage." Empty indexes do not count as stored.

### Workers AI

Source: <https://developers.cloudflare.com/workers-ai/platform/pricing/>

| Metric | Unit | Included | Price above included |
|---|---|---|---|
| Neurons | "GPU compute needed to perform your request" | **10,000 Neurons per day** (same on Free *and* Paid) | $0.011 per 1,000 Neurons |

> "Our free allocation allows anyone to use a total of **10,000 Neurons per day at
> no charge**. … On Workers Paid, you will be charged at $0.011 / 1,000 Neurons for
> any usage above the free allocation of 10,000 Neurons per day."

The allowance is **daily**, not monthly, and it does **not** increase on the Paid
plan. Over a 30-day month, 300,000 free neurons ≈ $3.30 of value.

**The model in use is not on the price list.** `@cf/google/embeddinggemma-300m` does
not appear in the Embeddings pricing table. The complete published Embeddings table is:

| Model | Price in Tokens | Price in Neurons |
|---|---|---|
| `@cf/baai/bge-small-en-v1.5` | $0.020 per M input tokens | 1841 neurons per M input tokens |
| `@cf/baai/bge-base-en-v1.5` | $0.067 per M input tokens | 6058 neurons per M input tokens |
| `@cf/baai/bge-large-en-v1.5` | $0.204 per M input tokens | 18582 neurons per M input tokens |
| `@cf/baai/bge-m3` | $0.012 per M input tokens | 1075 neurons per M input tokens |
| `@cf/pfnet/plamo-embedding-1b` | $0.019 per M input tokens | 1689 neurons per M input tokens |
| `@cf/qwen/qwen3-embedding-0.6b` | $0.012 per M input tokens | 1075 neurons per M input tokens |

That is the whole table — six rows, no Google model. The model's own page
(<https://developers.cloudflare.com/workers-ai/models/embeddinggemma-300m/>) has no
pricing section either. See §10.

### Durable Objects — KV-backed (the one deployed here)

Source: <https://developers.cloudflare.com/durable-objects/platform/pricing/>

**Compute** (same for both storage backends):

| Metric | Unit | Included (Paid) | Price above included |
|---|---|---|---|
| Requests | HTTP requests, RPC sessions, WebSocket messages, alarm invocations | 1 million / month | $0.15 per million |
| Duration | GB-s of wall-clock time at 128 MB | 400,000 GB-s / month | $12.50 per million GB-s |

**Storage — key-value backend** (this is the applicable table):

| Metric | Unit | Included (Paid) | Price above included |
|---|---|---|---|
| Read request units | 4 KB of data read = 1 unit | 1 million | $0.20 per million |
| Write request units | 4 KB of data written = 1 unit | 1 million | $1.00 per million |
| Delete requests | one request, unmetered by size | 1 million | $1.00 per million |
| Stored data | GB-month | 1 GB | $0.20 per GB-month |

> "A request unit is defined as 4 KB of data read or written. A request that writes
> or reads more than 4 KB will consume multiple units, for example, a 9 KB write will
> consume 3 write request units."

For contrast, the **SQLite** backend (not in use) prices at 25 billion rows read /
month included + $0.001 per million, 50 million rows written + $1.00 per million, and
5 GB-month + $0.20/GB-month. The SQLite read allowance is 25,000× larger. If the rate
limiter is ever rebuilt, that is the backend to build it on.

Duration billing details that decide whether a DO is cheap or ruinous:

> "Duration is billed in wall-clock time as long as the Object is active and not
> eligible for hibernation… Calling `accept()` on a WebSocket in an Object will incur
> duration charges for the entire time the WebSocket is connected."

> "Durable Objects that are idle and eligible for hibernation are not billed for
> duration, even before the runtime has hibernated them."

> "Duration billing charges for the 128 MB of memory your Durable Object is allocated,
> regardless of actual usage."

`RateLimiter` (`apps/web/src/rate-limit.ts`) is plain request/response — no WebSockets,
no `setAlarm()`, no long-lived work. It should hibernate promptly and cost close to
nothing in duration.

Rounding is upward and coarse:

> "This billable usage is rounded up to the next billable unit before the corresponding
> rate is applied. For example, 500,000 GB-s of billable compute duration is rounded up
> to 1,000,000 GB-s and billed accordingly."

### Queues and Containers — not deployed

Neither appears in `wrangler.jsonc`. For completeness, if either is ever added:

- **Queues** (<https://developers.cloudflare.com/queues/platform/pricing/>):
  1,000,000 operations/month included on Paid, then $0.40/million. "An operation is
  counted for each 64 KB of data that is written, read, or deleted" — so one message
  costs at least three operations across its lifecycle (write, read, delete).
- **Containers** (<https://developers.cloudflare.com/workers/platform/pricing/>):
  25 GiB-hours memory + 375 vCPU-minutes + 200 GB-hours disk included per month, then
  $0.0000025/GiB-s, $0.000020/vCPU-s, $0.00000007/GB-s. "Charges start when a request
  is sent to the container or when it is manually started."

---

## 2. Workers CPU billing

**It is CPU time, not wall time.**

> "CPU time measures how long the CPU spends executing your Worker code. Waiting on
> network requests (such as `fetch()` calls, KV reads, or database queries) does **not**
> count toward CPU time."
> — <https://developers.cloudflare.com/workers/platform/limits/>

> "Wall time (also called wall-clock time) is the total elapsed time from the start to
> end of an invocation, including time spent waiting on network requests, I/O, and other
> asynchronous operations. This is distinct from CPU time, which only measures time the
> CPU spends actively executing your code."
> — same page

Duration is explicitly not billed for Workers: the Standard row reads "No charge or
limit for duration" (<https://developers.cloudflare.com/workers/platform/pricing/>).
A Worker blocked for 8 seconds on D1 and Vectorize bills ~0 CPU-ms for that wait. This
is the single most reassuring fact in this report: the `/api/og/query` path spends most
of its wall time waiting on AI + Vectorize + KV, and none of that is billed.

**What `limits.cpu_ms` does.** Both — it kills the request *and*, by killing it, bounds
what that request can bill. Cloudflare frames it explicitly as a cost control:

> "**To prevent accidental runaway bills or denial-of-wallet attacks**, configure the
> maximum amount of CPU time that can be used per invocation by defining limits in your
> Worker's Wrangler file, or via the Cloudflare dashboard (**Workers & Pages** > Select
> your Worker > **Settings** > **CPU Limits**)."
> — <https://developers.cloudflare.com/workers/platform/pricing/>

**What happens to a request that exceeds it:**

> "Cloudflare returns Error 1102 to the client with the message `Worker exceeded resource limits`."
> — <https://developers.cloudflare.com/workers/platform/limits/>

**It is a soft ceiling, not an exact one.** From
<https://developers.cloudflare.com/workers/wrangler/configuration/>:

> "Each isolate has some built-in flexibility to allow for cases where your Worker
> infrequently runs over the configured limit. If your Worker starts hitting the limit
> consistently, its execution will be terminated according to the limit configured."

So `cpu_ms` bounds per-request CPU to *approximately* the configured value. It caps
**per-invocation** exposure. It does **not** cap the monthly total — a million requests
each burning 10,000 ms still bills a million × 10,000 ms.

**Is the 10,000 ms value a real financial exposure?**

Worst case for one request:

```
10,000 CPU-ms x $0.02 per 1,000,000 CPU-ms = $0.0002
```

**Two hundredths of one cent.** One pathological request is financially irrelevant. The
exposure is entirely a volume question:

| Requests all burning the full 10 s | Billed CPU-ms | Cost (after the 30M allowance) |
|---|---|---|
| 3,000 | 30,000,000 | $0 — exactly consumes the monthly allowance |
| 10,000 | 100,000,000 | $1.40 |
| 100,000 | 1,000,000,000 | $19.40 |
| 250,000 | 2,500,000,000 | $49.40 |

The number to remember: **the entire monthly CPU allowance is 3,000 requests at the
configured cap.** That sounds alarming but is not, because 10 s is roughly 50× what the
comment at `wrangler.jsonc:52` says a real render costs ("single- to low-triple-digit ms").
At 200 ms per render, the allowance covers 150,000 renders.

The comment in the config is right that 10,000 is a runaway guard rather than a tuning
knob. It is, however, set about 25–50× higher than it needs to be. Lowering it to
1,000 ms would cut worst-case per-request CPU cost by 10× and still leave ~5–10× headroom
over the stated normal range. That is the single cheapest change in this report (§11).

---

## 3. Hard spend controls — the important one

### There is no hard spending cap. Plainly: it does not exist.

Cloudflare's budget-alerts documentation says so in one sentence:

> "**Budget alerts are informational only. They do not pause or cap usage.** Your monthly
> invoice remains the authoritative source for billing."
> — <https://developers.cloudflare.com/billing/manage/budget-alerts/> (Last updated May 29, 2026)

### What budget alerts actually are

From the same page:

> "Budget alerts are available to **Pay-as-you-go accounts only**. Enterprise contract
> accounts are not supported."

> "Budget alerts evaluate your cumulative usage-based spend for the current billing period."
> "When spend crosses the threshold, Cloudflare sends a single email notification to all
> configured recipients." "The alert resets at the start of each new billing period."

Setup: **Manage Account > Billing > Billable Usage > Create budget alert**, configuring
alert name, description, budget threshold in USD, and email recipients.

The Workers Paid plan is a pay-as-you-go account, so **this owner can use budget alerts.**
It fires **once** per billing cycle, by email, and changes nothing about service.

The announcement changelog is
<https://developers.cloudflare.com/changelog/post/2026-04-13-billable-usage-dashboard-and-budget-alerts/>
(the page itself renders a date of April 21, 2026), and a follow-up turned them on by
default for pay-as-you-go accounts:
<https://developers.cloudflare.com/changelog/post/2026-06-15-budget-alerts-default-on/>.
Being on by default means a default threshold may already exist — worth checking and
setting deliberately rather than assuming.

### The documented behaviour when a paid account's usage grows: it bills

Every product's FAQ says the same thing. Two representative quotes:

> "**What happens if I exceed the monthly included reads, writes and/or storage on the
> paid tier?** You will be billed for the additional reads, writes and storage according
> to D1's pricing metrics."
> — <https://developers.cloudflare.com/d1/platform/pricing/>

> "**What happens if I exceed the monthly included reads, writes and/or storage on the
> paid tier?** You will be billed for the additional reads, writes and storage according
> to Vectorize's pricing."
> — <https://developers.cloudflare.com/vectorize/platform/pricing/>

Not throttle. Not error. **Bill.** There is no documented ceiling on a paid account.

### The second alerting mechanism, and why it probably is not available here

<https://developers.cloudflare.com/billing/understand/usage-based-billing/> describes
per-product usage notifications:

> "If you are on a **Professional plan or higher**, you can monitor the usage of individual
> Cloudflare add-ons by turning on email notifications."

> "The email notifications are for informational purposes only. Actual usage and billing
> may vary."

The zone here is on the **Free** plan. If "Professional plan or higher" refers to the
zone plan — which is how Cloudflare normally uses that phrase — then per-product usage
notifications are **not available** and account-wide budget alerts are the only alerting
mechanism on hand. The page does not disambiguate zone plan from account plan; flagged
in §10.

### The closest available approximations to a hard cap

Ranked by how close they actually get:

1. **`limits.cpu_ms`** — a real, enforced, config-level cap, but only on *one* dimension
   (CPU) and only *per invocation*. Cloudflare markets it exactly as a runaway-bill
   control. Nothing equivalent exists for KV writes, Vectorize queries, D1 rows, or
   request count.
2. **A WAF rate limiting rule on the zone** — caps request volume, which caps everything
   downstream. Crippled on a Free zone (§8): 1 rule, 10-second window, path matching only.
3. **The Workers Rate Limiting binding** — code-level, applied before the expensive work.
   Not a billing cap, but it bounds the multiplier. Details in §4.
4. **Downgrading to the Workers Free plan** — the only true hard stop Cloudflare offers,
   because the Free plan fails closed (§5). It is a real lever but a destructive one, and
   **for this account it is currently blocked**: the KV-backed `RateLimiter` namespace must
   be deleted first, and it cannot be recreated afterwards (§0).
5. **Removing the payment method** — not documented on any page I fetched as a spend
   control, and the consequences (service suspension vs. accrued debt) are not described.
   I am not going to speculate. **UNVERIFIED** (§10).

---

## 4. Per-binding limits that can be set in config

The complete set of runtime limits configurable in `wrangler.jsonc`, from
<https://developers.cloudflare.com/workers/wrangler/configuration/> (Last updated Aug 13, 2026):

> "You can impose limits on your Worker's behavior at runtime. Limits are only supported
> for the Standard Usage Model. Limits are only enforced when deployed to Cloudflare's
> network, not in local development. The CPU limit can be set to a maximum of 300,000
> milliseconds (5 minutes)."

There are exactly **two** keys:

| Key | Meaning | Default | Max |
|---|---|---|---|
| `cpu_ms` | "The maximum CPU time allowed per invocation, in milliseconds." | 30,000 on Paid | 300,000 |
| `subrequests` | "The maximum number of subrequests allowed per invocation." | 50 free / 10,000 paid | 10,000,000 paid |

Full syntax as published:

```jsonc
{
	"limits": {
		"cpu_ms": 100,
		"subrequests": 150,
	},
}
```

```toml
[limits]
cpu_ms = 100
subrequests = 150
```

**There is nothing else.** Specifically, there is **no** config key to bound:

- total requests to the Worker
- D1 rows read or written, or queries per invocation
- KV reads, writes, deletes, or lists
- Vectorize queried dimensions or query count
- Workers AI neurons
- Durable Object requests, duration, or storage operations
- R2 operations

Each of those is billed purely on what the code does. The only enforcement point is the
code itself.

**Dashboard equivalent** for CPU: **Workers & Pages > Select your Worker > Settings >
CPU Limits** (<https://developers.cloudflare.com/workers/platform/pricing/>).

**The Workers Rate Limiting binding** (<https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>)
is the one code-level lever that bounds spend before it is incurred:

```jsonc
{
  "ratelimits": [{
    "name": "MY_RATE_LIMITER",
    "namespace_id": "1001",
    "simple": { "limit": 100, "period": 60 }
  }]
}
```

Two constraints from that page: `period` "Must be either 10 or 60" seconds, and

> "Rate limits that you define and enforce in your Worker are local to the Cloudflare
> location that your Worker runs in."

Per-colo, not global — so the effective global limit is roughly `limit × number of colos`
the attacker reaches. Still a large multiplier reduction, and it is checked before the
AI/Vectorize/render work. The page states no pricing or beta status; whether the binding
carries a charge is **UNVERIFIED** (§10).

---

## 5. The free-tier cliffs

The behaviour is asymmetric and it is the whole story of this report:

| Plan | Behaviour at the boundary |
|---|---|
| **Workers Free** | **Hard stop.** Requests fail. |
| **Workers Paid** | **Silent overage.** Nothing fails, nothing warns, the invoice grows. |

Free-plan enforcement, product by product:

- **Workers**: "Accounts on the Workers Free plan have a daily request limit of 100,000
  requests, resetting at midnight UTC. When a Worker exceeds this limit, Cloudflare returns
  **Error 1027**." Route mode decides fail-open (bypass the Worker) vs fail-closed (1027
  error page). — <https://developers.cloudflare.com/workers/platform/limits/>
- **KV**: "All limits reset daily at 00:00 UTC. If you exceed any one of these limits,
  further operations of that type will fail with an error." — <https://developers.cloudflare.com/kv/platform/pricing/>
- **D1**: "When your account hits the daily read and/or write limits, you will not be able
  to run queries against D1. D1 API will return errors to your client indicating that your
  daily limits have been exceeded." — <https://developers.cloudflare.com/d1/platform/pricing/>
- **Workers AI**: "All limits reset daily at 00:00 UTC. If you exceed any one of the above
  limits, further operations will fail with an error." — <https://developers.cloudflare.com/workers-ai/platform/pricing/>

Paid-plan enforcement: none found, on any product page. Every paid FAQ says "you will be
billed."

**The one exception that applies on Paid.** Workers AI's 10,000 neurons/day free allocation
is identical on Free and Paid, and the "fail with an error" sentence sits in a section that
covers both plans without distinguishing them. Whether a Paid account exceeding 10,000
neurons/day errors or silently bills is **genuinely ambiguous on the page** — see §10. The
adjacent sentence ("On Workers Paid, you will be charged at $0.011 / 1,000 Neurons for any
usage above the free allocation") implies billing, which would make the "fail with an error"
sentence Free-plan-only. I could not resolve this from the documentation.

---

## 6. Known billing surprises

Restricted to documented mechanisms. Anything I could not source to Cloudflare is either
labelled or omitted; I found no Cloudflare-published incident write-ups of specific customer
bills, and I am not going to substitute community anecdotes for them.

### Documented by Cloudflare

**1. Cache hits are billed as requests.** The largest structural surprise in this stack.

> "When Workers Caching is enabled, requests served from the Worker's cache are billed at
> the same per-request rate as requests that invoke the Worker."
> — <https://developers.cloudflare.com/workers/platform/pricing/>

> "Since Cloudflare Workers runs before the Cloudflare cache, the caching of a request still
> incurs costs." — same page

Caching is a CPU optimisation here, not a request optimisation. `"cache": { "enabled": true }`
is set in this config.

**2. `cross_version_cache: false` empties the edge cache on every deploy.** This is pinned
deliberately (`wrangler.jsonc:38-43`) and the reasoning there is sound. The billing consequence
is worth stating: every deploy resets the cache-hit ratio to zero, so post-deploy traffic runs
at full CPU cost until the cache refills. Frequent deploys ≈ persistently higher CPU billing.
The mechanism follows from the config comment plus footnote 4 above; Cloudflare does not
document the cost implication directly.

**3. D1 bills scanned rows, not returned rows.** A `SELECT` filtered on an unindexed column
bills the full scan. A `COUNT(*)` bills one row read per row in the table — which the codebase
already knows (`apps/web/src/index.ts:304`: "COUNT(*) bills one D1 row-read per row scanned,
so running it per render is…"). — <https://developers.cloudflare.com/d1/platform/pricing/>

**4. KV misses cost money.** "All operations incur charges, including fetches for non-existent
keys that return a `null`." A cache-miss path costs a read *and* a $5/million write. Unbounded
key spaces are therefore unbounded write bills. — <https://developers.cloudflare.com/kv/platform/pricing/>

**5. DO duration is billed for wall-clock time at a fixed 128 MB, and WebSockets pin it.**
"Calling `accept()` on a WebSocket in an Object will incur duration charges for the entire time
the WebSocket is connected." Use the Hibernation API instead. Not applicable here (no WebSockets),
but it is the classic DO bill-shock mechanism. — <https://developers.cloudflare.com/durable-objects/platform/pricing/>

**6. DO alarms are billed twice.** Each alarm invocation is a billed request, and
"Each `setAlarm()` is billed as a single row written" (SQLite) / "a single write request unit"
(KV-backed). A self-rescheduling alarm therefore bills on both axes forever. Not applicable
here — `RateLimiter` calls no `setAlarm()`. — <https://developers.cloudflare.com/durable-objects/platform/pricing/>

**7. DO in-memory cache hits still bill storage.** "Requests that hit the Durable Objects
in-memory cache or that use the multi-key versions of `get()`/`put()`/`delete()` methods are
billed the same as if they were a normal, individual request for each key." Caching inside the
object does not reduce the storage bill. — <https://developers.cloudflare.com/durable-objects/platform/pricing/>

**8. KV-backed DO storage bills per 4 KB, not per operation.** "A 9 KB write will consume 3
write request units." List operations bill by data examined: "a list request that returns a
combined 80 KB of keys and values will be billed 20 read request units."
— <https://developers.cloudflare.com/durable-objects/platform/pricing/>

**9. CLI and dashboard operations are billable** on D1, KV, and Vectorize — each page says so
explicitly. A local `wrangler d1 execute` against the production database or a bulk KV import
costs real money.

**10. Rounding is upward, sometimes coarsely.** R2: "one million and one operations" bills as
two million. Durable Objects: "500,000 GB-s … is rounded up to 1,000,000 GB-s."

### Mechanism present in this codebase

Not a Cloudflare-documented incident — this is my own reading of the code, stated as such.

`/api/og/query?q=<anything>` (`apps/web/src/index.ts:1228` → `apps/web/src/seo.ts:575-608`) is an
**unbounded URL space with a five-product fan-out on every miss**:

1. KV read on `OG_IMAGE_CACHE` (miss) — billed
2. `env.AI.run("@cf/google/embeddinggemma-300m", …)` — neurons
3. `env.VECTORIZE.query(vector, { topK: 48, returnMetadata: "all" })` — queried dimensions
4. `renderPng(...)` via `@cf-wasm/resvg` — the CPU-heavy step, capped at 10,000 ms
5. KV write on `OG_IMAGE_CACHE` at $5/million

The rate limiter covers `toggleLike` (20/60s) and `contactForm` (5/600s) only
(`apps/web/src/rate-limit.ts:1-4`). **Neither `/api/og/query` nor `/search` is rate-limited.**
Every distinct `q=` value is a permanent cache miss on first sight, and the KV entry then
occupies storage for `PNG_CACHE_TTL_SECONDS` = 7 days (`apps/web/src/seo.ts:469`).

The search cache (`SEARCH_CACHE`, 3-day TTL, `apps/web/src/semantic-search.ts:21`) has the same
shape via `/search?q=`, minus the PNG render.

This is the mechanism that §7's arithmetic prices.

---

## 7. Free-plan zone behaviour

The zone being on the Free plan does not create a *direct* cost trap — nothing about it bills
more. It removes **mitigations**, which is worse in a different way.

### Cache Reserve — unavailable, and that is fine

> "A paid Cache Reserve plan is required."
> — <https://developers.cloudflare.com/cache/advanced-configuration/cache-reserve/>

Cache Reserve is itself metered ($0.015/GB-month storage, $4.50/million Class A,
$0.36/million Class B, per that page) and
<https://developers.cloudflare.com/billing/understand/usage-based-billing/> lists its free tier
as "**None**". Not having it removes a spend line rather than adding one. Not a trap.

### Tiered Cache — availability not confirmed

I could not load a page stating Free-plan availability for Tiered Cache; both
<https://developers.cloudflare.com/cache/plans/> and
<https://developers.cloudflare.com/cache/advanced-configuration/tiered-cache/> failed to yield a
per-plan table (the latter 404s). **UNVERIFIED** (§10). Note this is mostly moot: with
`"cache": { "enabled": true }` the Worker uses Workers Caching, and cache hits bill as requests
regardless of tiering.

### WAF rate limiting is severely limited on a Free zone — this is the real finding

From <https://developers.cloudflare.com/waf/rate-limiting-rules/>, the Free column:

| Feature | Free plan |
|---|---|
| Number of rules | **1** |
| Available fields in rule expression | **Path, Verified Bot** — *not* Query, not Full URI, not Host |
| Counting characteristics | IP |
| Counting periods | **10 s** (only) |
| Mitigation timeout periods | **10 s** (only) |
| Cache exclusion | No |
| Custom counting expression | No |

Three consequences that bite here:

1. **You cannot rate-limit on the query string.** `Query` first appears in the **Pro** column.
   A Free-zone rule cannot distinguish `/api/og/query?q=aaa` from `/api/og/query?q=bbb` — it can
   only match the *path* `/api/og/query` and rate-limit the whole endpoint per IP. That is still
   useful, but it is a blunt instrument that will also throttle legitimate social-card fetches.
2. **10-second windows and 10-second mitigation only.** A distributed crawler hitting once every
   11 seconds per IP is never caught.
3. **One rule for the entire zone.** Protecting `/api/og/query` means not protecting `/search`,
   or writing one rule loose enough to cover both.

Upgrading the zone to **Pro** unlocks `Query` and `Full URI` matching, 2 rules, counting periods
up to 1 minute, and mitigation up to 1 hour. That is a genuine spend-control purchase, not a
performance one.

### The subrequest counting gotcha

From <https://developers.cloudflare.com/waf/rate-limiting-rules/troubleshooting/>:

> "Cloudflare may count Workers subrequests on the same zone as separate requests, which will
> cause a rate limiting rule to trigger sooner than expected."

The documented fix is to add to the rule expression:

```txt
and (cf.worker.upstream_zone == "" or cf.worker.upstream_zone != "<YOUR_ZONE>")
```

This causes *over*-triggering (safe direction for spend, annoying for users), and matters because
`apps/web/src/index.ts:529` constructs a same-origin `/api/og/query` URL.

### workers.dev is a bypass surface

Both environments set `"workers_dev": true` (`wrangler.jsonc:66` and `:144`), so
`grabient-production.jkorzhuk.workers.dev` answers alongside `grabient.com`. Zone-level WAF rules
are configured per zone, and `workers.dev` is not this account's zone — but **I could not find a
Cloudflare page stating outright that zone WAF rules do not apply to workers.dev subdomains**, so
I am marking the inference **UNVERIFIED** (§10) rather than asserting it.

Regardless of how that resolves, disabling it on production is documented and cheap
(<https://developers.cloudflare.com/workers/configuration/routing/workers-dev/>), with one trap:

> "If you disable your `workers.dev` route in the Cloudflare dashboard but do not update your
> Worker's Wrangler file with `workers_dev = false`, the `workers.dev` route will be re-enabled
> the next time you deploy."

So it must be changed in `wrangler.jsonc`, not just the dashboard.

---

## 8. What would actually have to happen for this to cost more than $50 in a month

Baseline is $5.00 (the account minimum). **$45.00 of overage** is the target. Below, each knob is
pushed alone, with all other usage assumed inside its allowance.

### Cost of one novel semantic search (cache miss)

Assuming a 768-dimension index (see the caveat below):

| Component | Rate | Cost per query |
|---|---|---|
| Vectorize queried dimensions | 768 × $0.01/M | **$0.00000768** |
| KV write (cache the result) | $5.00/M | **$0.00000500** |
| KV read (the miss) | $0.50/M | $0.00000050 |
| Worker request | $0.30/M | $0.00000030 |
| Workers AI embed | UNVERIFIED | — |
| Worker CPU | varies | — |
| **Subtotal (excl. AI + CPU)** | | **≈ $0.0000135** → **$13.50 per million searches** |

**Vectorize is the most expensive single knob per search, ahead of the KV write.** That is
counter-intuitive and it is the main quantitative finding here.

A repeat search (cache hit) costs a KV read + a request = $0.0000008, i.e. ~17× cheaper. The
caches are doing real financial work.

### Single-knob thresholds for $45 of overage

| Knob | Arithmetic | Volume required |
|---|---|---|
| **KV writes** | $45 ÷ $5.00/M + 1M included | **10 million writes/month** (~333,000/day) |
| **Vectorize** | $45 ÷ $0.01/M = 4,500M dims, + 50M included, ÷ 768 | **~5.9 million queries/month** (~198,000/day) |
| **Worker CPU** | $45 ÷ $0.02/M = 2,250M CPU-ms, + 30M included | **2.28 billion CPU-ms** = 633 CPU-hours; at 200 ms/render **11.4M renders**; at the 10 s cap **228,000 requests** |
| **Worker requests** | $45 ÷ $0.30/M + 10M included | **160 million requests/month** (~5.3M/day, ~62 req/s sustained) |
| **D1 rows written** | $45 ÷ $1.00/M + 50M included | **95 million row writes/month** |
| **D1 rows read** | $45 ÷ $0.001/M + 25B included | **70 billion rows read/month** — effectively unreachable |
| **R2 Class A** | $45 ÷ $4.50/M + 1M included | **11 million uploads/month** — not plausible for avatars |
| **R2 storage** | $45 ÷ $0.015 + 10 GB included | **3,010 GB stored** |
| **DO duration** | $45 ÷ $12.50/M + 400,000 GB-s | 4.0M GB-s = 32M object-seconds at 128 MB = **~8,900 object-hours**, i.e. **~12 Durable Objects pinned awake 24/7** |
| **DO requests** | $45 ÷ $0.15/M + 1M included | **301 million DO requests/month** |
| **Workers AI** | $45 ÷ $0.011 per 1,000 | **4.09 million neurons/month** above the 300,000/month free — model price UNVERIFIED |

### The realistic combined scenario

The knobs do not move independently. A crawler discovering `/api/og/query?q=…` drives requests,
CPU, KV writes, Vectorize, and neurons **simultaneously**. Let `N` = novel OG-query requests per
month, at an assumed 200 ms CPU per PNG render:

| N (novel queries/month) | Requests | CPU | KV writes | Vectorize | **Total incl. $5 base** |
|---|---|---|---|---|---|
| 1,000,000 | $0 | $3.40 | $0 | $7.18 | **$15.58** |
| 2,000,000 | $0 | $7.40 | $5.00 | $14.86 | **$32.26** |
| 3,000,000 | $0 | $11.40 | $10.00 | $22.54 | **$48.94** |
| 3,200,000 | $0 | $12.20 | $11.00 | $24.08 | **$52.28** |

Worked, for N = 3,000,000:

```
CPU:       (3,000,000 x 200 ms) - 30,000,000 included = 570,000,000 CPU-ms
           570 x $0.02                                = $11.40
KV writes: 3,000,000 - 1,000,000 included = 2,000,000
           2 x $5.00                                  = $10.00
Vectorize: (3,000,000 x 768) - 50,000,000 = 2,254,000,000 dims
           2,254 x $0.01                              = $22.54
Requests:  3,000,000 < 10,000,000 included            = $0.00
                                                       ---------
                                             overage    $43.94
                                             base       $5.00
                                                       ---------
                                             TOTAL     $48.94
```

**The answer to the owner's question:** it takes roughly **3 million novel search or OG-card
queries in a month** — about **100,000 per day**, or **~1.2 requests per second sustained for
30 days** — to cross $50.

That is a *modest* rate. It is one determined scraper, one badly-behaved AI crawler enumerating
query strings, or one person with a loop. It is not a viral traffic event; a viral event that hit
mostly *cached* URLs would be far cheaper, because cache hits cost $0.0000008 against
$0.0000135 for a miss.

### Cross-check against measured consumption

`infra-research/measured-consumption-2026-08-17.md` (a companion document, sourced from the
Cloudflare GraphQL Analytics API rather than the pricing docs) measured actual 24-hour usage on
this account. It confirms three assumptions above and corrects one:

| Assumption in §8 | Measured | Verdict |
|---|---|---|
| ~200 ms CPU per render | **CPU p99.9 = 141 ms**, p50 = 2.6 ms | Conservative — real CPU is lower |
| `limits.cpu_ms: 10000` is far above real usage | 10,000 ÷ 141 = **~70× headroom** | Confirmed; strengthens action #3 |
| Workers AI cost is a rounding error | 765 calls → **5.47 neurons** (0.00715 neurons/call) | Confirmed — cheaper than the peer-based estimate |
| Vectorize well inside allowance | **14.34M queried dims/month** vs 50M included | Confirmed (~29% of allowance) |
| KV writes inside allowance | ~11,420/day ≈ **342k/month** vs 1M included | Confirmed (~34% of allowance) |
| Baseline bills $5.00/month flat | **~367k requests/day ≈ 11M/month** | **Corrected — see below** |

**Correction to the baseline.** Production already serves ~11 million requests/month against a
10-million included allowance, so the current bill is not the $5.00 minimum but approximately:

```
$5.00 base + (11,000,000 - 10,000,000) / 1,000,000 x $0.30 = $5.30
```

Requests are therefore *already* the binding constraint, and every other product is comfortably
inside its allowance. That changes the shape of the risk in a useful way: the realistic path to a
large bill is **linear growth in request count**, not a per-request cost bomb. Note also that the
measured 0.00715 neurons/call, applied to the §8 scenario of 3M queries, gives ~21,450 neurons
≈ $0.24 — confirming Workers AI can be safely ignored in these totals even though its list price
is unpublished.

Conversely, ordinary organic traffic is nowhere near the $50 threshold. Current usage bills
**~$5.30/month**, and it would take roughly a 15× increase in request volume — or the far cheaper
route of ~3M *novel* (uncached) queries — to reach $50.

**Caveats on this arithmetic.** Three inputs are estimates, not documented facts:
the 768 index dimension (not stated on any Cloudflare page I fetched); 200 ms CPU per PNG render
(taken from the comment at `wrangler.jsonc:52`, not measured); and the Workers AI neuron cost,
which is unpublished for this model and is **omitted entirely** from the table above. If
embeddinggemma-300m is priced like its listed peers (1,075–1,841 neurons per million input tokens),
a ~10-token query costs ~0.011–0.018 neurons and 3M queries ≈ 33,000–55,000 neurons ≈ $0.36–$0.60
— rounding error. If it is priced like a large model, this changes materially. **Verify it before
relying on the totals.**

---

## 9. Ranked spend-control actions

Ranked by (risk removed) ÷ (effort). Every one is available on the current plan unless noted.

### 1. Create a budget alert at $15 and $40 — **[dashboard]**
**Manage Account > Billing > Billable Usage > Create budget alert.** Available to pay-as-you-go
accounts, which this is. It will not stop anything, but it converts a surprise invoice into an
email while there is still time to act. Alerts may already be on by default
(<https://developers.cloudflare.com/changelog/post/2026-06-15-budget-alerts-default-on/>) — set the
threshold deliberately rather than inheriting one. Two minutes of work; highest value in this list.

### 2. Rate-limit `/api/og/query` and `/search` in the Worker — **[code]** + **[config]**
This is the actual fix. It is the only control that sits in front of all five metered products at
once, and unlike the WAF it is not degraded by the Free zone plan. Add a `ratelimits` binding and
check it before the AI/Vectorize/render path in `apps/web/src/seo.ts:575` and
`apps/web/src/semantic-search.ts:212`:

```jsonc
{
  "ratelimits": [{
    "name": "SEARCH_LIMITER",
    "namespace_id": "1002",
    "simple": { "limit": 30, "period": 60 }
  }]
}
```

`period` must be 10 or 60. Remember it is per-colo, not global
(<https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>). Note the existing
`RateLimiter` Durable Object is the wrong tool for this — a DO round-trip on every search adds DO
requests and duration to a path you are trying to make cheaper.

### 3. Lower `limits.cpu_ms` from 10000 to ~1000 — **[config]**
One line in `wrangler.jsonc:53`. Cuts worst-case per-request CPU billing 10×. Cloudflare markets
this setting precisely as the defence against "accidental runaway bills or denial-of-wallet attacks".
Measured **CPU p99.9 in production is 141 ms** (`measured-consumption-2026-08-17.md`), so 1,000 ms
leaves ~7× headroom over the worst request actually observed, while the current 10,000 ms leaves
~70×. Requests that exceed the cap get Error 1102, so confirm the slowest legitimate render before
changing it — the config comment's instruction to "raise it before optimizing against it" is the
right instinct; this is just observing that 10 s sits far above where that tradeoff needs to be.

### 4. Bound the OG cache key space — **[code]**
`apps/web/src/seo.ts:583` builds a KV key from arbitrary user input. Two options, both cheap:
reject `q` values over some length or outside a charset before doing any work; or serve a generic
card for queries that return no results. Note the code already declines to cache empty results
(`seo.ts:604`, "An empty montage (search outage) must not persist for 7 days") — which is correct
for staleness but means a query returning nothing repeats the *full* expensive path every time.
That is the worst case for cost, and it is reachable by any nonsense query string.

### 5. Set `workers_dev: false` on production — **[config]**
`wrangler.jsonc:144`. Removes a hostname that answers the same expensive routes and is plausibly
outside zone WAF coverage (UNVERIFIED, §10). Must be changed in the config file, not just the
dashboard, or the next deploy re-enables it. Keep it `true` on staging.

### 6. Add the one Free-plan WAF rate limiting rule on `/api/og/query` — **[dashboard]**
Path matching and 10-second windows only, 1 rule for the whole zone, IP-based
(<https://developers.cloudflare.com/waf/rate-limiting-rules/>). Weak, but it is free and it stops
the crude case. If you add it, include the subrequest exclusion from §7, since
`apps/web/src/index.ts:529` makes a same-origin call to this exact endpoint.

### 7. Watch the Billable Usage dashboard for the first month — **[dashboard]**
**Manage Account > Billing > Billable Usage.** Gives "daily visibility into usage-based costs"
with a per-product breakdown against free-tier allowances
(<https://developers.cloudflare.com/billing/understand/usage-based-billing/>). Daily granularity
means a runaway is visible within a day instead of at invoice time.

### 8. Confirm the Workers AI price before trusting any estimate — **[dashboard]**
`@cf/google/embeddinggemma-300m` is not on the public price list (§10). The Workers AI dashboard
(**dash.cloudflare.com > AI > Workers AI**) reports actual neuron consumption
(<https://developers.cloudflare.com/workers-ai/platform/pricing/>). Run a known number of searches,
read the neuron delta, and you have the real rate. This is the only way to close that gap.

### 9. Consider a Pro zone upgrade *only* if WAF is the chosen defence — **[dashboard, costs money]**
Pro unlocks `Query`/`Full URI` matching, 2 rules, 1-minute counting periods and 1-hour mitigation
(<https://developers.cloudflare.com/waf/rate-limiting-rules/>). Ranked low because action #2
achieves more for $0. Listed because if the owner prefers an edge control over a code change, this
is what makes the edge control usable.

### Not recommended: downgrading to the Workers Free plan
It is the only true hard stop (Free fails closed with Error 1027, §5), but it is currently
**blocked** — the KV-backed `RateLimiter` namespace must be deleted first, and per
<https://developers.cloudflare.com/durable-objects/platform/pricing/> the KV backend "is only
available to accounts that already have a key-value-backed namespace", so it cannot be restored.
Trading a live production feature and an unrecoverable storage backend for a spend cap is the
wrong trade at these amounts.

---

## 10. UNVERIFIED — what I could not confirm

Listed so none of it gets mistaken for a documented fact.

1. **Workers AI price for `@cf/google/embeddinggemma-300m`.** Not published. The model is absent
   from the Embeddings table at <https://developers.cloudflare.com/workers-ai/platform/pricing/>
   (the full six-row table is reproduced in §1), and its own page at
   <https://developers.cloudflare.com/workers-ai/models/embeddinggemma-300m/> has no pricing section.
   I checked the raw markdown of both. Cost per embedding call is therefore unknown; §8 omits it and
   gives a peer-based range only, clearly labelled as such.
   **Partially closed empirically**: `measured-consumption-2026-08-17.md` records 765 calls
   consuming 5.47 neurons (0.00715 neurons/call ≈ $0.000000079), which bounds the practical impact
   at rounding-error levels. That is a measurement of this workload, not a published rate — the
   per-million-token price remains unpublished and could change without notice.

2. **The Vectorize index dimension.** I assumed 768 throughout. Cloudflare's model page does not
   state the output dimension, and the index is created outside this repo (no `dimensions` value
   anywhere in the tree). All Vectorize arithmetic in §8 scales linearly with this number — at 384
   it halves, at 1536 it doubles. **Confirm via `wrangler vectorize get grabient-palettes` before
   relying on it.** The measured 14.34M queried dimensions/month does not cleanly resolve the
   dimension either, since the query count and stored-vector count for that period are not both
   known.

3. **Vectorize: does the stored-vector term apply once, or per query?** The formula
   `((queried vectors + stored vectors) * dimensions * …)` adds index size to the *queried* total,
   yet the same page says "If you are not issuing queries against your indexes, you are not billed
   for queried vector dimensions." Both worked examples add the stored term exactly once per month,
   which is what §8 assumes. What is ambiguous: the page never states the accounting rule directly,
   so an index that grows large could in principle consume the 50M queried allowance on its own.
   At 768 dimensions the allowance is exhausted by 65,104 stored vectors before a single query.

4. **Workers AI at the daily cap on a Paid plan: error or bill?** The page says both
   "If you exceed any one of the above limits, further operations will fail with an error" and
   "On Workers Paid, you will be charged at $0.011 / 1,000 Neurons for any usage above the free
   allocation of 10,000 Neurons per day", without scoping the first sentence to the Free plan.
   Which applies to a Paid account is unresolved.

5. **Static assets: free-and-unlimited vs. billed-when-cached.**
   <https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/> says
   "Requests to static assets are free and unlimited"; footnote 4 of
   <https://developers.cloudflare.com/workers/platform/pricing/> says that with Workers Caching
   enabled, cached requests "are billed at the same per-request rate… **This includes requests to
   static assets**." This config enables Workers Caching. The two statements conflict and neither
   page reconciles them.

6. **Do per-product usage notifications require a Pro *zone* or a Pro *account*?**
   <https://developers.cloudflare.com/billing/understand/usage-based-billing/> says "If you are on a
   Professional plan or higher" without saying which plan. Determines whether the owner has anything
   beyond account-wide budget alerts.

7. **Tiered Cache availability on a Free zone.** Could not confirm.
   <https://developers.cloudflare.com/cache/advanced-configuration/tiered-cache/> returns 404 and
   <https://developers.cloudflare.com/cache/plans/> did not yield a per-plan table on fetch.

8. **Whether zone WAF rules cover `*.workers.dev`.** No Cloudflare page I fetched states this either
   way. The inference (they do not, since workers.dev is not the account's zone) is reasonable but
   undocumented, so §7 treats it as unconfirmed.

9. **Whether the Workers Rate Limiting binding is billed.**
   <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/> states no price and
   no beta status. Assumed free; not confirmed.

10. **Removing the payment method as a spend control.** No documentation found on what happens to a
    Workers Paid account with no valid payment method — suspension, downgrade, or accrued debt. Not
    investigated further because guessing here would be worse than useless.

11. **R2 free tier scope (per-account vs per-plan).** <https://developers.cloudflare.com/r2/pricing/>
    presents it as an unqualified "Free" column with no plan attribution.

---

## Sources

All fetched 2026-08-17.

| Page | URL |
|---|---|
| Workers pricing | <https://developers.cloudflare.com/workers/platform/pricing/> |
| Workers limits | <https://developers.cloudflare.com/workers/platform/limits/> |
| Wrangler configuration | <https://developers.cloudflare.com/workers/wrangler/configuration/> |
| Static Assets billing | <https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/> |
| workers.dev routing | <https://developers.cloudflare.com/workers/configuration/routing/workers-dev/> |
| Workers Rate Limiting binding | <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/> |
| D1 pricing | <https://developers.cloudflare.com/d1/platform/pricing/> |
| KV pricing | <https://developers.cloudflare.com/kv/platform/pricing/> |
| R2 pricing | <https://developers.cloudflare.com/r2/pricing/> |
| Vectorize pricing | <https://developers.cloudflare.com/vectorize/platform/pricing/> |
| Workers AI pricing | <https://developers.cloudflare.com/workers-ai/platform/pricing/> |
| embeddinggemma-300m model | <https://developers.cloudflare.com/workers-ai/models/embeddinggemma-300m/> |
| Durable Objects pricing | <https://developers.cloudflare.com/durable-objects/platform/pricing/> |
| Queues pricing | <https://developers.cloudflare.com/queues/platform/pricing/> |
| Budget alerts | <https://developers.cloudflare.com/billing/manage/budget-alerts/> |
| Usage-based billing | <https://developers.cloudflare.com/billing/understand/usage-based-billing/> |
| How charges accrue | <https://developers.cloudflare.com/billing/understand/how-charges-accrue/> |
| Billable usage changelog | <https://developers.cloudflare.com/changelog/post/2026-04-13-billable-usage-dashboard-and-budget-alerts/> |
| Budget alerts default-on changelog | <https://developers.cloudflare.com/changelog/post/2026-06-15-budget-alerts-default-on/> |
| WAF rate limiting rules | <https://developers.cloudflare.com/waf/rate-limiting-rules/> |
| Rate limiting troubleshooting | <https://developers.cloudflare.com/waf/rate-limiting-rules/troubleshooting/> |
| Cache Reserve | <https://developers.cloudflare.com/cache/advanced-configuration/cache-reserve/> |

Failed to load (recorded in §10): `https://developers.cloudflare.com/cache/advanced-configuration/tiered-cache/` (404),
`https://developers.cloudflare.com/workers/static-assets/billing/` (404),
`https://developers.cloudflare.com/cache/plans/` (loaded, but yielded no per-plan feature table).
