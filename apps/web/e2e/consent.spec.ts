import { expect, type Page, test } from "@playwright/test";

/* The privacy banner, for a reader whose region asks for consent first or tells them about analytics: where it stands
   and what moves when it comes, how it is reached and answered, what an answer keeps, and where it never stands. Every
   test here starts as a reader who has never answered. */

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 60_000 });

type Rule = "ask" | "tell" | "none";

const started = (page: Page) => page.waitForFunction(() => !("$_TSR" in window));
const banner = (page: Page) => page.getByRole("complementary", { name: "Privacy choices" });
const kept = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("consent-preferences") ?? "null"));

/** Answers /api/geo with a rule, once `open` is called when `held`; the answers so far are counted. */
async function region(page: Page, rule: Rule, held = false) {
  let open = () => {};
  const opened = held ? new Promise<void>(resolve => (open = resolve)) : Promise.resolve();
  const asked = { count: 0, open };
  await page.route("**/api/geo", async route => {
    asked.count++;
    await opened;
    await route.fulfill({ json: { rule, isGdprRegion: rule === "ask" } });
  });
  return asked;
}

/** Where the page's own parts stand: each one's place, and its size where it ends in the first screen, since a feed
    below it may still be growing. */
const layout = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "header, main, main h1, main h2, main input, main article, footer"
      )
    ]
      .slice(0, 24)
      .map(el => {
        const box = el.getBoundingClientRect();
        const size = box.bottom <= innerHeight ? [box.width, box.height] : [box.width];
        return [el.tagName, box.x, box.y, ...size].join(" ");
      })
  );

test("where the region asks, the banner stands over the page's foot, second in the Tab order, and nothing moves", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const asked = await region(page, "ask", true);
  await page.goto("/");
  await started(page);
  const before = await layout(page);
  asked.open();
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText("Nothing runs until you choose.");
  expect(await layout(page)).toEqual(before);
  // fixed at the screen's foot, across the screen less its gutters, and under a third of it
  const box = await banner(page).boundingBox();
  expect(box && [box.x, Math.round(box.x + box.width), Math.round(box.y + box.height)]).toEqual([
    16, 374, 828
  ]);
  expect(box?.height).toBeLessThan(844 / 3);
  // a control the keyboard reaches scrolls into view above it, and the page runs on past its footer by its room, so at
  // its end the footer's links scroll clear of it too
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom))
    .toBe(`${Math.ceil(844 - (box?.y ?? 0)) + 12}px`);
  expect(await page.evaluate(() => getComputedStyle(document.body, "::after").height)).toBe(
    `${Math.ceil(844 - (box?.y ?? 0))}px`
  );
  // nothing on it takes the focus; the skip link is the first stop and the banner's first link the second
  await expect(banner(page).locator(":focus")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(banner(page).getByRole("link", { name: "Choose" })).toBeFocused();
});

test("its answers are one size and one look, and each is kept for every category at once", async ({
  page
}) => {
  for (const [rule, press, on] of [
    ["ask", "Reject all", false],
    ["tell", "Accept all", true]
  ] as const) {
    await page.unrouteAll();
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await region(page, rule);
    await page.goto("/about");
    await started(page);
    const reject = banner(page).getByRole("button", { name: "Reject all" });
    const accept = banner(page).getByRole("button", { name: "Accept all" });
    const [a, b] = [await reject.boundingBox(), await accept.boundingBox()];
    expect(a && [a.width, a.height, a.y]).toEqual(b && [b.width, b.height, b.y]);
    const look = (button: typeof reject) =>
      button.evaluate(el => {
        const style = getComputedStyle(el);
        return [el.dataset.variant, style.backgroundColor, style.color, style.borderColor];
      });
    expect(await look(reject)).toEqual(await look(accept));
    if (rule === "tell")
      await expect(banner(page)).toContainText("Google Analytics counts visits.");
    await banner(page).getByRole("button", { name: press }).click();
    await expect(banner(page)).toHaveCount(0);
    expect(await kept(page)).toMatchObject({
      hasInteracted: true,
      isGdprRegion: rule === "ask",
      categories: { analytics: on, marketing: on, sessionReplay: on }
    });
    // the answer stands: a reload asks nothing and shows nothing
    const again = await region(page, rule);
    await page.reload();
    await started(page);
    await page.waitForTimeout(500);
    expect(again.count).toBe(0);
    await expect(banner(page)).toHaveCount(0);
  }
});

test("a keyboard that answers lands on the page's content, told where to change it", async ({
  page
}) => {
  await region(page, "ask");
  await page.goto("/about");
  await started(page);
  await expect(banner(page)).toBeVisible();
  await banner(page).getByRole("button", { name: "Reject all" }).focus();
  await page.keyboard.press("Enter");
  await expect(banner(page)).toHaveCount(0);
  await expect(page.locator("main")).toBeFocused();
  await expect(page.locator("[data-announce]")).toHaveText("Saved. Change it in Settings.");
  // and the room kept for it goes with it
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom)
  ).toBe("auto");
});

test("Choose opens the privacy choices in Settings, where the banner never stands, and records nothing", async ({
  page
}) => {
  await region(page, "ask");
  await page.goto("/palettes");
  await started(page);
  await banner(page).getByRole("link", { name: "Choose" }).click();
  await expect(page).toHaveURL(/\/settings#privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy & Consent" })).toBeInViewport();
  // the keyboard lands on the section the address names, so the next Tab reaches its first switch
  await expect(page.locator("#privacy")).toBeFocused();
  await expect(banner(page)).toHaveCount(0);
  expect(await kept(page)).toBeNull();
  // a switch there is an answer too: the banner is gone from the next page
  await page.locator("#privacy").getByRole("switch").first().click();
  await page.goto("/palettes");
  await started(page);
  await page.waitForTimeout(500);
  await expect(banner(page)).toHaveCount(0);
});

test("it never stands where the browser says no, on the pages kept out of analytics, on Settings, or in a frame", async ({
  page
}) => {
  const asked = await region(page, "ask");
  const settle = async (count: number) => {
    await expect.poll(() => asked.count).toBe(count);
    await page.waitForTimeout(500);
  };
  for (const [path, count] of [
    ["/settings", 1],
    ["/connect", 2],
    ["/unsubscribe", 3]
  ] as const) {
    await page.goto(path);
    await started(page);
    await settle(count);
    await expect(banner(page), path).toHaveCount(0);
  }
  // framed by the site itself, as another site's frame would: the page around it asks, the framed page never does
  await page.goto("/about");
  await started(page);
  await expect(banner(page)).toBeVisible();
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.name = "framed";
    frame.src = "/palettes";
    frame.style.cssText = "position: fixed; inset: 0; width: 800px; height: 600px";
    document.body.append(frame);
  });
  const framed = page.frameLocator("iframe[name=framed]");
  await expect(framed.locator("main")).toBeVisible();
  await settle(5);
  await expect(framed.getByRole("complementary", { name: "Privacy choices" })).toHaveCount(0);
});

test("a browser that sends Global Privacy Control never sees it, and its Settings say why Marketing and replay stay off", async ({
  page
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true })
  );
  const asked = await region(page, "ask");
  await page.goto("/about");
  await started(page);
  await expect.poll(() => asked.count).toBe(1);
  await page.waitForTimeout(500);
  await expect(banner(page)).toHaveCount(0);
  await page.goto("/settings");
  await started(page);
  const privacy = page.locator("#privacy");
  const line = "Your browser's Global Privacy Control or Do Not Track keeps this off.";
  for (const name of ["Marketing", "Session replay"]) {
    const row = privacy.getByRole("switch", { name });
    await expect(row).toBeDisabled();
    await expect(row).toHaveAttribute("aria-checked", "false");
    await expect(row).toHaveAccessibleDescription(line);
  }
  await expect(privacy.getByRole("switch", { name: "Analytics" })).toBeEnabled();
});

test("where the region asks, nothing measures the reader until a yes, and analytics starts at the press after it", async ({
  page,
  baseURL
}) => {
  /* the site as grabient.com, where analytics runs, answered by the local server */
  const measured: string[] = [];
  await page.route("https://grabient.com/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/geo")
      return route.fulfill({ json: { rule: "ask", isGdprRegion: true } });
    if (url.pathname.startsWith("/cdn-cgi/zaraz/") || url.pathname.startsWith("/e/")) {
      measured.push(url.pathname);
      return route.fulfill({ contentType: "text/javascript", body: "" });
    }
    /* the local server, asked for every one of the page's modules at once, drops one now and then: it is asked again */
    const local = `${baseURL}${url.pathname}${url.search}`;
    const response = await route.fetch({ url: local }).catch(() => route.fetch({ url: local }));
    await route.fulfill({ response });
  });
  page.on("request", request => {
    if (/google|posthog|doubleclick/.test(new URL(request.url()).hostname))
      measured.push(request.url());
  });
  /* a press on the page's margin, where nothing answers it */
  const use = () => page.mouse.click(8, 400);
  await page.goto("https://grabient.com/palettes");
  await started(page);
  await expect(banner(page)).toBeVisible();
  // the reader uses the page, answers no, and goes on
  await use();
  await page.keyboard.press("Shift");
  await banner(page).getByRole("button", { name: "Reject all" }).click();
  await use();
  await page.waitForTimeout(500);
  expect(measured).toEqual([]);
  // another visit: a yes is the answer to the banner, no use of the page, so analytics starts at the next press
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await started(page);
  await banner(page).getByRole("button", { name: "Accept all" }).click();
  await page.waitForTimeout(500);
  expect(measured).toEqual([]);
  await use();
  await expect.poll(() => measured).toContain("/cdn-cgi/zaraz/i.js");
  // the recorder is still on its way from the local server
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
