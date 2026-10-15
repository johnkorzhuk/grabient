# Grabient

Grabient is a color palette editor and gallery, at [grabient.com](https://grabient.com). A palette is 2 to 8 keyframes
in OKLCH, and the short seed in its address holds the whole palette.

## What it does

- An editor for the keyframes: plots of lightness, chroma and hue to drag them on, locks, undo and keyboard shortcuts.
- Six styles: linear, radial and angular, each as a gradient or as swatches, at the steps and angle you choose.
- Every form a palette is written as: CSS, SVG, PNG, JPEG, JSON and Markdown at its own address, swatch files for
  design tools (ASE, GPL, GRD and design tokens), and GLSL, WGSL and Shadertoy shaders.
- A gallery of palettes and collections, searched by color, mood, any words or a picture. An account keeps its likes
  and its own collections, and keeps working offline.
- Sixteen languages, among them Arabic and Persian, which read right to left.
- For AI agents: `llms.txt`, a Markdown version of every palette and collection, and an MCP server with an app view.
- A monthly newsletter.

## Run it

You need Node 24 or later and pnpm 10.34.6. On Node 24 `corepack enable` provides pnpm; Node 25 ships without
Corepack, so there run `npm install -g pnpm@10.34.6`. No Cloudflare account is needed to run Grabient on your machine.

```sh
git clone https://github.com/johnkorzhuk/grabient.git
cd grabient
pnpm install
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm db:setup   # every migration and the gallery's palettes, in the local databases
pnpm dev        # the site and its Worker under vite dev, every binding on this machine
```

Then open the address Vite prints. `vite dev` runs the Worker in workerd with D1, R2, KV and the Durable Object kept
under `apps/web/.cloudflare/state`. A search for words the vocabulary doesn't know needs Workers AI, and Google
sign-in and the newsletter need keys of their own, so those parts answer only on a deploy. [apps/web/README.md](apps/web/README.md) covers how the site answers a
request, its pages and routes, the offline copy and the scheduled work.

## Checks

```sh
pnpm check        # typecheck every workspace, lint (Biome) and the unit tests (Vitest)
pnpm e2e          # the Playwright tests, against vite dev on a free port
pnpm i18n check   # the English messages against the code, and every translation against its English
```

A deploy runs `pnpm check`, the build and the size budgets (`apps/web/scripts/budget.ts`) before it deploys.

## Layout

| Path | What's there |
| --- | --- |
| `apps/web` | The site: TanStack Start on Solid 2 and one Cloudflare Worker (`src/server.ts`, `src/server/`), its static files, scripts and Playwright tests |
| `apps/design` | The design document: the brand, the foundations and the key components (`pnpm dev:design`) |
| `packages/engine` | Palette math, the seed codec, edits, old links and every form a palette is written as |
| `packages/ui` | The design system: tokens, the base stylesheet and the Solid components |
| `packages/i18n` | The sixteen languages: the runtime, the messages and the translators' tools |
| `packages/search` | Search as vectors: palette features, the model's arithmetic and its training |
| `packages/server` | What every Worker on the database shares: the D1 helpers and migrations, sign-in and rate limits |
| `packages/email` | The emails the site sends and the parts a newsletter is built from, as HTML and plain text |
| `skills/grabient` | The skill the MCP server gives an AI app: what a palette is and which tool does what |

Each package's README covers that package.

## Deploy

Grabient runs as one Cloudflare Worker with D1, R2, KV and a Durable Object, and Workers AI for search. Its CPU and
subrequest limits need the Workers Paid plan. `apps/web/cloudflare.config.ts` names each deploy's Worker, hosts and
resources; put your own there, upload the secrets it declares, and `pnpm deploy:staging` builds and deploys with
[cf](https://developers.cloudflare.com/cf/).

## License and credits

Grabient is licensed under the [Apache License 2.0](LICENSE), which doesn't let you use the Grabient name or logo for
your own site or product. Some files are other people's work and keep their own licenses; [NOTICE](NOTICE) lists each
with its copyright and license text:

- the Poppins typeface (SIL Open Font License 1.1, in `OFL.txt` beside the fonts)
- icon paths from Lucide and Feather (ISC and MIT)
- flag drawings from country-flag-icons (MIT)
- a decoder from lz-string (MIT)
- Björn Ottosson's Oklab and Okhsv conversions (MIT)
- color names from meodai's Color Names (MIT)
- the XKCD color survey's answers as Stanford's c3 holds them (BSD 3-Clause)
- emoji keywords from Unicode CLDR (Unicode License v3)

The site serves the licenses of the packages its browser code bundles, followed by NOTICE, at `/licenses.md`. Search
also learned the color names of the XKCD color survey (CC0), and it reads text through the EmbeddingGemma and BGE-M3
models on Workers AI; neither model is in this repository. Old grabient.com links hold Inigo Quilez's cosine palettes,
which `packages/engine/src/legacy.ts` still reads.
