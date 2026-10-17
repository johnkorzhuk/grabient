---
name: grabient
description: "Use when someone asks for a color palette, a gradient, a background, colors for a brand, site, chart or poster, colors that go with a hex code, or gives a Grabient link. Finds palettes by words or colors, makes them from hex colors, changes one to be lighter, darker, calmer or warmer, shows a set side by side and gives each palette's link, CSS, SVG and PNG. Screen colors only: no print inks, paint, thread or colors taken from a photo."
license: Apache-2.0
metadata:
  author: grabient
  version: "1.0.0"
---

# Grabient

Grabient is a gallery and editor of color palettes and CSS gradients.

## A palette

A palette is a few colors joined by a smooth curve. Its seed, a short string that begins with `k`, is its identity and its address: `{origin}/{seed}`. A seed comes from an answer or a link. One typed or changed by hand is another palette, or none.

`style`, `steps`, `angle` and `size` are a view: how the palette is drawn. They are query parameters of the address and leave the seed as it is. `style` is `linearGradient`, `linearSwatches`, `angularGradient`, `angularSwatches`, `radialGradient` or `radialSwatches`: a gradient blends its steps, and swatches are hard bands. A view a call leaves out is the one Grabient shows the palette in; a new palette comes as a linear gradient in steps that show every color.

The address plus `.png`, `.svg`, `.css` or `.json` is the palette as a file in its view: `{origin}/{seed}.png?style=radialSwatches&steps=6&size=1200x630`. For a design app, `.ase` (Photoshop, Illustrator, Procreate, Affinity), `.gpl` (GIMP, Krita), `.tokens.json` (Figma variables) and `.grd` (a Photoshop gradient) are its swatches. A PNG is up to 2,400 pixels a side and 3 million pixels in all, and a larger size comes smaller at the same shape.

## The path

1. **Find.** `search_palettes` takes words in the person's own language, hex colors the palettes come near, or both, and with neither lists the gallery: popular, rising, newest or hot. `search_collections` finds collections by theme, and `get_collection` reads one.
2. **Make.** `compose_palette` makes palettes from hex colors.
3. **See.** A palette's `colors` are exact: the bands a Swatches view draws (past 12, the ones nearest its own colors), and for a gradient the colors it blends between. An app that draws its own pictures draws a Swatches view from them, and a gradient as Grabient does from its `css`. `show_palettes` shows a set as numbered tiles in an app that draws Grabient's view. In any other, each tile has `png`, its picture's address, which is a link: some chat apps draw no picture from one. `inspect_palettes` names each color and gives its contrast on white and on black.
4. **Change.** `adjust_palette` makes variants of one palette: lighter, darker, calmer, more vivid, warmer, cooler, reversed, fewer or more colors, with a brand color held.
5. **Take.** A palette's `url` is its page in its view, the link for a person. One made, changed or inspected comes with `css`, which past 32 steps is left to its file. An app that draws no view of Grabient's also gets `files`: its PNG, SVG and CSS addresses and `card`, its picture with each hex written on it.
6. **Keep.** `save_palette` saves a palette to the account. `save_collection` makes a private collection, which publishes nothing, or changes one of the account's own: a change to a public one shows on the site at once.

## What to read in an answer

- `note`: there only when something needs saying, such as steps raised to the palette's color count or a change that could not be reached.
- `published`: this save added the palette to the public gallery, as the first save of a palette new to Grabient does.
- `read.notRead`: the words of a search it does not know. A `note` says when the palettes answering them are only the search model's guess.

## What it is not for

Colors are screen colors. Grabient has no print inks, paint or thread, and takes no colors from a photo.

## Without the tools

The addresses above are public and need no account: a palette's page, its files, and the search page, `{origin}/palettes?q={query}`. Making, changing and saving need the tools, which `{origin}/mcp-server` says how to connect.
