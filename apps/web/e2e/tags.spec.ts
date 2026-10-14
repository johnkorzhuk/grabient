import { type APIResponse, expect, type Page, type Response, test } from "@playwright/test";

/* A tag on a page in another language as a reader presses it: it searches the words it shows, so the field, the heading
   and the tab's title read in the page's language, and it finds the palettes its English finds. The tags say the
   translations the local database holds; with none, every tag says its English and searches that. */

const hydrated = (page: Page) => page.waitForFunction(() => !("$_TSR" in window));
/** a tag's words as a list's address writes them */
const wordsOf = (label: string) =>
  label.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
const at = (page: Page) => {
  const url = new URL(page.url());
  return [url.pathname, url.searchParams.get("q")];
};
const title = async (page: Page) => (await page.title()).toLowerCase();
/** the search's answer for these words, once the page asks for it */
const answer = (page: Page, words: string) =>
  page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/api/search.json" && url.searchParams.get("query") === words;
  });
const seeds = async (response: Response | APIResponse) =>
  ((await response.json()) as { items: { kseed: string }[] }).items.map(item => item.kseed);
const cards = (page: Page) =>
  page.locator("main article a[href]").evaluateAll(links => links.map(a => a.getAttribute("href")));

/** Every search the row offers leads to the words it shows, on this page. */
async function rowSearchesItsWords(page: Page, path: string) {
  const tags = page.getByRole("toolbar").locator("a[href]");
  await expect(tags.first()).toBeVisible();
  for (const tag of await tags.all()) {
    const href = new URL((await tag.getAttribute("href")) ?? "", page.url());
    if (href.pathname === path)
      expect(href.searchParams.get("q")).toBe(wordsOf(await tag.innerText()));
  }
}

/* blue hour as each language says it: the vocabulary reads each as the phrase */
const SAID = [
  ["es", "hora azul"],
  ["ja", "ブルーアワー"],
  ["ar", "الساعة الزرقاء"],
  ["de", "blaue Stunde"]
] as const;

for (const [lang, said] of SAID) {
  test(`/${lang}/palettes: a tag searches the words it shows and finds what its English finds`, async ({
    page
  }) => {
    await page.goto(`/${lang}/palettes`);
    await hydrated(page);
    if (lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    // the server's first paint
    await rowSearchesItsWords(page, `/${lang}/palettes`);
    // the tags read while typing: the first is the phrase the words mean, in the page's language where it is kept
    const field = page.getByRole("searchbox");
    await field.fill(said);
    const first = page.getByRole("toolbar").locator("a[href]").first();
    await expect(first).toHaveText(new RegExp(`^(${said}|blue hour)$`));
    const words = wordsOf(await first.innerText());
    const atRest = (await cards(page)).join();
    const translated = answer(page, words);
    await first.click();
    await expect.poll(() => at(page)).toEqual([`/${lang}/palettes`, words]);
    await expect(field).toHaveValue(words);
    await expect(page.locator("main h2").first()).toContainText(words);
    await expect.poll(() => title(page)).toContain(words);
    const found = await seeds(await translated);
    expect(found.length).toBeGreaterThan(0);
    // the English words' answer holds the same palettes in the same order
    const english = await page.request.get(
      `/api/search.json?${new URLSearchParams({ query: "blue hour", limit: "96" })}`
    );
    expect(await seeds(english)).toEqual(found);
    const shown = async () => (await cards(page)).join();
    await expect.poll(async () => ["", atRest].includes(await shown())).toBe(false);
    const drawn = await cards(page);
    // words typed are searched as typed, and drawn as the tag's search was
    await field.fill("blue hour");
    await field.press("Enter");
    await expect.poll(() => at(page)).toEqual([`/${lang}/palettes`, "blue hour"]);
    await expect(field).toHaveValue("blue hour");
    await expect(page.locator("main h2").first()).toContainText("blue hour");
    await expect.poll(() => cards(page)).toEqual(drawn);
  });

  test(`/${lang}: the home's tags search the words they show`, async ({ page }) => {
    await page.goto(`/${lang}`);
    await hydrated(page);
    await rowSearchesItsWords(page, `/${lang}`);
    const first = page.getByRole("toolbar").locator(`a[href^="/${lang}?q="]`).first();
    const words = wordsOf(await first.innerText());
    await first.click();
    await expect.poll(() => at(page)).toEqual([`/${lang}`, words]);
    await expect(page.getByRole("searchbox")).toHaveValue(words);
    await expect(page.locator("main h2").first()).toContainText(words);
    await expect.poll(() => title(page)).toContain(words);
  });
}
