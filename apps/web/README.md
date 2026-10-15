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
edge cache (`src/server/edge-cache.ts`). Every answer then gets the security headers, `X-Robots-Tag` outside
production, CORS on public files and `Server-Timing: build`. Any status but 200 and 304 is `no-store`.

The edge cache keeps a GET's 200 that has a positive `CDN-Cache-Control` max-age, no `private` or `no-store`, no
`Set-Cookie` and no `Vary`, under its path in its language, the query that decides it and the build
(`src/server/cache-keys.ts`). A page that renders an error answers 500, which nothing keeps.

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
water, the header with the wordmark and its corner, the keys, the toast line and the embed notice. It stays mounted as
pages change. A route says how it is framed in its `staticData` (`src/app/shell.ts`): `frame` (`app`, `brand` or
`sheet`), `corner` (the tools before the theme button: a list's `ListAppearance`, the editor's own), `still` and
`moving` (the water under reduced motion), `translated` (the language menu lets crawlers follow) and `strip`. Its loader
may return `paint`, the palettes the bar and the water show from the first render on both sides. A page whose palettes
change as the reader works hands them in with `useContext(ShellContext).paint(() => palettes)`, and its own keys with
`.keys(() => bindings)`, each for as long as it is mounted.

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

## Scheduled work

`src/server/jobs.ts` has one function per trigger in `cloudflare.config.ts`. A feature adds its step to the job, in
the order the job needs; a failed step is logged, the rest run, and the run fails at the end.

## The MCP directories

Claude's and OpenAI's directories and the MCP Registry list the server at https://grabient.com/mcp. The registry reads
`server.json` at the repository's root (`mcp-publisher validate`, then `publish`), which says what `serverInfo` in
`src/server/mcp/info.ts` says; OpenAI takes the package `node scripts/plugin-package.ts` writes to `.data/`. The registry
and OpenAI each check the domain with a token set as a secret on the day, `MCP_REGISTRY_AUTH` and
`OPENAI_APPS_CHALLENGE`, served under `/.well-known/` (`src/server/mcp/directories.ts`). Reviewers sign in with the
password of the one account `REVIEWER_EMAIL` names, behind Turnstile where `TURNSTILE_SECRET_KEY` is set
(`packages/server/src/auth`). Every tool keeps a title and its four hints, and its words say what it does
(`src/server/mcp/tools.test.ts`).

## Staging's data

grabient-staging holds a snapshot of production, made by `scripts/data`: `read.ts` reads production and grabient-lite
into `.data` (ignored by git, since it holds production's accounts), `build.ts` builds production as the cutover will
leave it and then staging's copy, and `load.ts --replace` writes that copy to grabient-staging, the one database it
writes. Anyone may sign in on staging, so the copy (`staging.ts`) holds what every reader sees and, whole, the admins,
the personas and the accounts the site's work names; no other account, session or token. `verify.ts` checks each copy.

## Checks

Unit tests sit beside the code (`*.test.ts`). `pnpm e2e` runs the Playwright smoke tests against `vite dev` on a free
port, and the ones tagged @served, which meet the service worker, against the staging build `vite preview` serves on
another.

`pnpm budget` reads a build and fails when a page's start JS, the stylesheet, the largest chunk loaded on demand, the
session recorder, the precise color names or the Worker (all of it, what an isolate's start loads, and what the first
request through Start adds) is over its budget in `scripts/budget.ts`. `ci:build` and `deploy:production` run it after
their build, so a deploy over budget stops before it deploys. A change that needs more raises the budget in the same
commit and says why.
