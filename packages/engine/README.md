# @grabient/engine

Palette math, the seed codec, edits, old links and every form a palette is written as. Plain TypeScript with no
dependencies and no DOM, Solid, database or Cloudflare imports, so the browser, the Worker and the scripts run the same
code. Import a module by its path (`@grabient/engine/css.ts`); `@grabient/engine` itself holds only the palette, the
codec and the curve.

## The model

A palette is 2 to 8 keyframes (anchors) `{ l, c, h, own? }` in OKLCH: lightness 0 to 1, chroma 0 to 0.35, hue in
unwrapped degrees, so 210 to 570 is one turn clockwise. Adjacent hues differ by at most 540°. The curve is a uniform
Catmull-Rom spline through the anchors on each axis at even t, its ends repeating the end anchor. Where it overshoots,
lightness is clamped to 0..1 and chroma to 0 or more, and the render lowers chroma at constant lightness and hue until
the color fits sRGB, or Display-P3 for a wide screen. The anchors never change to fit a gamut.

A keyframe is held as one of four kinds:

- **Grid**: a code on the OKLCH grid, 255 lightnesses, 255 chromas and hue steps of about a degree.
- **Hex**: an sRGB hex color with a hue of its own, within 1e-7 in OKLab of the color the hex names. A keyframe typed as
  `#0052ff` reads back as `#0052ff`.
- **Gray**: one of the 256 grays, held as its level. Its hue is free.
- **Near gray**: a hex color under chroma 0.01, such as `#f7f7f2`. It carries a hue along the curve as a gray does
  (`h`) and keeps its own tint's hue (`own`), which `sampleLCH` adds as a small curve of its own in OKLab.

Moving a hex, gray or near gray keyframe's lightness or chroma puts it on the grid.

## The seed

`encodePalette` writes `k`, then a bit stream in base64url (`A-Z a-z 0-9 - _`), most significant bit first, zero bits
filling the last character.

Version 1, when every keyframe is on the grid:

| Field | Bits | Values |
| --- | --- | --- |
| version | 2 | 1 |
| K − 2 | 3 | 0 to 6 |
| reserved | 1 | 0 |
| anchor 1: L, C, H | 8, 8, 9 | L 0..1, C 0..0.35, H in 512 steps around the circle |
| anchors 2 to K: L, C, ΔH | 8, 8, 10 | ΔH −540..540 from the anchor before |

A version 1 seed is 11, 15, 20, 24, 28, 33 or 37 characters for 2 to 8 anchors.

Version 0, when a keyframe is a hex color or a gray: the same head with version 0, then each keyframe behind its kind
(2 bits).

| Kind | Bits after the kind | Fields |
| --- | --- | --- |
| 0, grid | 25, then 26 | L, C, and H or ΔH, as in version 1 |
| 1, hex | 24, then 26 | R, G, B. From the second anchor on, a turn (2): 0 the short way from the hue before, 1 a lap more, 2 a lap less |
| 2, gray | 17, then 18 | the level (8), then H (9) or ΔH (10) |
| 3, near gray | 33, then 34 | R, G, B, then the hue it carries: H (9) or ΔH (10) |

A version 0 seed is 9 to 50 characters: 11, 16, 21, 25, 30, 35 and 39 for 2 to 8 hex colors, and 50 for 8 near grays,
the longest seed. Its second character is a capital `A` to `P`, which no word of a collection's or a search's address
is. Every seed fits the 64-byte limit of a Vectorize id, which the search index keys palettes by.

## The codec's rules

- `canonical(P)` is `decodePalette(encodePalette(P))`. It is idempotent and encodes to the same seed. The app holds
  only canonical palettes, so the screen, the address and a reload agree exactly.
- A palette with every keyframe on the grid is written in version 1, bit for bit as before version 0 existed. Black and
  white are grid codes.
- L, C and ΔH use an odd-level quantizer with 2^bits − 2 steps, so both ends of each range, a gray's zero chroma and an
  unchanged hue are exact codes.
- Every hue is shifted by whole turns so the first lands in [0, 360): a palette turned by whole turns is the same seed.
- ΔH is clamped to ±540° as it is written. Version 1 measures each step from the hue before as given, so rounding
  accumulates along the palette. Version 0 measures it from the hue the seed holds for the anchor before, so no
  rounding reaches a hex color's own hue; a hex anchor's turn is the way round nearest the step asked.
- Anchors past 8 are dropped and NaN writes as 0. Fewer than 2 anchors throws.
- `decodePalette` returns null for anything but `k` and base64url, version 2 or 3, more than 8 anchors, a length other
  than the bits need, turn 3, or a gray written as a hex color or a near gray. A set reserved bit or non-zero fill bits
  still decode: that spelling is not canonical, and the app answers it with the canonical seed's address.
- A field never changes width or meaning in place. A change needs a new version value (2 and 3 and the reserved bit are
  free) and a decode branch that reads every earlier seed as before.

## Specs and hex colors

`toSpec` writes the canonical anchors with l and c to three decimals and h to one, and `hex` for a keyframe held as a
color; `fromSpec` reads a written spec back as the seed it came from. `anchorsFromHexes` holds each color as its hex. A
gray or near gray carries the running hue, so black, white or an off-white never adds a lap.

## Old links

Old grabient.com addresses hold `_` seeds, cosine palettes read bit for bit as the original engine read them, or
lz-string ids that grabient.com answered with their `_` form (`legacy.ts`). The migration maps resolve them first
(`legacyTarget`). A link the maps miss is fitted to keyframes (`legacy-import.ts`, the only module that loads the
fitter): by the Worker within a budget of the fit's work, else in the visitor's browser. Both give the same seed.

## Modules

- Color and curve: `color.ts` (sRGB, OKLab, OKLCH, Display-P3, CIELAB, WCAG luminance), `okhsv.ts`, `curve.ts`,
  `math.ts`.
- The palette: `palette.ts` (types and bounds), `codec.ts`, `spec.ts`, `edits.ts`, `random.ts`, `fit.ts`.
- Views and files: `view.ts`, `css.ts`, `svg.ts`, `shader.ts` (its kinds in `shader-kinds.ts`, its WebGL and WebGPU
  pages in `shader-page.ts`, the credit and page every shader shares in `shader-shell.ts`), `swatches.ts`,
  `document.ts`, `markdown.ts`, `zip.ts`.
- The fluted glass's shader code, every kind named in `glass-shader.ts`: the GLSL and its WebGL page (`glass-webgl.ts`,
  the player's own GLSL in `glass-gl.ts`), the WGSL and its WebGPU page (`glass-webgpu.ts` over `glass-wgsl.ts`), the
  pages' design in `glass-page.ts` and their clock in `effect-page.ts`.
- The blob's, every kind named in `blob-shader.ts`: the GLSL and its WebGL page (`blob-webgl.ts`, the player's own GLSL
  in `blob-gl.ts`), the WGSL and its WebGPU page (`blob-webgpu.ts` over `blob-wgsl.ts`), the pages' script in
  `blob-page.ts`, played by the same clock.
- The silk's, every kind named in `silk-shader.ts`: the GLSL and its WebGL page (`silk-webgl.ts`, the player's own GLSL
  in `silk-gl.ts`), the WGSL and its WebGPU page (`silk-webgpu.ts` over `silk-wgsl.ts`), the pages' script in
  `silk-page.ts`, played by the same clock. The rosette's alike: `rosette-shader.ts`, `rosette-webgl.ts` over
  `rosette-gl.ts`, `rosette-webgpu.ts` over `rosette-wgsl.ts`, `rosette-page.ts`.
- The papercut's, every kind named in `papercut-shader.ts`: the GLSL and its WebGL page (`papercut-webgl.ts`, the
  player's two passes in `papercut-gl.ts`), the WGSL and its WebGPU page (`papercut-webgpu.ts` over `papercut-wgsl.ts`),
  the pages' script in `papercut-page.ts`, played by the same clock.
- The strings' (`strings.ts`, its CPU drawing in `strings-render.ts`, its stills and any frame's SVG in
  `strings-svg.ts`), every kind named in `strings-shader.ts`: the GLSL and its WebGL page (`strings-webgl.ts`, the
  player's own pass in `strings-gl.ts`), the WGSL and its WebGPU page (`strings-webgpu.ts` over `strings-wgsl.ts`), the
  pages' script in `strings-page.ts`, played by the same clock. The papercut's and the strings' tracers write their
  curves with `svg-fit.ts`.
- The dimple's (`dimple.ts`, its CPU drawing in `dimple-render.ts`, its still and its picture with the hollow anywhere
  in `dimple-svg.ts`), every kind named in `dimple-shader.ts`: the GLSL and its WebGL page (`dimple-webgl.ts`, the
  player's own pass in `dimple-gl.ts`), the WGSL and its WebGPU page (`dimple-webgpu.ts` over `dimple-wgsl.ts`), the
  pages' script in `dimple-page.ts`. It has no loop (`EFFECT_KINDS`' `motion`), so no clock plays it: its pages'
  hollow follows the pointer by their own script and stays where the pointer left it, as its player's does. It has one
  design and no shape, and takes a zoom in its shape's place (`EFFECT_KINDS`' `zoom`, 1 to 4), which draws its discs
  and its hollow larger. Its address's `roam` has the hollow go round a loop of its own instead of following the
  pointer (`dimpleRoam`, 24 s at speed 1, from its rest and back): the players and the pages then clock it as any
  loop, and Copy for Figma pastes it as layers keyed on Figma's timeline (`figma-dimple.ts`: a disc a mask over a
  strip of the palette that slides and turns).
- The field effects (`kit/`; the sandstone is the site's one): each is one file in `kit/fields/`, its kernel in the
  kernel subset, its seeded design, its recipe of sheets and lines, the range of the view's steps it takes as its
  levels' density where it takes any (the sandstone's 8 to 40, which `kit:gen` writes into `kit/gen/kind-steps.ts` for
  `effect.ts`'s `EFFECT_KINDS`) and what the site says of it, with its kind in `kit/kinds.ts`, its line in
  `kit/registry.ts` and its words in `kit/names.ts`. The rest
  is the kit's, written once for every field effect: the scene and the pixel's shading (`kit/scene.ts`, `kit/shade.ts`),
  the CPU drawing (`kit/render.ts`), the compiler that writes each kernel in GLSL, WGSL and C (`kit/compile.ts`;
  `pnpm kit:gen` writes `kit/gen/` and `video/kit-kernels.c`), the tracer, the stills and any frame's SVG
  (`kit/trace.ts`, `kit/svg.ts`), the player's pass (`kit/gl.ts`, `kit/wgsl.ts`) and the shader pages
  (`kit/shader.ts`, `kit/webgl.ts`, `kit/webgpu.ts`, `kit/page.ts`). A field effect has no Copy for Figma: its levels
  change shape as it moves, which Figma's timeline cannot, so its SVG is what goes into Figma. `kit/fields/demo.ts` is
  the kit's own example, never an effect of the site.
- What each effect hands over in each form, and why where it hands over less: `effect.ts`'s `EFFECT_KINDS`, which
  `effect-conformance.test.ts` holds every effect to. Any frame of a vector effect as an SVG and CSS of its own:
  `fx-still.ts`'s `fxFrameSvg` and `fxFrameCss`.
- The effects' soft and grain in their shader code, as the site lays them over the player (`fx-finish.ts`): the
  pages' finish in `shader-finish.ts` (the soft's grid and blur, the gradient under its edges, the grain's tile), the
  grain a single shader works out itself in `shader-grain.ts`.
- The effects as looping MP4 clips: `video-kinds.ts` (the kinds a clip is drawn of, which loads nothing), `video.ts`
  (a clip's plan, limits and coding, and `videoAt`, the clip an address asks for, which the Worker's /{seed}.mp4 and
  the editor's Download MP4, drawn in the reader's browser, read alike), `video-finish.ts` (a clip's soft and grain),
  `mp4.ts`, and the module that draws and codes the frames, `video/video.wasm` from `video/video.c` (`video/build.sh`).
- What a palette is: `name.ts`, `colorname.ts` over `colornames.data.ts`, `shape.ts`, `dominant.ts`, `contrast.ts`,
  `plot.ts`, `strip.ts`.
- Old links: `legacy.ts`, `legacy-import.ts`.
- Words: `message.ts` (English messages and the reader's language), `typed.ts` (numbers and hexes as typed).

## Tests

`pnpm --filter @grabient/engine test` runs the golden suite in a few seconds: seeds, sampled colors, CSS in every style
and spelling, SVG, shaders, names, Markdown, JSON and swatch file bytes are compared with the outputs in
`test/fixtures/`. `pnpm --filter @grabient/engine typecheck` checks the source against the bare ECMAScript library,
which keeps it free of DOM and Node APIs, and the tests with Node's types.

`effect-conformance.test.ts` holds every effect to `EFFECT_KINDS`: every frame of a vector effect drawn as its own SVG
by resvg (`test/raster.ts`) within a few hundredths of OKLab of the CPU's frame at that time, its still, its CSS and its
address. `CONFORMANCE=deep` sweeps twelve times of the loop and four looks, as whoever designs or changes an effect runs
it. `node test/look.ts kind=<effect> shapes=0,7 times=0,60 out=look.png` draws an effect's frames as one picture to look
at, and `mode=diff` the CPU's beside the SVG's and their difference.
