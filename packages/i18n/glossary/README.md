# Glossary

The product's own words, what each means here, and how each language says them. A translator reads the English list
and the language's own file (`<tag>.md`) before translating, uses the chosen word every time, and adds a row when a new
product word gets its translation. Consistency matters more than any single choice: the same control must not be
"Kopieren" on one page and "Duplizieren" on the next.

## The words

| English | What it is here |
| --- | --- |
| Grabient | The product. Never translated, never transliterated. |
| palette | The thing Grabient makes: a sequence of colors along a smooth curve, drawn as a gradient or as swatches. The main noun of the product. |
| gradient | A smooth color transition, and a palette drawn that way ("CSS gradient", "linear gradient"). |
| effect | A palette played as something other than a gradient, which moves: fluted glass or a blob, the animated styles of the Appearance menu. |
| swatches | A palette drawn as hard bands of its colors instead of a smooth blend (a style: "Linear swatches"). |
| Swatches (the strip's mode) | The swatch files design apps import: Tokens, ASE, GPL and GRD. Named as a design app's Swatches panel is, apart from the hard-band style. |
| style | How a palette is drawn: linear, angular or radial, each as a gradient or as swatches. |
| steps / colors | How many colors are sampled from a palette ("7 colors", the Steps control). |
| angle | The direction a linear gradient runs, in degrees. |
| keyframe | One of a palette's 2 to 8 editable color anchors; the curve runs through them. |
| lightness | How light a color is (the L of OKLCH). |
| chroma | How colorful a color is (the C of OKLCH). Chroma is the color-science word, used on purpose: use your language's color-science term for chroma, not the everyday word for saturation where the two differ. |
| hue | The color's angle on the color wheel (H of OKLCH). |
| collection | A named, ordered list of palettes, made by a person or by Grabient's agents, with its own address. |
| selection | The palettes a reader gathers with a card's plus button, to export or save together. Also the name of the button that opens them. |
| Popular / Rising / Saved | The orders of the lists: most liked, gaining likes lately (most where a like made the most difference), the reader's own. Short labels on a segmented control. Rising is kept apart from Hot. |
| 1w / 3m / 1y | Rising's three frames: how long a like counts there, a week, three months or a year. The frame stands after Rising inside its control in the language's own short form for the span, the one its phones and calendars write (CLDR's), or the whole word where that is as short. `Rising, 1 week` and its two fellows are the control said in full, for a screen reader. |
| Hot | The home page's order: what was liked lately. "Hot palettes and collections". |
| like | The heart on a card: marks a palette as a favorite and counts toward Popular. |
| export / copy / download / save | Export writes files; copy puts text or an image on the clipboard; download saves a file; save keeps palettes in the account or a collection. Keep the four distinct. |
| saved collection / Update / Reset | The account's own copy of someone else's collection, kept once by Save (the press then reads Saved). Update takes in what changed in the collection it was saved from and keeps the account's changes; Reset makes it that collection again. |
| preview size | The size, in pixels, the preview and an export are drawn at. "Auto" follows the artwork. |
| shortcuts | The keyboard shortcuts: the list ? opens, and the page that lists and changes them (Shortcuts, at /bindings). |
| sign in / sign out / account / settings | The account words. |
| agent | Grabient's automated curators that make collections ("made by people and by Grabient agents"). |

Names of formats and standards are never translated: OKLCH, OKLab, sRGB, CSS, SVG, PNG, JSON, GLSL, WGSL, Shadertoy,
Figma, MCP, URL.

## How every language writes

Plain, specific and short, as the English is: sentence case where the language has case, no marketing, no exclamation
marks, no em dashes. Labels on buttons, tabs and chips are as short as the language allows; the layout was drawn for the
English lengths. Keep punctuation natural to the language (Chinese and Japanese full-width punctuation, French spaces
before `:` `;` `?` `!`, Spanish opening `¿`), and keep every `{value}`, `#`, plural case and `<tag>` exactly.

Translate from `messages/en.json`, the master English: each message's note says what it is and where it shows. Say what
the English says, no more, in the words the language's own design tools use. A press and its tooltip name the action
(a tooltip is the press's name, then its key after a middle dot: Reverse · E); a status or an error is one short
sentence.
