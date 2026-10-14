import { expect, type Page, test } from "@playwright/test";

/* The selection's export screen over a list or a palette: what its undo walks, the size its column exports at, and the
   way Close takes back to the page beneath. */

const hydrated = (page: Page) => page.waitForFunction(() => !("$_TSR" in window));
const close = (page: Page) => page.getByRole("button", { name: "Close selection" });
const removable = (page: Page, number: number) =>
  page.getByRole("button", { name: `Remove palette ${number}` }).first();

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
  await hydrated(page);
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
  const picture = page.getByRole("img", { name: "The gradient" });
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
  await hydrated(page);
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
