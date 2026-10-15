# Collections promo

The collections launch loop (October 2026). It ships as:
- the October newsletter's GIF (`apps/web/public/email/collections-4.gif`, from `email-1.gif`);
- the tweets `tweet-1.mp4` and `tweet-1-light.mp4`, and their 1080p versions.

Its frames, builds and finished files are in `$PROMO_WORK/collections`: `frames/`, `frames-hd/`, `data/`, `build/`,
`out/` and `logs/`.

## The loop

1. The end card: Grabient's wordmark large over the site's water, the words under it ("New on Grabient" over
   "Collect the palettes you love").
2. The words go. The list comes in below the wordmark, the bar turns to the list's first palette, and the page pulls
   back.
3. The demo, on one card: a like, then the plus, Add to collection, and two collections checked.
4. One camera move back out to the end card. As it pulls back, the rest of the page fades, the letters appear, and the
   card's picture narrows into the wordmark's bar.
5. The words arrive, and the end card holds. Frame 0 is the end card, so the loop comes round seamlessly.

Step 4 is one move, as specified: the camera draws back, and the fade, the letters and the morph into the bar happen
together. An earlier cut flew the picture across the page into the header's wordmark, and was rejected. A change to the
sequence starts from stills of the moments it touches, agreed before any full render.

## Files

- `capture/capture.mjs`: the scripted demo on the real site.
- `capture/collections.mjs`: the mocked account's collections.
- `capture/simplify.css`: what the captured page leaves out (its ground, its header's drawing, the list's chrome).
- `timeline.mjs`: the plan, written to `data/timeline.json` in the work folder. It holds the parts' lengths (`P`), the
  end card's hang, the demo's speed, the newsletter's faster cut (`EMAIL`) and the pull back (`morph`).
- `data/page.json`: the hero palette and the page's palettes, for the wordmark's bar.
- `remotion/`: the composition (`src/Promo.tsx`) and the six copy options (`src/copy.ts`). Option 1 ships.
- `render.sh`: the 720p tweets, the GIFs, the end cards, the seam checks and the loop sheet.
- `render-hd.sh`: the 1080p tweets.
- `grid/`: a one-off. It picked the two cards replaced on Popular's first page so the grid reads well. `replace.sql`
  is applied to the capture site's own data copy, never to staging or production.
- `data/determinism.txt`: two independent water runs, the same bytes frame for frame.

## Re-rendering

```bash
./render.sh                 # from the frames in the work folder: about 15 minutes
./render-hd.sh              # the 1080p tweets from frames-hd/: about 10 minutes
```

`--frames` re-captures and redraws first. It takes about two hours, and the site must be served for it:

```bash
source ../env.sh
git worktree add "$PROMO_WORK/site" staging && (cd "$PROMO_WORK/site" && pnpm install)
../kit/serve-site.sh "$PROMO_WORK/site" <copy of the site's data, as SQLite> grid/replace.sql
```

The data copy is a SQLite copy of the site's D1 and stays outside git. The October captures used the copy of the real
data in `~/.cache/grabient-final-work/data/real.sqlite`. `grid/replace.sql` swaps in the two cards.
