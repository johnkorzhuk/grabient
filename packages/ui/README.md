# @grabient/ui

Grabient's design system: the tokens, the base stylesheet, the Solid components and the browser behavior they share
(themes, motion, keys, presses, the flash guard, the live region).

## Tokens

`tokens.json` holds every value. `pnpm --filter @grabient/ui tokens` writes three files from it, which are checked in;
a test fails when they are stale.

- `src/tokens.css`: each token as a custom property named by its group and name, `--{group}-{kebab-name}`
  (`color.paperSolid` is `--color-paper-solid`). The scales sit on `:root`, the dark colors on `:root` and
  `[data-theme="dark"]`, the light ones on `[data-theme="light"]`, so a subtree can show the other theme.
- `src/tokens-host.css`: the MCP view's tokens under `html[data-host]`, read from the variables the host app passes,
  with Grabient's values as fallbacks. Only the MCP view loads it.
- `src/tokens.ts`: the values for code that draws (canvas, share images, email): px and ms as numbers, colors per theme.

## Using it

A page loads `@grabient/ui/tokens.css` and `@grabient/ui/base.css`, and imports each component by its file:
`import { Button } from "@grabient/ui/Button.tsx"`. There is no barrel, so a page ships only the components it draws and
their styles.

The document's head runs three inline scripts before anything paints: `themeScript` (theme.ts), `motionScript`
(motion.ts) and `scrollbarScript` (scrollbar.ts). Once the page is live the client calls `syncTheme()` and
`syncMotion()`; `installKeys()` reads the reader's changed keys itself. The page's root is a `PageRoot`, the `page`
container every layout here queries.

Links are drawn with the address they are given: the app passes addresses in the reader's language. Words the
components draw themselves go through `src/i18n.ts`, keyed by the English of the site's catalog.

## Styles

- Each component has a CSS module beside it, in `@layer components`. The layer order is
  `reset, tokens, base, components`, so a component's rules win over the base whatever their selectors weigh, and a
  page's own unlayered rules win over a component's.
- One class per element. Variants and states are data attributes (`data-variant`, `data-size`) and ARIA state
  (`aria-checked`, `aria-current`, `aria-disabled`), which the CSS selects.
- Values come from the tokens, never literals; `test/audit.test.ts` holds every module to it.
- Breakpoints are container queries on `page`. No component asks `prefers-reduced-motion`: under reduced motion
  `html[data-motion="reduce"]` stops every transition and animation (base.css), and code that animates asks
  `reducedMotion()` or `reducesNow()`.
- A fill fades as `--fill`, a registered color, never as `background-color`.

## Checks

`pnpm --filter @grabient/ui test` renders each component through Solid's server renderer and reads the markup, presses
every key-map binding the way a reader on 30 keyboard layouts does, runs the flash guard's clock and the head's
scripts, and checks the generated tokens and the audit. `pnpm --filter @grabient/ui typecheck` checks the types.
