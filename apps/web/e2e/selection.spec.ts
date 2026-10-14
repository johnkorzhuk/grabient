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
