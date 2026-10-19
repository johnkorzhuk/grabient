# web

grabient.com: TanStack Start on Solid 2, one Cloudflare Worker. `vite dev` runs the Worker in workerd with every
binding local; `vite build --mode staging` then `vite preview` runs the built one. Both read their secrets from
`.dev.vars`, which git ignores: copy `.dev.vars.example` to it, or every `/api/auth/*` route answers 503 and nobody
signs in.

## How a request is answered

`src/server.ts` is the Worker. `src/server/pipeline.ts` runs around Start, in order: grabient.com is served only by the
production deploy; campaign tags come off the address and ride every redirect; the language prefix is put right (301),
a page loses its trailing slash (301), a prefix on an API or a file is 404, and a reader arriving from elsewhere is
sent to their language (302); the canonical address (301) comes from the rules in `src/server/canonical.ts`; private
and app addresses (`src/server/paths.ts`) go to Start directly with `no-store`, and every other GET goes through the
edge cache (`src/server/edge-cache.ts`), where an old `_` link no map holds is answered with a 301 to the palette
fitted to it (`src/server/seo/legacy-fit.ts`). Every answer then gets the security headers, `X-Robots-Tag` outside
production, CORS on public files and `Server-Timing: build`. Any status but 200, 304 and a 301 that names its lifetime
is `no-store`.

The edge cache keeps a 200 to a GET or a 301 to a GET or a HEAD, when it has a positive `CDN-Cache-Control` max-age,
no `private` or `no-store`, no `Set-Cookie` and no `Vary`, under its path in its language, the query that decides it
and the build (`src/server/cache-keys.ts`). A page that renders an error answers 500, which nothing keeps.

## Pages

A page is a file route in `src/routes/`, by address without the language: `palettes/index.tsx` is `/palettes`,
`$id/index.tsx` is every one-segment address (a seed, a collection, an old id), `@{$handle}/$slug/index.tsx` an
account's collection. The router writes the reader's language on every `<Link>`, navigation and redirect; a plain
`<a>` takes `localHref(path)` from `@grabient/i18n`. A route declares its cache class with `headers: () => PAGE` (from
`src/lib/cache.ts`), its metadata with `head: () => pageHead({ kind: "about" })` (`src/lib/page-meta.ts`), and
`ssr: false` or `"data-only"` when the browser draws it alone.

A page that reads data does it through TanStack Query, one `queryOptions` factory per read in
`src/features/<name>/queries.ts`, shared by the loader and the component:

```ts
const readList = createIsomorphicFn()
  .server((params: ListParams) => listPalettes(params))           // src/server/…, reads D1 directly
  .client((params: ListParams) => getJson(`/api/palettes?${query(params)}`, PaletteList));
export const listQuery = (params: ListParams) =>
  queryOptions({ queryKey: ["palettes", params], queryFn: () => readList(params), staleTime: 5 * 60_000 });
```

The route's loader fills the cache and returns nothing, so the data is sent once, inside Query's cache:
`loader: async ({ context, deps }) => { await context.queryClient.ensureQueryData(listQuery(deps)); }`. The
component reads `useQuery(() => listQuery(search()))` under a `<Loading>`. The server renders from the direct read,
hydration fetches nothing, and a later navigation, or a hover's preload, GETs the API route, which the edge caches.

A page that does not exist throws `notFound()`; the root route alone has a not-found component. A page route with one of
its own would turn a render error into an empty 200.

## The frame

The root route renders the document and, as its component, the frame every page stands in (`src/app/Shell.tsx`): the
privacy banner, the water, the header with the wordmark and its corner, the keys, the toast line and the embed notice.
It stays mounted as pages change. A route says how it is framed in its `staticData` (`src/app/shell.ts`): `frame`
(`app`, `brand` or `sheet`), `corner` (the tools before the theme button: a list's `ListAppearance`, the editor's own),
`still` and `moving` (the water under reduced motion), `translated` (the language menu lets crawlers follow) and
`strip`. Its loader may return `paint`, the palettes the bar and the water show from the first render on both sides. A
page whose palettes change as the reader works hands them in with `useContext(ShellContext).paint(() => palettes)`,
and its own keys with `.keys(() => bindings)`, each for as long as it is mounted.

A page's content stands in `AppPage` (the content, then the footer) or `BrandFrame` (the side navigation, one pane and
the footer) from `src/app/Frames.tsx`; both end in the language menu. A page that draws its own `PageFrame` (MCP, an
app's consent) takes the menu from `Languages` there, and the navigation and footer links from `src/app/site.ts`. A
plain `<a>` to one of the site's pages is the app's own navigation (`src/app/navigation.ts`), as a `<Link>` is, except a
link with a target, a download or `hreflang`. The page's undo (`src/app/undo.ts`) is Mod+Z on every page: a feature
records a step with `record({ undo, redo })`.

## API routes and files

`src/routes/api/<name>.ts` with `server: { handlers: { GET } }`, its input checked with Valibot, its answer from
`json(data, { headers: PAGE })`; an error is `json({ error: msg("…") }, { status })`, which the page translates. A
handler that reads a part of its query adds a key rule to `src/server/cache-keys.ts`; one answering one reader adds
its path to `privatePath`; one any site may fetch, to `publicFile`. A file beside a page is a suffix route:
`{$seed}[.]png.ts` is `/{seed}.png`, and its key rule sets `acrossBuilds` when no deploy changes its bytes.

Worker-only code lives in `src/server/` and reads its bindings with `import { env } from "cloudflare:workers"`. The
browser's build fails on an import of it from code the browser runs; an import used only inside
`createIsomorphicFn().server()` or a server handler is removed from the browser's build. Every request through Start
first loads every route's module, so a handler whose work no page shares (the MCP server, the authorization server,
an account's connections) imports it inside the handler, and only its own requests load it.

## Accounts and the offline copy

Sign-in is Better Auth behind the server package's gate, mounted on `/api/auth/*`. The browser asks who is signed in
after the first render (`src/features/account/session.ts`); public HTML never carries an account, and `account()`
is undefined until that answer, null signed out. Once an account is known the page loads the copy's engine
(`features/account/sync.ts`): the account's likes and collections in IndexedDB (`grabient-account-{id}`), the
changes made here in its outbox, and `POST /api/me/sync` sending them in order and bringing back what changed. A page
reads `accountView()` and writes through `likes.ts` and `collections.ts`, which change the copy at once, offline too.
Tabs share the copy through a BroadcastChannel, and one tab syncs at a time under a Web Lock.

Browsers keep changes they could not send in IndexedDB, so the sync's wire (`features/account/wire.ts`) and the
database's version 1 stores never change in place: a new shape takes a new database version that rewrites the outbox.
The same holds for the removal undo tokens and the username rules, which the browser and the Worker share.

A switch the server keeps outside the copy (a feature flag, the newsletter, a vote) shows its press at once through
`src/lib/optimistic.ts`. The production build writes `/sw.js` (`scripts/service-worker.ts`), which opens the
account's pages and the pages whose words are in the code with no connection; `SW=off` builds one that removes itself.

## Privacy choices

Where a reader's choices start is one rule, `consentRule` in `packages/server/src/consent.ts`, read from the place
Cloudflare finds the request in (`request.cf`). `ask` (the EEA, wherever the place is unknown, and the others the
module names, the UK among them until GA4 holds its data as Google's processor) has Analytics, Marketing and Session
replay start off; `tell` (Switzerland) has Analytics start on and the rest off; `none` has Analytics and Marketing start
on. Replay starts off everywhere, a browser that sends Global Privacy Control or Do Not Track starts with all three off,
and a page in another site's frame, which shows no banner, starts under `tell` as under `ask`. A choice stands for 13
months. `/api/geo` answers the page's rule, kept by no
cache, and the browser keeps a reader's choice in `consent-preferences` (`src/features/analytics/consent.ts`), written
only once the reader chooses. Analytics itself runs on grabient.com alone (`src/features/analytics/analytics.ts`), and
it and a recording name an account's collection (`/@handle/slug`) by its kind, never by its address.

Under `ask` and `tell` a reader who has not chosen sees the banner (`@grabient/ui/ConsentBanner.tsx`, wired in
`src/app/ConsentBanner.tsx`). The frame mounts it right after the skip link, fixed over the screen's foot, and loads
its code only for a reader who sees it; the server never draws it. It stays out of another site's frame, the pages
analytics stays out of and Settings, whose Privacy section is the whole choice. Reject all, Accept all or any switch in
Settings is the reader's choice, and the banner is gone from then on in that browser. A press on the banner is no use
of the page: analytics waits for the next one.

An account made under `ask` or `tell` waits for its own yes before the newsletter (`auth_user.newsletter_opt_in`,
written by the sign-in library as it makes the account); `src/server/newsletter/list.ts` reads a missing choice as off
for it and on for everyone else. An account made before the column holds none, and keeps the newsletter.

An issue reaches readers only through a send (`src/server/newsletter/sends.ts`), which an admin takes in Settings in
three steps. Prepare finds the group's readers, draws the issue once per language with each reader's unsubscribe token
left as a slot, checks that every link and picture loads from the site and that the email fits under Gmail's clip,
and writes an outbox row per reader; it sends nothing. Arm takes the prepared count typed back and a start between 15
minutes and 7 days away. From the start, the minute job sends at most 50 emails a minute while the newsletter flag is
on, and pauses itself on Resend's refusals, errors in a row, failures past 2% or 5,000 emails in a day. The outbox's key
(issue, account) and a Resend idempotency key per email keep any reader from getting an issue twice. Only production at
grabient.com sends to readers: every other deploy, staging with its copy of production's accounts among them, sends
only to admins and Resend's test addresses (`send.ts`, `reachesReaders`).

The zone's Zaraz has its auto-inject, its single-page support and its own consent modal off, and no tool without a
purpose, and the zone's Web Analytics is not set up automatically (its beacon would run before any choice): the page
loads `/cdn-cgi/zaraz/i.js` itself once Analytics is allowed and the reader has pressed something, tells Zaraz each
purpose and Google's consent mode, and sends each page's view. `vite dev` places requests where this machine is, so the
browser tests start as a reader who has answered, all off, except the banner's own (`e2e/consent.spec.ts`).

## Scheduled work

`src/server/jobs.ts` has one function per trigger in `cloudflare.config.ts`. A feature adds its step to the job, in
the order the job needs; a failed step is logged, the rest run, and the run fails at the end.

## Errors

A failure is logged as the error itself, `console.error(error)`: Workers Issues groups errors by their name and message
alone, and reads a logged error's stack as source from the maps each deploy uploads (`environments.ssr.build.sourcemap`
in `vite.config.ts`; the browser's build makes none). Pages report their errors to `/api/client-error`
(`src/app/error-report.ts`), which logs each as an error named for the browser, its type and the script it was thrown
in, so one error is one issue on every page, browser and deploy (`src/server/client-errors`). Nothing logged names a
reader. Every answer of 500 or more is counted except a refusal a flag makes on purpose, which names the flag in
`X-Grabient-Paused`. The ten-minute job emails the site's address when the last ten minutes hold ten of them or 25
browser errors, at most once a day for each (`src/server/alerts/alerts.ts`).

## The MCP directories

Claude's and OpenAI's directories and the MCP Registry list the server at https://grabient.com/mcp. The registry reads
`server.json` at the repository's root (`mcp-publisher validate`, then `publish`), which says what `serverInfo` in
`src/server/mcp/info.ts` says; OpenAI takes the package `node scripts/plugin-package.ts` writes to `.data/`. The registry
and OpenAI each check the domain with a token set as a secret on the day, `MCP_REGISTRY_AUTH` and
`OPENAI_APPS_CHALLENGE`, served under `/.well-known/` (`src/server/mcp/directories.ts`). Reviewers sign in with the
password of the one account `REVIEWER_EMAIL` names (`packages/server/src/auth`), its tries capped by the rate limits.
Leave `TURNSTILE_SECRET_KEY` unset until the password page carries Turnstile's widget: with the secret set, the server
asks for an answer the page never sends, and every reviewer's sign-in is refused. Every tool keeps a title and its four hints, and its words say what it does
(`src/server/mcp/tools.test.ts`).

## Staging's data

grabient-staging holds a snapshot of production, made by `scripts/data`: `read.ts` reads production, grabient-lite and
grabient-staging into `.data` (ignored by git, since it holds production's accounts), `build.ts` builds production as the
cutover will leave it and then staging's copy, and `load.ts --replace` writes that copy to grabient-staging, the one
database it writes. Anyone may sign in on staging, so the copy (`staging.ts`) holds what every reader sees and, whole,
the admins, the personas and the accounts the site's work names; no other account, session or token. `verify.ts` checks
each copy.

The admins keep working on staging, and the build carries that work since staging's load (`staging-work.ts`): likes and
unlikes, their own collections and Grabient's ones they curated, notes, fit votes and the newsletter's leads, each by
the later change against grabient-lite and production. Its report names the conflicts and what stays on staging. A
change an admin makes on staging while `read.ts` reads it stops the build: read staging again once nobody works there. A
copy whose build carried any of it is loaded only after the cutover: loaded, the work would become part of staging's
copy, where the cutover's build could no longer tell it apart.

## Checks

Unit tests sit beside the code (`*.test.ts`). `pnpm e2e` runs the Playwright smoke tests against `vite dev` on a free
port, and the ones tagged @served, which meet the service worker, against the staging build `vite preview` serves on
another.

`pnpm budget` reads a build and fails when a page's start JS, the stylesheet, the largest chunk loaded on demand, the
session recorder, the precise color names or the Worker (all of it, what an isolate's start loads, and what the first
request through Start adds) is over its budget in `scripts/budget.ts`. `ci:build` and `deploy:production` run it after
their build, so a deploy over budget stops before it deploys. A change that needs more raises the budget in the same
commit and says why.
