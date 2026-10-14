import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test
} from "@playwright/test";

/* The readers' journeys, each walked as a reader walks it, at a desk's width with a mouse and at a phone's with a
   finger: from every list into a palette or a collection and back. They read a copy of staging's data, with its test
   account verify-ada and her private collections. */

test.describe.configure({ timeout: 90_000 });

const WIDTHS = [
  { name: "a desk", viewport: { width: 1600, height: 1000 }, touch: false },
  { name: "a phone", viewport: { width: 390, height: 844 }, touch: true }
] as const;
type Width = (typeof WIDTHS)[number];

/** The Cookie verify-ada's browser sends: the session staging's copy keeps for her, signed with the secret the dev
    server reads from .dev.vars. */
function adaSession() {
  const token = "tokenadaverify000000000000000000";
  const vars = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  const secret = vars.match(/^BETTER_AUTH_SECRET=["']?(.*?)["']?$/m)?.[1] ?? "";
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return { name: "better-auth.session_token", value: encodeURIComponent(`${token}.${signature}`) };
}
const signIn = (context: BrowserContext, origin: string) =>
  context.addCookies([{ ...adaSession(), url: origin }]);

/** Everything the page says went wrong from now on: what it reports, what it throws and what it logs as an error. */
function watch(page: Page): string[] {
  const broken: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/client-error")
      broken.push(`reported ${request.postData()}`);
  });
  page.on("pageerror", error => broken.push(`threw ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource"))
      broken.push(`logged ${message.text()}`);
  });
  return broken;
}

/** Opens a page, waits for the app to take over the server's document, and marks the document: a reload loses it. */
async function open(page: Page, address: string) {
  await page.goto(address);
  await page.waitForFunction(() => !("$_TSR" in window));
  await page.evaluate(() => Object.assign(window, { journey: true }));
}
const sameDocument = (page: Page) => page.evaluate(() => "journey" in window);

/** Whether the site's stylesheet applies: the design system's tokens stand on the document. */
const styled = (page: Page) =>
  page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue("--space-s1") !== ""
  );

/** Where a list puts the parts above its grid, in the document: the field, the first tag, the lists row, the heading
    and the grid. */
const rhythm = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector("main");
    const top = (el: Element | null | undefined) =>
      el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
    const shown = (el: Element) => el.checkVisibility() && el.getBoundingClientRect().height > 0;
    const field = main?.querySelector('input[type="search"]');
    const nav = main?.querySelector("nav");
    const heading = [...(main?.querySelectorAll("h1, h2") ?? [])].find(
      el => shown(el) && Number.parseFloat(getComputedStyle(el).fontSize) >= 24
    );
    const tag = [...(main?.querySelectorAll("a, button") ?? [])].find(el => {
      const at = top(el) ?? 0;
      return shown(el) && at > (top(field) ?? 0) && at < (top(nav) ?? 0);
    });
    const grid = main?.querySelector("[data-count]") ?? main?.querySelector("article");
    return {
      field: top(field),
      tag: top(tag),
      row: top(nav),
      heading: top(heading),
      grid: top(grid)
    };
  });

/** Goes down the page to where `target` stands, 400 pixels from the top, and returns that depth once the list has
    drawn the rows there, as it has by the time a reader's eyes land. */
async function reach(page: Page, target: Locator): Promise<number> {
  await target.evaluate(el =>
    scrollTo(0, Math.max(0, el.getBoundingClientRect().top + scrollY - 400))
  );
  return page.evaluate(
    () =>
      new Promise<number>(done =>
        requestAnimationFrame(() => requestAnimationFrame(() => done(scrollY)))
      )
  );
}

/** A press as the width's reader makes it: a click, or a finger's tap. */
const press = (link: Locator, width: Width) => (width.touch ? link.tap() : link.click());

const editor = (page: Page) => page.getByRole("complementary", { name: "Editor" });

/** The address of the link at `at` among those of the list a reader sees at this width, or of its last. */
async function linkAt(page: Page, selector: string, at: number): Promise<string> {
  await expect(page.locator(selector).first()).toBeAttached();
  return page.evaluate(
    ([selector, at]) => {
      const all = [...document.querySelectorAll(selector)].filter(link =>
        (link.closest("article") ?? link).checkVisibility()
      );
      return all[Math.min(Number(at), all.length - 1)]?.getAttribute("href") ?? "";
    },
    [selector, String(at)]
  );
}
/** The card whose Edit leads there, held by its address: a list draws only the rows near the screen, so a place among
    them is no handle. */
const cardOf = (page: Page, href: string) =>
  page
    .locator("main article", { has: page.locator(`a[aria-label='Edit'][href="${href}"]`) })
    .filter({ visible: true })
    .first();
const EDIT = "main article a[aria-label='Edit']";

type Opened = { href: string; depth: number; collection?: string };
/** The ways a list opens what it holds: a palette by its card's Edit from the keyboard and by a press on the card, a
    collection by a group's title and by a collection's card. Each says what it opened, from what depth. */
const OPENERS = {
  async edit(page: Page): Promise<Opened> {
    const href = await linkAt(page, EDIT, 8);
    const card = cardOf(page, href);
    const depth = await reach(page, card);
    await card
      .locator("a[aria-label='Edit']")
      .evaluate(el => (el as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press("Enter");
    return { href, depth };
  },
  async card(page: Page, width: Width): Promise<Opened> {
    const href = await linkAt(page, EDIT, 5);
    const card = cardOf(page, href);
    const depth = await reach(page, card);
    // a mouse finds Edit over the picture; a finger's tap on the picture shows it
    if (width.touch) await card.getByRole("img").first().tap();
    else await card.hover();
    await press(card.locator("a[aria-label='Edit']"), width);
    return { href, depth };
  },
  async title(page: Page, width: Width): Promise<Opened> {
    const href = await linkAt(page, "main section h2 a[href]", 2);
    const title = page.locator(`main section h2 a[href="${href}"]`).first();
    const depth = await reach(page, title);
    const collection = (await title.textContent())?.trim() ?? "";
    await press(title, width);
    return { href, depth, collection };
  },
  async mosaic(page: Page, width: Width): Promise<Opened> {
    const href = await linkAt(page, "main article a[aria-label^='Open ']", 1);
    const picture = page.locator(`main article a[aria-label^='Open '][href="${href}"]`).first();
    const depth = await reach(page, picture);
    const collection = ((await picture.getAttribute("aria-label")) ?? "").replace(/^Open /, "");
    await press(picture, width);
    return { href, depth, collection };
  }
};
type List = { name: string; address: string; opens: (keyof typeof OPENERS)[] };

/** Opens what the list offers, one way after another, and comes Back from each: the page that opens stands whole
    and styled in the same document, and the list comes back at the depth it was left at with nothing above its grid
    moved. */
async function walk(page: Page, width: Width, list: List) {
  const broken = watch(page);
  await open(page, list.address);
  const heading = (await page.locator("main h1").first().textContent()) ?? "";
  await expect(page.locator("main article").first()).toBeVisible();
  const before = await rhythm(page);
  for (const way of list.opens) {
    const opened = await OPENERS[way](page, width);
    await expect
      .poll(() => new URL(page.url()).pathname, way)
      .toBe(new URL(opened.href, page.url()).pathname);
    if (opened.collection) {
      await expect(page.locator("main h1"), way).toHaveText(opened.collection);
      await expect(page.locator("main article").first(), way).toBeVisible();
    } else {
      await expect(editor(page), way).toBeVisible();
      await expect(page.getByRole("img", { name: "The gradient" }), way).toBeVisible();
    }
    expect(await styled(page), way).toBe(true);
    await page.goBack();
    await expect(page.locator("main h1").first(), way).toHaveText(heading);
    await expect.poll(() => page.evaluate(() => scrollY), { message: way }).toBe(opened.depth);
    expect(await styled(page), way).toBe(true);
    expect(await rhythm(page), way).toEqual(before);
    expect(await sameDocument(page), way).toBe(true);
  }
  expect(broken).toEqual([]);
}

const LISTS: List[] = [
  { name: "the home", address: "/", opens: ["edit", "card", "title"] },
  { name: "Palettes", address: "/palettes", opens: ["edit", "card"] },
  { name: "Rising", address: "/palettes/rising", opens: ["edit", "card"] },
  { name: "a palette search", address: "/palettes?q=blue", opens: ["edit", "card"] },
  // words the palettes cannot answer signed out, which collections can
  { name: "a search answered by collections", address: "/palettes?q=midtones", opens: ["mosaic"] },
  { name: "Collections", address: "/collections", opens: ["edit", "card", "title"] },
  { name: "Rising collections", address: "/collections/rising", opens: ["edit", "card", "title"] },
  { name: "a collection", address: "/bright-gradients", opens: ["edit", "card"] }
];
const OWN: List[] = [
  { name: "Saved", address: "/palettes/saved", opens: ["edit", "card"] },
  { name: "a private collection", address: "/@ada-verify/my-blues", opens: ["edit", "card"] }
];

for (const width of WIDTHS)
  test.describe(`on ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.touch, isMobile: width.touch });
    for (const list of LISTS)
      test(`from ${list.name}, what a reader opens lands whole and Back returns to the list as it was`, ({
        page
      }) => walk(page, width, list));
  });

/** A string of the site's English in the page's language, from the catalog the site translates with. */
function say(lang: string, english: string): string {
  if (lang === "en") return english;
  const url = new URL(`../../../packages/i18n/messages/${lang}.json`, import.meta.url);
  const catalog = JSON.parse(readFileSync(url, "utf8")) as Record<string, string>;
  return catalog[english] ?? english;
}
/** What a list says it shows, without the marks that keep words in their own direction: the address and its words,
    the field, the headings, the title and the first row's names. */
const shows = (page: Page) =>
  page.evaluate(() => {
    const bare = (text: string | null | undefined) =>
      (text ?? "").replace(/[\u2066-\u2069]/g, "").trim();
    const main = document.querySelector("main");
    return {
      address: location.pathname + location.search,
      words: new URLSearchParams(location.search).get("q") ?? "",
      field: main?.querySelector<HTMLInputElement>('input[type="search"]')?.value ?? null,
      headings: [...(main?.querySelectorAll("h1, h2") ?? [])]
        .slice(0, 2)
        .map(h => bare(h.textContent)),
      title: bare(document.title),
      cards: [...(main?.querySelectorAll("article") ?? [])]
        .slice(0, 4)
        .map(card => card.getAttribute("aria-label"))
    };
  });
/** Waits for the list to show what the same address shows when it is loaded whole, and returns that. */
async function agrees(page: Page) {
  const whole = await page.context().newPage();
  await whole.goto(page.url());
  await whole.waitForFunction(() => !("$_TSR" in window));
  await expect(whole.locator("main article").first()).toBeVisible();
  const drawn = await shows(whole);
  await whole.close();
  await expect.poll(() => shows(page)).toEqual(drawn);
  return drawn;
}

const SEED = "kS7CQ31Do6asvY-";
const LANGUAGES = [
  { lang: "en", prefix: "", words: "green" },
  { lang: "es", prefix: "/es", words: "verde" },
  { lang: "ja", prefix: "/ja", words: "緑" },
  { lang: "ar", prefix: "/ar", words: "أخضر" }
];

for (const width of WIDTHS)
  test.describe(`on ${width.name}`, () => {
    test.use({ viewport: width.viewport, hasTouch: width.touch, isMobile: width.touch });
    for (const { lang, prefix, words } of LANGUAGES)
      test(`a search in ${lang} by a tag, by words, by a palette's address and cleared shows what its address shows`, async ({
        page,
        context,
        baseURL
      }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        const broken = watch(page);
        await open(page, `${prefix}/palettes`);
        await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
        const rest = await agrees(page);
        const field = page.getByRole("searchbox");

        // a tag of the row at rest, in the page's language: it searches the words it shows
        const tag = page.locator("main [role=toolbar] a").first();
        const label = ((await tag.textContent()) ?? "").trim();
        await press(tag, width);
        await expect(page).toHaveURL(/[?&]q=/);
        const tagged = await agrees(page);
        expect.soft(tagged.field, "the tag's field").toBe(label);
        expect.soft(tagged.headings[1], "the tag's heading").toContain(label);
        expect.soft(tagged.words, "the tag's address").toBe(label);

        await field.fill(words);
        await field.press("Enter");
        await expect(page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(words)}$`));
        const typed = await agrees(page);
        expect(typed.field).toBe(words);
        expect(typed.words).toBe(words);
        expect(typed.headings[1]).toContain(words);

        // the link the editor copies, pasted over the words: the palettes like it
        await page.evaluate(
          address => navigator.clipboard.writeText(address),
          `${baseURL}${prefix}/${SEED}`
        );
        await field.focus();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("ControlOrMeta+V");
        await expect(page).toHaveURL(new RegExp(`[?&]q=${SEED}$`));
        const pasted = await agrees(page);
        expect(pasted.field).toBe(SEED);
        expect(pasted.words).toBe(SEED);

        await press(page.getByRole("button", { name: say(lang, "Clear search") }), width);
        await expect(page).toHaveURL(new RegExp(`${prefix}/palettes$`));
        expect(await agrees(page)).toEqual(rest);
        expect(await sameDocument(page)).toBe(true);
        expect(broken).toEqual([]);
      });
  });

/** Likes or unlikes palettes for verify-ada as her browser's copy would, in one sync. */
async function like(api: APIRequestContext, items: Item[], liked: boolean) {
  const answer = await api.post("/api/me/sync", {
    data: {
      client: `journeys-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      cursor: null,
      mutations: items.map(({ kseed, style, steps, angle }, i) => ({
        id: i + 1,
        op: { op: "like", seed: kseed, liked, style, steps, angle }
      }))
    }
  });
  expect(answer.ok()).toBe(true);
  const { results } = (await answer.json()) as { results: { ok: boolean }[] };
  expect(results.every(result => result.ok)).toBe(true);
}
type Item = { kseed: string; style: string; steps: number; angle: number };

/* Her journeys change what her account holds, so they take turns, and Saved holds palettes she liked for them. */
test.describe("signed in as verify-ada", () => {
  test.describe.configure({ mode: "serial" });
  let api: APIRequestContext;
  let kept: Item[] = [];
  test.beforeAll(async ({ playwright, baseURL }) => {
    const session = adaSession();
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `${session.name}=${session.value}`, Origin: baseURL ?? "" }
    });
    const listed = await api.get("/api/palettes?sort=popular&page=5&limit=24");
    kept = ((await listed.json()) as { items: Item[] }).items.slice(0, 6);
    await like(api, kept, true);
  });
  test.afterAll(async () => {
    await like(api, kept, false);
    await api.dispose();
  });

  for (const width of WIDTHS)
    test.describe(`on ${width.name}`, () => {
      test.use({ viewport: width.viewport, hasTouch: width.touch, isMobile: width.touch });
      test.beforeEach(({ context, baseURL }) => signIn(context, baseURL ?? ""));
      for (const list of OWN)
        test(`from ${list.name}, what she opens lands whole and Back returns to the list as it was`, ({
          page
        }) => walk(page, width, list));
    });
});
