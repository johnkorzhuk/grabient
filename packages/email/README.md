# @grabient/email

The emails Grabient sends, as HTML and plain text: the three an account receives, an issue of the newsletter, and the
parts an issue is built from. Pure strings with no Solid, DOM or Cloudflare types, so the Worker, a script and the
design document draw the same email. Nothing here sends: the Worker holds the bindings, the limits and the list.

## How it fits

- `src/letters.ts`: `signInLink`, `signInCode`, `confirmDeletion`. Their words are catalog messages, so each is written
  in the reader's language. An account email wears a palette `pickHead` chose from the Rising list, or the brand.
- `src/issue.ts`: `newsletter` and `issuePage` (the same sheet as `/newsletter` shows it), and what an issue is written
  with (`Issue`, `pick`, `view`, `shelf`, `rising`, `ways`, `LEDE`). The issues themselves are the Worker's
  (`apps/web/src/server/newsletter/issues/`), so a draft never reaches a browser.
- `src/parts.ts` holds the words and controls, `src/palette.ts` the palettes and collections, `src/partner.ts` a
  partner's tile and `blurb`, and `src/head.ts` the sheet's head and which palettes make one. `src/document.ts` is the
  page around the parts. `src/theme.ts` reads every color, size and space from the design tokens.
- `src/spec.ts` lists the parts for the design document; `src/sample.ts` draws one of each, the account emails and
  three sample issues.

`node packages/email/scripts/preview.ts <folder> [origin]` writes the samples as files to open in a browser.

## What must stay true

- Everything stands on the sheet and nothing on the wash: a mail app that darkens an email by itself recolors flat
  grounds and does what it likes to a gradient.
- A color is written inline for the light scheme and named by a class the document's head recolors for the dark one.
  A part with a new color class adds it to `sheetRules` in `document.ts`.
- The wordmark is never letters on the sheet, where no ink is right in both schemes. It stands in the head's picture.
- The sheet opens with its head: the site's `/api/og?…&head=WxH` picture over the same view in CSS, linking to the
  palette's page, or the brand's file linking home.
- An account email carries its head as an inline PNG under `HEAD_CID`, as bytes and never base64, and still goes out
  without it. A newsletter's head stays an address every reader's issue shares.
- A head is a strip a quarter as tall as wide: angular views, gray palettes, busy radial gradients and faint wordmarks
  are passed over, by the card painter's own arithmetic (`WORDMARK` in `head.ts`).
- A picture's address has one spelling, every setting in one order, at one of three sizes, none larger than a share
  card. Every picture stands in a link, since Gmail lays a Download button over one that leads nowhere.
- On a page an `image` stands behind a blank of its shape that only a browser running script takes, and the page that
  shows the issue drops the blank as the picture nears the screen. In an email it is the file alone.
- An inline gradient is the `background` shorthand alone over a `bgcolor` attribute: Gmail on Android drops any other.
- An issue draws only palettes an admin liked, each in the view it was liked in, and each pick once.
- A partner's tile has a label and says what was exchanged. A blurb is inline styles alone, light, with no class,
  font or style block.
- An account email's action is its one ink button (`class="btn-label"`) and a code its one `<strong>`; the sign-in
  tests read emails by those, and the head's link stands before the action.
- Every email stays under 102 KB of HTML with style blocks under 8,192 characters, and has a plain-text body with its
  links, its code and its way out.
- An issue is written once, runs its own language's way for every reader, and its foot's line is in the reader's
  language and direction.
