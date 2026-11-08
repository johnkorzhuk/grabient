# The field-effect kit

A field effect is one file: a smooth field over the plane (its kernel), a seeded design, and a recipe for drawing the
field's levels as a stack of sheets with shadows, rims and lines. The kit draws that file in every form the site
has: the CPU's PNG files and link cards (render.ts), the still and any frame as an SVG of filled paths (svg.ts),
the player and the shader pages in GLSL and WGSL (gl.ts, wgsl.ts, page.ts, webgl.ts, webgpu.ts, shader.ts,
packages/ui kit-player.ts), the clips in C (video/video.c, from kit-kernels.c), and the embed script (apps/web
embed/kit.ts). An effect's author writes none of those. It has no Copy for Figma: its levels change shape as it
moves, which no layer on Figma's timeline can, so a paste could only be its still, and its SVG is that (John, 8 Nov
2026: "we can just drop it and they can use svg"). The zen garden and the sandstone
(8 Nov 2026) are the site's; `fields/demo.ts` is the kit's own example, which its tests draw in every format and a new
effect starts from.

## An effect's file (`fields/<kind>.ts`, types.ts FieldEffect)

- `kind`: its name in the address (`style=`), lower case letters.
- `about`: what the site says of it in English (link previews, the Markdown's lead, the shader credit).
- `loop` (seconds at speed 1), `span` (D over the box's longer side; 0.75 as the papercut's), `designedSeed` (the seed
  shape 0 draws: pick it from a run of seeds and say why in a comment).
- `uniforms` and `tracks`: the kernel's constant lists and how many phases a frame sets; `design(seed)` draws them
  with `kitRng`, every number through `kitRound`.
- `field`: the kernel, `(x, y, U, F) => number`, in the subset compile.ts's header lists. A phase `F[i]` reaches only
  `Math.sin` or `Math.cos`. Its cost (compile.ts's count) is at most 160.
- `ground`, `sheets`, `lines`: the recipe. Sheet k covers the field above `base + k * step` (finite `count`, or
  periodic where it is null); each casts a shadow (`distance` toward `angle`, `alpha`; soft with `steps` and `spread`;
  ink, or the sheet below darkened with `tint: "below"`) and shows a rim toward the light (white, or its own color lit
  with `tint: "own"`); lines are bands within `half` of their levels. ColorMap picks each level's palette color.
- `steps` (optional, types.ts KitSteps): `{ least, most, designed }`, the view's steps the effect takes as its levels'
  density (the Appearance menu's Steps field, `steps=` in its address, as a gradient's style takes them; the
  sandstone's 8 to 40, 28 as designed, 8 Nov 2026). At n steps every level comes n / designed times as close and each
  level's color steps designed / n times as far (the sheets' and lines' `step` and each map's `hop`, a soft shadow's
  spread with them), so the palette's sweep across a box stays and only the bands narrow or widen; at the designed
  steps every number is the recipe's. Give it to a stack that runs on (`count: null`) or to lines: a counted stack's
  top falls as its levels close (kit-check's check 2 refuses it). kit:gen writes every effect's into
  `gen/kind-steps.ts`, which engine/effect.ts's EFFECT_KINDS reads, and the app keeps it in the effect's look (its
  `steps`, none at the designed number), so every page's start knows it without a definition.

Every number a format reads comes from `kitScene` and `kitFrameAt` (scene.ts): the levels' steps and hops too
(`sheetStep`, `sheetHop`, `lineStep`, `lineHop`, as the view's steps space them), never the recipe's; every pixel is
`kitShade` (shade.ts), which the GLSL, WGSL and C follow branch for branch; every channel becomes a byte as `kitByte`
does. Read those three files before changing a format. The passes write an effect's levels as constants, but for one
that takes steps, whose `uLevels` (WGSL `S.levels`) the scene sets (gl.ts KIT_LEVELS, kitLevels), so a Steps field
dragged redraws the player with no shader compiled anew, and every other effect's pass and pixels stay as they were.

## What every format relies on

- **A finite kernel** wherever a box shows it, at any shape and time (fields.test.ts holds every registered effect):
  guard 1/r, log r and square roots of differences.
- **Levels a pixel apart or more at 320 by 180**, on all but 0.2% of a frame (test/kit-checks.ts kitCrowding,
  measured there whatever size a frame is drawn at). The CPU and the shaders draw the four levels past the one covering
  a pixel; the SVG draws them all, so crowded levels are where the formats part (kit-look.ts says "crowded", kit-check
  fails it).
- **A still under 40 KiB** as a CSS background at the design square: 12 to 30 levels with smooth contours. Hundreds of
  islands will not fit.
- **Whole cycles**: every track's `cycles` is whole, so the loop's last frame is its first. Frames at t and t + loop/2
  must differ (the conformance suite's "moves"): a track with an odd cycle count, or two tracks, break the symmetry.
- **Exact numbers**: design numbers rounded by kitRound, so the TypeScript, the GLSL, the WGSL and the C read the same.

## Tools

All after `source ~/.cache/grabient-final-work/tools/env.sh`, from the repository's root.

- `node packages/engine/test/kit-look.ts def=<file> seeds=vivid,pastel,dark shapes=0,7,417 out=look.png`: a montage of
  CPU frames; `strip=8` for one loop in eight frames; `clip=motion.mp4` for one loop at 4x. Look at every montage.
- `node packages/engine/test/kit-check.ts def=<file>`: the gate a candidate passes before anyone looks at it, every
  check below with its numbers, a line each, exit 1 on any failure; `palettes=all` draws the frames and stills in all
  seven palettes of `test/kit-checks.ts` (vivid, pastel and dark unless said); `json=<path>` writes the numbers for the
  gallery. 20 to 40 seconds a candidate.
- `pnpm kit:gen`: compiles every registered kernel into `gen/<kind>.ts` (GLSL, WGSL, cost), `gen/kernel-order.ts` and
  `video/kit-kernels.c`, and writes `gen/drawings.ts`, each effect's drawing (a hash of its file, scene.ts, shade.ts,
  render.ts and its kernel's C), which names the cards, pictures and clips the Worker keeps of it, so a file replaced
  or a change to the kit's drawing keeps none drawn before, and `gen/kind-steps.ts`, each effect's steps. A test
  fails while any is stale. Vitest's module cache never keeps kernels.ts (nor any module with a template's dynamic
  import: packages/engine/scripts/vitest-cache.ts), so a new kind's `gen/<kind>.ts` is found by the next run, in this
  checkout or any it reaches by a pull, with no cache to clear. After it, rebuild the
  clips' module (`ZIG=~/.local/zig/zig sh packages/engine/src/video/build.sh`), which writes its hash into
  VIDEO_MODULE in packages/engine/src/video.ts; the container's image then needs pushing (`pnpm --filter web
  video:image`, the owner's: crane and the registry's credentials).
- `node packages/engine/test/kit-weight.ts kind=<kind>`: a clip's measured weight against the glass's, once the
  clips' module holds the kernel. Run it three or four times on a quiet machine (`uptime` under 1) and write the most,
  rounded up, as the file's `clipWeight: { weight, cost }` with the kernel's cost (types.ts), which the clips then take
  over kitVideoWeight's estimate (kit-check's check 9 says which it printed), until the kernel's cost changes
  (video.test.ts says when to measure again). It measures an effect that takes steps at its designed steps;
  `steps=<n>` measures it at others (the sandstone's 8 and 40 weigh as its 28 do, 8 Nov 2026).

## The checks (kit-check.ts and the suites)

| Check | Limit | Where it is held |
| --- | --- | --- |
| kernel compiles, cost | at most 160 | compile.test.ts, kit-check |
| finite everywhere a box shows, turned to any angle, its shadow's and rim's points with it | every sample | fields.test.ts, kit-check |
| frame SVG against the CPU | OKLab mean < 1.5, p99 < 8, far < 0.6% | effect-conformance.test.ts, svg.test.ts |
| still's CSS at the design square | 40 KiB | effect-conformance.test.ts |
| the loop ends on its first frame | the step over its end (1/60 s) at most twice the steps beside it; whole cycles | kit-check (checks 4 and 2) |
| it moves | 12 distinct frames, 0.13 of a loop on past the frame limits | effect-conformance.test.ts (CONFORMANCE=deep), kit-check |
| levels crowding at 320 by 180 | 0.2% of pixels | kit-look, kit-check (an effect with steps at its most too) |
| an effect with steps: the moves at its fewest steps, the still's bytes and its first frame at its most | as above | kit-check (checks 5, 7, 8), effect-conformance.test.ts (frames and still at both ends), scene.test.ts, svg.test.ts, shader.test.ts, video.test.ts |
| a card's pixels drawn on the CPU | 1.5 times the demo's, drawn in turn (about 1 s a card coded, the Worker's 3 s on machines three times slower) | kit-check (check 9) |
| the still traced, and a list's first screen of 16 stills | reported, no limit (the strings' screen about 1.1 s) | kit-check (check 7) |
| the player's first frame against the CPU | e2e:gpu's limits | apps/web e2e/effect-gpu.spec.ts |
| the WebGPU page's first frame against the WebGL page's, no WebGPU validation error | e2e:gpu's limits | apps/web e2e/effect-gpu.spec.ts |
| clips' frames against the CPU | byte for byte | video.test.ts |

## From a candidate to a site effect

1. The candidate passes `kit-check.ts` and has been chosen.
2. `pnpm kit:add <file> label="Zen garden" words="zen garden"` copies it to `fields/<kind>.ts` (imports relative),
   adds its kind to kinds.ts, its line to registry.ts, its two names to names.ts, its embed entry
   (apps/web/src/embed/<kind>.ts), and runs `pnpm kit:gen`. Run it again with a newer file to replace one: kit:gen
   then gives it a new drawing (gen/drawings.ts), so nothing kept of the old file is answered for it. The file needs
   its `about` (types.ts FieldAbout); a `label` and `words` there stand for the arguments. It refuses, writing
   nothing, a kernel that does not compile or costs past 160, and a new kind whose name a file holds already (the
   embed's own grain.ts or mount.ts, say). The app's tests that hold every effect take the field effects from the kit
   (kinds.ts, names.ts, registry.ts), so none of them is edited for a new kind: a page's title
   (apps/web/src/lib/page-meta.test.ts), the strips' formats (apps/web/src/features/editor/formats.test.ts), the
   clips' address (apps/web/src/server/images/video.test.ts, which draws the new kind's clip once step 6 has rebuilt the
   clips' module) and the examples page's hero (apps/web/e2e/examples.spec.ts finds a seed for each kind).
3. Its names in every language: `pnpm i18n extract`; a translator's note for each of the two new messages in
   packages/i18n/messages/en.json (what it is, where it shows, what it must not be confused with: no check reads the
   notes, so none fails without one); each of the 15 languages' translations through `pnpm i18n merge <tag> <file>`;
   and a row in each of the 15 packages/i18n/glossary/<tag>.md, after its last effect's row and in its table's shape
   (ja's effect table has two columns, the others three, their third English). The Shader tab says what an effect's
   passes draw from its recipe (apps/web features/editor/effect-sources.ts kitPasses): sheets and lines, or plain
   sheets with neither shadow nor rim. A recipe neither says (lines alone, or sheets alone with a shadow or a rim) takes
   a note of its own there, a third new message, and code.test.ts fails until it has one.
4. Its example page: its entry in `PAGE_OF` in apps/web/scripts/examples-kit.ts (a palette picked by looking at the
   effect in it, its query, its tab's title, its heading "This page sits on " and the effect's words with their article
   and a full stop, "This page sits on a zen garden.", and its lead; `pnpm typecheck` names a kind with none), then
   `pnpm --filter web examples:kit`.
5. The words: `pnpm vitest run apps/web/src/server/seo/agents.test.ts -u` rewrites the llms texts' fixtures (`-u`
   last: it takes a value, and before the file it takes the file's name and updates every test's snapshots); the MCP's
   skill, skills/grabient/SKILL.md, is written by hand: the new kind's words in the sentence that plays an effect
   behind a page, a sentence of its own (`style=<kind>`, what it is, what its `.svg` is) beside the other field
   effects', and `<kind>` in the list's styles (agents.test.ts names a kind it leaves out). Then search for any other
   hand list of effects, by an effect's kind: `grep -rnw zen apps packages skills --exclude-dir=fixtures
   --exclude-dir=node_modules` (`-w`: the skill writes kinds in backticks, which a search for `"zen"` misses).
6. The clips' module (Tools above: build.sh writes VIDEO_MODULE), its clips' weight (kit-weight.ts, Tools above,
   written as `clipWeight`), and its gate for the gallery, which shows a built effect's gate from this file:
   `node packages/engine/test/kit-check.ts def=packages/engine/src/kit/fields/<kind>.ts palettes=all
   json=~/.cache/grabient-final-work/kit/checks/site-<kind>.json`. Then every check:
   - `pnpm check` on Node 24 (apps/web/container/image.test.ts stays red until the owner pushes the image, `pnpm
     --filter web video:image`);
   - `CONFORMANCE=deep pnpm vitest run --project unit packages/engine/src/effect-conformance.test.ts -t "the <kind>"`
     (its 12 tests, 14 for an effect that takes steps, which it draws at both ends of their range, about 10 s; without
     `-t`, every effect's in about 2 minutes);
   - `pnpm --filter web e2e:gpu`;
   - `E2E_SERVED=off pnpm --filter web e2e -g "vector|embed|video|examples"` (none of those specs has a served test;
     `E2E_SERVED=off` leaves out the served build, which can't start on a machine without the Cloudflare token the
     container's image is pulled with);
   - `pnpm i18n check --strict`;
   - `pnpm build && pnpm --filter web budget`. Each field effect adds 0.8 to 1.3 KB to the MP4 worker (27.5 of 31
     with two), 0.9 to 1.5 KiB to the Worker's modules (1479.4 of 1483) and 0.8 to 1.3 KB to a palette's examples
     page's start (296.8 of 302), by its file's size (8 Nov 2026), its definition loaded with the others
     (kit/registry.ts), so expect to raise the first two with promotions, each with its dated reason beside it.

## Costs (8 Nov 2026)

- CPU: kitRender 240 to 650 ns a pixel at 480 by 270 (the sandstone to the zen garden): a 1200 by 630 card 0.21 to
  0.46 s, coded, and 0.36 to 0.65 s soft and grained; a picture is drawn within a card's pixels (apps/web
  lib/picture-size.ts KIT_PICTURE_BOUNDS), so a PNG asked at 1920 by 1080 comes at 1159 by 652, where the other
  effects' come whole up to 2,400 a side and 3 million pixels.
- Stills: 11 to 29 KiB at the design square over 30 shapes and four angles each (the sandstone's 16 to 23 at its 40
  steps), traced in 27 to 51 ms (35 to 71); a list's first screen, 16 stills the server traces, 0.6 s (zen) to 0.7 to
  0.9 s (strata), the strings' 1.1 s, the papercut's 0.2.
- Clips: the zen garden's kernel read three times a pixel (the pixel, the shadow's point, the rim's), the sandstone's
  once; measured weights 41 and 22 against the strings' 17, where kitVideoWeight's estimate gives 73.8 and 28.6. Each
  shadow or rim a recipe leaves out saves a kernel read in the CPU and the clips. The Worker draws a clip within its
  work (VIDEO_LIMITS, 1.6e9), which at those weights is a thumbnail: at its defaults (60 frames a second, the loop up
  to 60 s) the zen garden's comes at 142 by 74 and the sandstone's 196 by 102 (the rosette's 726 by 380, the strings'
  222 by 116), at 30 frames a second 202 by 106 and 276 by 144, and asking 1920 by 1080 changes nothing; the editor's
  Download MP4 is the same clip, drawn in the reader's browser. Only staging's container draws them whole (up to 3840
  by 2160). Coded at the glass's quantizer: the zen garden 0.43 to 0.54 Mbit/s at 640 by 360 (42.1 to 43.2 dB), the
  sandstone 0.14 to 0.21 (47.5 to 49.4), where the strings' threads cost 5.7 to 9.0 (video.ts VIDEO_QUALITY).
- GPU (RTX 2080 Ti, 3840 by 2160): 0.35 to 0.56 ms a frame (the sandstone) to 0.74 to 1.09 (the zen garden) (gl.ts).
- Embed scripts: about 21 KiB gzipped each (the sandstone's 20.6, the zen garden's 21.6).

## What looked good (round one, 8 Nov 2026)

Twelve directions were tried and three built, of which the site keeps the zen garden (the sandstone came of later
rounds). What the critiques kept finding:
- Ink shadows muddy pastel and dark palettes: shadows in the color of the sheet below (`tint: "below"`) keep them
  clean; rims in the sheet's own color lit (`tint: "own"`) read as material where white rims read as plastic.
- A face that is one flat level reads as a tile or vector clip-art; a material needs a crown (a raised sheet in the
  same color) or a soft shadow across it.
- Even rings read as a contour map; a rhythm (one bold ring, two hairlines) reads as a craft.
- The palette's far end set against the near ground makes the most saturated spot the subject, not the palette.
- Motion read as alive only where a phase visibly breathes over 15 to 20 s while large shapes hold.
