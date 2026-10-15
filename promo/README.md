# Promo kit

Grabient's promo videos and GIFs, made from the real site rather than mock-ups. A promo:

1. **captures** the site frame by frame, driven by a script;
2. **draws** the site's own water and wordmark behind those frames;
3. **composes** the result in [Remotion](https://www.remotion.dev);
4. **encodes** MP4s for social posts and GIFs for the newsletter.

The code lives here, in git. The frames, builds and finished files are too big for git (the collections promo holds
about 30 GB). They go in a work folder outside it, one per promo: `$PROMO_WORK/<promo>`, by default
`~/.cache/grabient-promo/<promo>`.

This folder isn't part of the app's pnpm workspace, and the app's Biome check skips it. Nothing here touches the site's
build, tests or deploys.

## What's here

```
promo/
  setup.sh          readies a machine: packages, Python's, Chrome 152, gifski, the emoji font
  env.sh            the environment every script sources (paths, browsers, tools); env.local.sh overrides it
  new.sh            starts a new promo from the collections one
  package.json      Remotion, React and playwright-core, installed here on their own (setup.sh)
  kit/              shared by every promo
    capture/mock.mjs     signs a capture in as a mocked account and answers its writes in the browser
    harness/             the site's water (packages/ui/src/flow.ts) and wordmark (Logo.tsx), a frame at a time
    build-harness.sh     builds the harness against this checkout
    serve-site.sh        serves a checkout of the site for captures, on 127.0.0.1:25340
    tools/               dissolve.py (the loop's seam), gifloop.py (a GIF that loops seamlessly), seam.py
                         (measures the seam), sheets.py and contact_sheet.py (contact sheets), gif_*.py (GIF checks)
    fonts/               the captures' fonts (fonts.conf: Inter for the system stack, Noto Color Emoji)
  collections/      the collections launch promo (October 2026), the worked example
```

## Setup, once per machine

```bash
pnpm install          # at the repository's root: the harness builds against the site's own packages
promo/setup.sh
```

You need Node 22.6 or later, pnpm, Python 3 and cargo; setup.sh installs the rest. If this machine needs anything
more, put it in `promo/env.local.sh`, which git ignores. For example: another Node on `PATH`, the libraries Chrome
lacks on WSL in `LD_LIBRARY_PATH`, or browsers kept elsewhere in `CHROME_PATH` and `HEADLESS_SHELL`.

## How a promo is made

1. **Capture the page.** `kit/serve-site.sh <worktree> [database.sqlite]` builds the site and serves it on port
   25340, with the data you give it. The promo's `capture/capture.mjs` drives it with Playwright:
   - Playwright's fake clock steps one frame (1/30 s) at a time;
   - the page is transparent and signed in as a mocked account;
   - the output is `frames/ui-<theme>/f*.png` and `frames.json`, which records the pointer, its presses, the places the
     camera follows and the palettes on the page.

   Captures are deterministic: two runs give the same frames.
2. **Plan.** The promo's `timeline.mjs` reads `frames.json` and writes `data/timeline.json`. That is every frame of the
   loop: the camera, which capture frame shows, what the wordmark's bar is painted with, the pointer and the words.
3. **Water and wordmark.** `kit/harness/render.mjs` draws the site's real water and wordmark for each frame of the
   timeline, into `frames/water-<theme>/`: `w*.png` (the water), `m*.png` (the wordmark) and `meta.json`.
4. **Compose.** The promo's `remotion/` stacks water, page, wordmark, pointer and words as the timeline says, and renders
   PNG sequences. `remotion/sync-data.sh` hands it the data.
5. **Encode.**
   - MP4: x264, in standard HD color, tuned for the water's grain, with the end card's hold at one quality.
   - GIF: gifski through `kit/tools/gifloop.py`, so it loops without a jump.
   - Checks: `kit/tools/seam.py` measures each loop's seam, and `kit/tools/sheets.py` draws a sheet of key frames.

Each promo's `render.sh` runs steps 4 and 5; with `--frames`, it runs steps 1 to 3 first.

## Making a new promo

```bash
promo/new.sh <name>        # copies collections/ without its data, aimed at $PROMO_WORK/<name>
```

Its README lists what to change: the capture's flow, the timeline, the words and the palettes. Before any long render,
render stills of the hard moments and agree on the sequence from those; only then run the full render:

```bash
source promo/env.sh && cd promo/<name>/remotion
"$REMOTION" still <Composition> out.png --frame=<n>
```

## Previewing

```bash
source promo/env.sh && cd promo/collections/remotion
./sync-data.sh "$PROMO_WORK/collections/frames" "$PROMO_WORK/collections/data/timeline.json"
"$REMOTION" studio
```

## Lessons from the collections promo

- **Higher resolutions:** the site's water never draws finer than 2× (its canvas caps the device pixel ratio). So a
  larger video re-captures only the page at a higher ratio and redraws only the wordmark (`render.mjs --marks-only`),
  and keeps the 2× water. See `collections/render-hd.sh`.
- **Linked frames:** Remotion's file server follows no symlink out of its `public/` folder, so frames it must read
  through a link go in as hard links.
- **Long renders:** a water run takes about 50 minutes at 2× on Chrome's software GL. Run two at a time, not more.
- **Newsletter:** use GIF. Video plays in few mail apps, and animated WebP and APNG fail in Gmail or Outlook. Older
  desktop Outlook shows only the first frame, so start the loop on a frame that says everything (the end card).
- **The words:** they stand on the scene's own clean surface, never on a scrim, gradient or box.
