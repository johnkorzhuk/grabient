import { expect, type Page, test } from "@playwright/test";
import { live } from "./live.ts";

/* The selection's export screen over a list or a palette: what its undo walks, the size its column exports at, and the
   way Close takes back to the page beneath. */

const close = (page: Page) => page.getByRole("button", { name: "Close selection" });
/** The palette at this place in the export preview: each is a press that takes it out of the selection. */
const removable = (page: Page, number: number) =>
  page
    .getByRole("group", { name: "Export preview" })
    .first()
    .getByRole("button", { name: /^Remove .+ from selection$/ })
    .nth(number - 1);

/** Adds the list's palettes at these places to the selection, with the keyboard. */
async function add(page: Page, ...at: number[]) {
  for (const i of at) {
    await page
      .locator("main article")
      .nth(i)
      .getByRole("button", { name: "Add to selection" })
      .focus();
    await page.keyboard.press("Enter");
  }
}

test("an undo on the selection's screen walks only the steps made there", async ({ page }) => {
  await page.goto("/palettes");
  await live(page);
  await add(page, 0, 1);
  await page
    .getByRole("button", { name: /^Selection/ })
    .first()
    .click();
  await expect(close(page)).toBeVisible();
  // the palettes added on the list beneath stay, and so does the screen
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(500);
  await expect(close(page)).toBeVisible();
  await expect(removable(page, 2)).toBeVisible();
  // a palette taken out here comes back with an undo here, and nothing before it does
  await removable(page, 1).click();
  await expect(removable(page, 2)).toBeHidden();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(removable(page, 2)).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(500);
  await expect(removable(page, 2)).toBeVisible();
  // back on the list, the adds are next
  await page.keyboard.press("Escape");
  await expect(close(page)).toBeHidden();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("button", { name: /^Selection/ }).first()).toHaveAccessibleName(
    "Selection 1"
  );
});

test("on a palette's page the export's Auto is the picture the reader sees", async ({ page }) => {
  await page.goto("/kS7CQ31Do6asvY-");
  /* a new reader's page plays the fluted glass, its picture named as the page names it */
  const picture = page.getByRole("img", { name: / fluted glass gradient$/ });
  await expect(picture).toBeVisible();
  const box = await picture.boundingBox();
  const presses = page.getByRole("group", { name: "Palette actions" }).first();
  await presses.getByRole("button", { name: "Add to selection" }).click();
  await presses.getByRole("button", { name: /^Selection/ }).click();
  await expect(close(page)).toBeVisible();
  // a width set from Auto keeps the other side at the picture's
  await page.getByRole("spinbutton", { name: "Width" }).focus();
  await page.keyboard.press("ArrowUp");
  const width = Math.round(box?.width ?? 0) + 8;
  await expect(page).toHaveURL(new RegExp(`size=${width}x${Math.round(box?.height ?? 0)}`));
});

test("Close goes Back to the list after a size is set in the column, and the list takes the size", async ({
  page
}) => {
  await page.goto("/palettes");
  await live(page);
  await add(page, 0);
  await page
    .getByRole("button", { name: /^Selection/ })
    .first()
    .click();
  await expect(close(page)).toBeVisible();
  await page.getByRole("spinbutton", { name: "Width" }).focus();
  await page.keyboard.type("800");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/palettes\?size=800x720&selection$/);
  // the route has taken it once the wordmark leads home in it
  await expect(page.locator("header a[data-home]")).toHaveAttribute("href", "/?size=800x720");
  await close(page).click();
  await expect(page).toHaveURL(/\/palettes\?size=800x720$/);
  // the entry the screen was opened in is left behind, and the list's own undo is there
  expect(await page.evaluate(() => history.state.__TSR_index)).toBe(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("button", { name: /^Selection/ })).toHaveCount(0);
});

test("the export's strip keeps its mode and its swatch book square beside the formats that share its row", async ({
  page
}) => {
  await page.goto("/palettes");
  await live(page);
  await add(page, 0);
  await page
    .getByRole("button", { name: /^Selection/ })
    .first()
    .click();
  const strip = page
    .getByRole("complementary", { name: "Export" })
    .getByRole("group", { name: "Copy" });
  for (const name of ["Copying. Switch to download", "Swatches"]) {
    const box = await strip.getByRole("button", { name }).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(30);
    expect(Math.abs((box?.width ?? 0) - (box?.height ?? 0))).toBeLessThan(1);
  }
});

test("a palette playing an effect, soft or grained, is shown and taken in its look, held still", async ({
  page,
  context
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/palettes?style=silk&soft=30&grain=40");
  await live(page);
  await add(page, 0);
  await page.goto("/palettes?grain=64");
  await live(page);
  await add(page, 0);
  await page
    .getByRole("button", { name: /^Selection/ })
    .first()
    .click();
  // the silk's still, blurred by its soft with the grain over it, and no player: nothing moves here
  const silk = removable(page, 1);
  await expect(silk).toHaveAccessibleName(/^Remove .+, Silk from selection$/);
  await expect(silk.locator('[data-kind="silk"]')).toHaveCount(1);
  expect(await silk.evaluate(cell => getComputedStyle(cell).getPropertyValue("--fx-blur"))).toMatch(
    /^blur\(.+cqmax\)$/
  );
  await expect(silk.locator(":scope > [class*=grain]")).toHaveCount(1);
  await silk.hover();
  await page.waitForTimeout(600);
  await expect(
    page.getByRole("group", { name: "Export preview" }).first().locator("canvas")
  ).toHaveCount(0);
  await expect(removable(page, 2).locator(":scope > [class*=grain]")).toHaveCount(1);
  // its SVG is each palette's own still, the silk blurred and grained, every id its tile's own
  const strip = page
    .getByRole("complementary", { name: "Export" })
    .getByRole("group", { name: "Copy" });
  const copied = async (name: string) => {
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await strip.getByRole("button", { name, exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 30_000 })
      .not.toBe("");
    return page.evaluate(() => navigator.clipboard.readText());
  };
  const svg = await copied("Copy SVG");
  expect(svg).toMatch(/<title>[^<]*\?style=silk&amp;angle=\d+&amp;soft=30&amp;grain=40<\/title>/);
  expect(svg).toContain("<feGaussianBlur");
  expect(svg).not.toMatch(/<animate|@keyframes/);
  expect((svg.match(/\sid="t1-/g) ?? []).length).toBeGreaterThan(0);
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  expect(new Set(ids).size).toBe(ids.length);
  // its CSS paints the silk's still blurred in pixels of a palette's size, the grain held once a strength
  const css = await copied("Copy CSS");
  expect(css).toMatch(/\.palette-1::before \{[^}]*filter: blur\([\d.]+px\);/);
  expect(css).toContain("--grabient-grain-40: url(");
  expect(css).toMatch(
    /\.palette-2 \{\n {2}background: var\(--grabient-grain-64\) 0 0 \/ 128px 128px, linear-gradient/
  );
});
