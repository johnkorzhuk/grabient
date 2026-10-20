import { expect, type Page, test } from "@playwright/test";

/* The account's pages, the newsletter's and the contact form, each as its document arrives and once it has started:
   what the server draws for anyone, and what only the browser fills in. */

/* The first tests meet a dev server that has transformed nothing yet, and they run beside each other: each has a
   minute. */
test.describe.configure({ timeout: 60_000 });

/** Collects what the page logs as an error, to be empty at the end. */
function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource"))
      errors.push(message.text());
  });
  page.on("pageerror", error => errors.push(error.message));
  return errors;
}
const started = (page: Page) => page.waitForFunction(() => !("$_TSR" in window));

test("the sign-in sheet is in the server's document, kept by no one", async ({ page, request }) => {
  const answer = await request.get("/login?redirect=%2Fsettings");
  expect(answer.headers()["cache-control"]).toBe("no-store");
  expect(answer.headers()["set-cookie"]).toBeUndefined();
  const html = await answer.text();
  for (const words of ["Sign in with Google", "or continue with email", "Send link"])
    expect(html).toContain(words);
  // an app's request waits behind the sheet: the server draws the code's field too, resting
  const connecting = await (
    await request.get("/login?redirect=%2Foauth%2Fauthorize%3Fr%3Dx")
  ).text();
  expect(connecting).toContain("Send code");
  expect(connecting).toMatch(/<input[^>]*name="code"[^>]*disabled/);

  const errors = watch(page);
  await page.goto("/login?redirect=%2Fsettings");
  await started(page);
  await expect(page).toHaveTitle("Sign in | Grabient");
  await expect(page.getByRole("button", { name: "Send link" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("Settings arrives drawn for anyone, and holds no account's choices for a reader signed out", async ({
  page,
  request
}) => {
  const answer = await request.get("/settings");
  expect(answer.headers()["cache-control"]).toBe("no-store");
  const html = await answer.text();
  expect(html).toContain("Profile, account and privacy.");
  expect(html).toContain('href="/login?redirect=%2Fsettings"');
  // a reader signed out has no account's choices to make
  expect(html).not.toContain('role="switch"');

  const errors = watch(page);
  await page.goto("/settings");
  await started(page);
  await expect(page).toHaveTitle("Settings | Grabient");
  await expect(page.getByRole("button", { name: "Theme: System" })).toBeVisible();
  await expect(page.locator("#privacy")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the newsletter's newest issue comes with the document, in a tree of its own", async ({
  page,
  request
}) => {
  const html = await (await request.get("/newsletter")).text();
  expect(html.split('<template shadowrootmode="open">')).toHaveLength(2);
  const errors = watch(page);
  await page.goto("/newsletter");
  await started(page);
  await expect(page).toHaveTitle("Newsletter | Grabient");
  const issue = page.locator("main article[data-issue]").first();
  await expect(issue).toBeVisible();
  // the sheet's words are in its shadow tree, under the page's one title
  await expect(issue.locator("h2").first()).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  expect(errors).toEqual([]);
});

/* the picture the page's theme shows: an issue draws one for each theme where it has both */
const issuePicture = (page: Page) =>
  page.locator("main article[data-issue] [data-part='image'] img:visible").first();
/** What a picture shows once drawn: the blank that holds its place, or its file. */
const shows = (page: Page) =>
  issuePicture(page).evaluate(img => {
    const picture = img as HTMLImageElement;
    return picture.complete && picture.naturalWidth > 0 ? picture.currentSrc : "";
  });
const FILE = /\/email\/[\w-]+\.(?:gif|png)$/;

test("an issue's picture holds its place until the reader nears it, and only then is its file asked for", async ({
  page
}) => {
  const asked: string[] = [];
  page.on("request", request => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/email/")) asked.push(pathname);
  });
  await page.setViewportSize({ width: 1600, height: 800 });
  await page.goto("/newsletter");
  await started(page);
  await expect.poll(() => shows(page)).toMatch(/^data:image\/svg\+xml,/);
  const blank = await issuePicture(page).boundingBox();
  // its top is more than half a screen past the screen's foot
  expect(blank?.y).toBeGreaterThan(800 * 1.5);
  await page.waitForTimeout(1000);
  expect(asked).toEqual([]);
  await issuePicture(page).scrollIntoViewIfNeeded();
  await expect.poll(() => shows(page)).toMatch(FILE);
  expect(asked).toHaveLength(1);
  // the file takes the blank's place without moving anything
  const drawn = await issuePicture(page).boundingBox();
  expect(Math.abs((drawn?.height ?? 0) - (blank?.height ?? 0))).toBeLessThan(1);
});

test("an issue's loop is the one for the page's theme, and the theme's switch shows the other", async ({
  page
}) => {
  const asked: string[] = [];
  page.on("request", request => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/email/collections")) asked.push(pathname);
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/newsletter");
  await started(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await issuePicture(page).scrollIntoViewIfNeeded();
  await expect.poll(() => shows(page)).toMatch(/\/email\/collections-\d+-light\.gif$/);
  // the hidden one is never asked for while its theme is not the page's
  expect(asked).toEqual([expect.stringMatching(/-light\.gif$/)]);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => shows(page)).toMatch(/\/email\/collections-\d+\.gif$/);
  await expect(
    page.locator("main article[data-issue] [data-part='image'] img.light-only").first()
  ).toBeHidden();
  await page.getByRole("button", { name: "Light theme" }).click();
  await expect.poll(() => shows(page)).toMatch(/-light\.gif$/);
});

test.describe("without script", () => {
  test.use({ javaScriptEnabled: false });
  test("an issue's picture comes with the document", async ({ page }) => {
    await page.goto("/newsletter");
    await expect.poll(() => shows(page)).toMatch(FILE);
  });
});

/** Signs the page in as an admin, as the server's answers have one, with no drafts. */
async function asAdmin(page: Page) {
  const admin = {
    id: "e2e-admin",
    name: "admin",
    email: "admin@grabient.test",
    emailVerified: true,
    image: null,
    username: "e2e-admin",
    createdAt: Date.UTC(2026, 6, 15)
  };
  await page.route("**/api/me/**", route => route.fulfill({ status: 404, json: {} }));
  await page.route("**/api/auth/get-session*", route =>
    route.fulfill({ json: { session: { id: "e2e", userId: admin.id }, user: admin } })
  );
  await page.route("**/api/me/sync*", route =>
    route.fulfill({
      json: {
        cursor: 1,
        likes: [],
        unliked: [],
        collections: [],
        removed: [],
        lastMutation: 0,
        results: [],
        admin: true,
        account: admin
      }
    })
  );
  await page.route("**/api/me/newsletter/drafts*", route =>
    route.fulfill({ json: { issues: [] } })
  );
}
/** Answers an admin's picker of one part of an issue as the server does, each sheet the issue's own as the public
    answer draws it; what it was asked for and what was chosen. */
async function answerPicker(
  page: Page,
  part: "lead" | "tip",
  options: { id: string; name: string }[]
) {
  const asked: string[] = [];
  const chose: { body: unknown } = { body: null };
  const field = part === "lead" ? "seed" : "tip";
  await page.route(`**/api/me/newsletter/${part}*`, async route => {
    const published = await (await page.request.get("/api/newsletter")).json();
    const html = published.issues[0].html;
    if (route.request().method() === "POST") {
      chose.body = route.request().postDataJSON();
      const id = (chose.body as Record<string, string>)[field];
      return route.fulfill({ json: { options, chosen: id, shown: id, html } });
    }
    const shown = new URL(route.request().url()).searchParams.get(field) ?? options[0].id;
    asked.push(shown);
    return route.fulfill({ json: { options, chosen: null, shown, html } });
  });
  return { asked, chose };
}

test("an admin goes through the palettes an issue may lead with, over its lead, and the check makes one its lead", async ({
  page
}) => {
  const errors = watch(page);
  await asAdmin(page);
  const { asked, chose } = await answerPicker(page, "lead", [
    { id: "kAlphaAlphaAlpha", name: "Alpha" },
    { id: "kBetaBetaBetaBeta", name: "Beta" }
  ]);
  await page.goto("/newsletter");
  await started(page);
  const picker = page
    .locator('main article[data-issue="1"]')
    .getByRole("group", { name: "Lead palette" });
  await expect(picker).toContainText("Alpha");
  await expect(picker).toContainText("1 of 2");
  // the controls stand over the lead's own picture
  const lead = await page.evaluate(() => {
    const host = document.querySelector('main article[data-issue="1"] [class*="sheet"]');
    const box = host?.shadowRoot?.querySelector('[data-part="lead"]')?.getBoundingClientRect();
    return box && { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  const over = await picker.boundingBox();
  expect(lead).toBeTruthy();
  for (const side of ["x", "y", "width", "height"] as const)
    expect(Math.abs((over?.[side] ?? 0) - (lead?.[side] ?? 0))).toBeLessThan(1);
  await picker.getByRole("button", { name: "Next lead" }).click();
  await expect(picker).toContainText("Beta");
  await expect(picker).toContainText("2 of 2");
  const check = picker.getByRole("button", { name: "Lead with this palette" });
  await expect(check).toHaveAttribute("aria-pressed", "false");
  await check.click();
  await expect(check).toHaveAttribute("aria-pressed", "true");
  expect(chose.body).toEqual({ issue: 1, seed: "kBetaBetaBetaBeta" });
  // the keyboard goes along the leads, and a sheet already drawn is not asked for again
  await picker.getByRole("button", { name: "Next lead" }).press("ArrowLeft");
  await expect(picker).toContainText("Alpha");
  await expect(check).toHaveAttribute("aria-pressed", "false");
  expect(asked).toEqual(["kAlphaAlphaAlpha", "kBetaBetaBetaBeta"]);
  expect(errors).toEqual([]);
});

test("an admin goes through the quick tips an issue offers, along its heading, and the check makes one its tip", async ({
  page
}) => {
  const errors = watch(page);
  await asAdmin(page);
  const { asked, chose } = await answerPicker(page, "tip", [
    { id: "css", name: "CSS at a palette's link" },
    { id: "png", name: "A picture at any size" }
  ]);
  await page.goto("/newsletter");
  await started(page);
  const picker = page
    .locator('main article[data-issue="1"]')
    .getByRole("group", { name: "Quick tip" });
  await expect(picker).toContainText("CSS at a palette's link");
  await expect(picker).toContainText("1 of 2");
  // the controls stand in the rest of the tip's heading's line, after its words
  const heading = await page.evaluate(() => {
    const host = document.querySelector('main article[data-issue="1"] [class*="sheet"]');
    const title = host?.shadowRoot?.querySelector('[data-part="tip"] h3');
    if (!title) return null;
    const words = document.createRange();
    words.selectNodeContents(title);
    const box = title.getBoundingClientRect();
    return {
      y: box.y,
      height: box.height,
      right: box.right,
      words: words.getBoundingClientRect().right
    };
  });
  const over = await picker.boundingBox();
  expect(heading).toBeTruthy();
  expect(Math.abs((over?.y ?? 0) - (heading?.y ?? 0))).toBeLessThan(1);
  expect(Math.abs((over?.height ?? 0) - (heading?.height ?? 0))).toBeLessThan(1);
  expect(Math.abs((over?.x ?? 0) - (heading?.words ?? 0))).toBeLessThan(1);
  expect(Math.abs((over?.x ?? 0) + (over?.width ?? 0) - (heading?.right ?? 0))).toBeLessThan(1);
  await picker.getByRole("button", { name: "Next tip" }).click();
  await expect(picker).toContainText("A picture at any size");
  await expect(picker).toContainText("2 of 2");
  const check = picker.getByRole("button", { name: "End with this tip" });
  await expect(check).toHaveAttribute("aria-pressed", "false");
  await check.click();
  await expect(check).toHaveAttribute("aria-pressed", "true");
  expect(chose.body).toEqual({ issue: 1, tip: "png" });
  expect(asked).toEqual(["css", "png"]);
  expect(errors).toEqual([]);
});

test("with no connection a page whose code was never kept says it is offline, and offers Retry once the connection returns", {
  tag: "@served"
}, async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/about");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.context().setOffline(true);
  await page.goto("/contact");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { name: "You're offline." })).toBeVisible();
  await expect(main).toContainText("This page opens offline once you've seen it online.");
  await expect(main).not.toContainText("Something went wrong");
  await expect(main.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await page.context().setOffline(false);
  await expect(main.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 15_000 });
  await main.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "Contact" })).toBeVisible();
});

test("an unsubscribe address answers its press, and one with no token says where else to go", async ({
  page
}) => {
  const token = "0".repeat(64);
  const opened = await page.goto(`/unsubscribe/${token}`);
  expect(opened?.headers()["x-frame-options"]).toBe("DENY");
  expect(opened?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/unsubscribe$/);
  await started(page);
  // no account holds this address: the Worker's own answer to the press, as an alert
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByRole("alert")).toHaveText("This link isn't valid.");

  await page.goto("/unsubscribe/not-a-token");
  await expect(page.locator("main")).toContainText(
    "This link isn't valid. Turn the newsletter off"
  );
  await expect(page.locator("main").getByRole("button")).toHaveCount(0);
  await expect(page.locator("main").getByRole("link", { name: "Settings" })).toBeVisible();
});

test("a form the server draws sends nothing of its own before its page has started", async ({
  page
}) => {
  // the app never starts: its scripts do not arrive, as on a connection that stalls
  await page.route("**/*", route =>
    route.request().resourceType() === "script" ? route.abort() : route.continue()
  );
  const documents: string[] = [];
  page.on("request", request => {
    if (request.isNavigationRequest()) documents.push(new URL(request.url()).search);
  });
  const sheets = [
    { path: "/login", fields: { email: "early@grabient.test" } },
    { path: "/login/password", fields: { email: "early@grabient.test", password: "never-sent" } },
    { path: "/contact", fields: { email: "early@grabient.test", message: "Typed too early." } }
  ];
  for (const { path, fields } of sheets) {
    await page.goto(path);
    const form = page.locator("main form");
    for (const [name, text] of Object.entries(fields))
      await form.locator(`[name=${name}]`).fill(text);
    await form.locator("[name=email]").press("Enter");
    await form.locator("button[type=submit]").click();
    // a browser asks for the form's own address within a moment of a submit it takes for itself
    await page.waitForTimeout(500);
    await expect(form.locator("[name=email]")).toHaveValue("early@grabient.test");
    expect(new URL(page.url()).search).toBe("");
  }
  // one document a sheet, and no field in any address
  expect(documents).toEqual(["", "", ""]);
});

test("the contact form says its rule before it asks the server", async ({ page }) => {
  let asked = 0;
  await page.route("**/api/contact", route => {
    asked++;
    return route.abort();
  });
  await page.goto("/contact");
  await started(page);
  await page.getByLabel("Message").fill("hey");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Write 5 to 5,000 characters, and a valid email for a reply."
  );
  expect(asked).toBe(0);
  // a message that never reaches the server is said in the page's words, and stays in the form
  await page.getByLabel("Message").fill("The lists stopped loading for me.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert")).toHaveText("Couldn't send the message. Try again.");
  await expect(page.getByLabel("Message")).toHaveValue("The lists stopped loading for me.");
  expect(asked).toBe(1);
});

/** Where a page's frame stands: its side list and its main landmark as top, left and width, and where its title
    starts, whatever the title's own width. */
const frameOf = (page: Page) =>
  page.evaluate(() => {
    const at = (el: Element | null | undefined) => {
      const box = el?.getBoundingClientRect();
      return box
        ? [Math.round(box.top + scrollY), Math.round(box.left), Math.round(box.width)]
        : null;
    };
    const side = [...document.querySelectorAll("nav")].find(nav => !nav.closest("header, footer"));
    return {
      side: at(side),
      main: at(document.querySelector("main")),
      title: at(document.querySelector("h1"))?.slice(0, 2)
    };
  });

test("the brand pages stand in one frame: the side list, the sheet and its title where About has them", async ({
  page
}) => {
  const paths = [
    "/about",
    "/bindings",
    "/mcp-server",
    "/newsletter",
    "/contact",
    "/settings",
    "/privacy",
    "/terms"
  ];
  const frames = new Map<string, unknown[]>();
  for (const path of paths) {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(path);
    await started(page);
    const seen = [await frameOf(page)];
    await page.setViewportSize({ width: 390, height: 844 });
    seen.push(await frameOf(page));
    frames.set(path, seen);
  }
  for (const path of paths) expect(frames.get(path), path).toEqual(frames.get("/about"));
});

test("the sheets stand where one another stand: one width, one middle, and on a phone over the footer", async ({
  page
}) => {
  const paths = ["/login", "/unsubscribe", `/unsubscribe/${"0".repeat(64)}`, "/connect"];
  const sheets = [];
  for (const path of paths) {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(path);
    await started(page);
    const wide = await page.locator("main").boundingBox();
    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await page.locator("main").boundingBox();
    const footer = await page.locator("footer").last().boundingBox();
    if (!wide || !narrow || !footer) throw new Error(`${path} has no sheet`);
    sheets.push({
      path,
      wide: [wide.x, wide.width, Math.round(wide.y + wide.height / 2)],
      narrow: [narrow.x, narrow.width, Math.round(narrow.y + narrow.height - footer.y)]
    });
  }
  for (const sheet of sheets) {
    expect(sheet.wide.slice(0, 2), sheet.path).toEqual(sheets[0]!.wide.slice(0, 2));
    expect(Math.abs(sheet.wide[2]! - sheets[0]!.wide[2]!), sheet.path).toBeLessThanOrEqual(1);
    expect(sheet.narrow, sheet.path).toEqual([sheets[0]!.narrow[0], sheets[0]!.narrow[1], 0]);
  }
});

test("a returning reader's Settings stands where its document drew it when the account answers", async ({
  page
}) => {
  const reader = {
    id: "e2e-reader",
    name: "Reader",
    email: "reader@grabient.test",
    emailVerified: true,
    image: null,
    username: "reader",
    createdAt: Date.UTC(2026, 6, 15)
  };
  // this browser kept the account, and the session answers a moment after the page has started
  await page.addInitScript(
    kept => localStorage.setItem("grabient-account", kept),
    JSON.stringify(reader)
  );
  let answer = () => {};
  const answered = new Promise<void>(resolve => {
    answer = resolve;
  });
  await page.route("**/api/auth/get-session*", async route => {
    await answered;
    await route.fulfill({ json: { session: { id: "e2e", userId: reader.id }, user: reader } });
  });
  await page.route("**/api/me/**", route => route.fulfill({ status: 401, json: {} }));
  const sections = () =>
    page.evaluate(() =>
      ["profile", "account", "theme", "motion", "color-format", "privacy"].map(
        id => document.getElementById(id)?.getBoundingClientRect().top
      )
    );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await started(page);
  const drawn = await sections();
  answer();
  await expect(page.locator("#account")).toContainText("reader@grabient.test");
  await expect(page.locator('#profile input[name="username"]')).toHaveValue("reader");
  expect(await sections()).toEqual(drawn);
});

test("a username set in Settings comes with the offer to show it on the palettes the account liked first, off unless taken", async ({
  page
}) => {
  const account = {
    id: "e2e-credit",
    name: "Ada",
    email: "ada@grabient.test",
    emailVerified: true,
    image: null,
    username: null as string | null,
    createdAt: Date.UTC(2026, 6, 15)
  };
  const asked: unknown[] = [];
  let on = false;
  // the later a route is added, the sooner it answers
  await page.route("**/api/me/**", route => route.fulfill({ status: 404, json: {} }));
  await page.route("**/api/auth/get-session*", route =>
    route.fulfill({ json: { session: { id: "e2e", userId: account.id }, user: account } })
  );
  await page.route("**/api/me/sync*", route =>
    route.fulfill({
      json: {
        cursor: 1,
        likes: [],
        unliked: [],
        collections: [],
        removed: [],
        lastMutation: 0,
        results: [],
        admin: false,
        account
      }
    })
  );
  await page.route("**/api/me/newsletter", route => route.fulfill({ json: { subscribed: false } }));
  await page.route("**/api/me/credit", route => {
    if (route.request().method() === "PUT") {
      asked.push(route.request().postDataJSON());
      on = true;
    }
    return route.fulfill({ json: { on } });
  });
  await page.route("**/api/settings/username/check", route =>
    route.fulfill({ json: { available: true } })
  );
  await page.route("**/api/settings/username", route => {
    account.username = "ada-colors";
    return route.fulfill({ json: { success: true } });
  });
  await page.goto("/settings");
  await started(page);
  // with no username there is nothing to show: the switch stands off and says where to add one
  const credit = page.getByRole("switch", { name: "Your name on palettes" });
  await expect(credit).toHaveAttribute("aria-checked", "false");
  await expect(credit).toBeDisabled();
  await expect(page.locator("#credit-unnamed")).toBeVisible();
  await page.locator('#profile input[name="username"]').fill("ada-colors");
  await page.locator("#profile").getByRole("button", { name: "Save" }).click();
  const offer = page.getByRole("group", {
    name: "Show your username on the palettes you liked first?"
  });
  await expect(offer).toBeVisible();
  expect(asked).toEqual([]);
  await offer.getByRole("button", { name: "Show my username" }).click();
  await expect(offer).toHaveCount(0);
  await expect(page.locator("#profile")).toContainText(
    "Your username now shows on the palettes you liked first."
  );
  expect(asked).toEqual([{ on: true }]);
  await expect(credit).toHaveAttribute("aria-checked", "true");
  await expect(credit).toBeEnabled();
});

test("Settings keeps the still water under reduced motion, as the other brand pages do", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // the water drawn, or where the browser draws none (a software renderer), its wash in its place
  const water = () =>
    page.evaluate(
      () =>
        !!document.querySelector('[aria-hidden="true"][data-lit]') ||
        !!document.querySelector('[aria-hidden="true"] > [style*="radial-gradient"]')
    );
  for (const path of ["/about", "/settings"]) {
    await page.goto(path);
    await started(page);
    await expect.poll(water, { message: path }).toBe(true);
  }
});

test("the account menu opens the lists in the reader's view, a visitor's Collections in the order chosen last, and leaves the keyboard to the page", async ({
  page
}) => {
  const menu = (row: string) => async () => {
    await page.locator("header button[aria-haspopup=menu]").click();
    await page.getByRole("menuitem", { name: row }).click();
  };
  const list = "/palettes/rising?style=linearSwatches&steps=5";
  await page.goto(list);
  await started(page);
  await menu("Collections")();
  await expect(page).toHaveURL(/\/collections\/rising\?style=linearSwatches&steps=5$/);
  // the page a row leads to takes the keyboard, as a link's does: Space pages down and leaves the menu shut
  await expect(page.locator("main")).toBeFocused();
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await expect(page.getByRole("menu")).toHaveCount(0);

  // signed in: the session answers for a reader, whose copy never syncs here
  const reader = {
    id: "e2e-reader",
    name: "Reader",
    email: "reader@grabient.test",
    emailVerified: true,
    image: null,
    username: "reader",
    createdAt: Date.UTC(2026, 6, 15)
  };
  await page.route("**/api/auth/get-session*", route =>
    route.fulfill({ json: { session: { id: "e2e", userId: reader.id }, user: reader } })
  );
  await page.route("**/api/me/**", route => route.fulfill({ status: 401, json: {} }));
  for (const [row, to] of [
    ["Saved palettes", /\/palettes\/saved\?style=linearSwatches&steps=5$/],
    ["Your collections", /\/collections\/saved\?style=linearSwatches&steps=5$/]
  ] as const) {
    await page.goto(list);
    await started(page);
    await menu(row)();
    await expect(page).toHaveURL(to);
  }
});

test("back from Google with an app's request kept in the tab, the sheet is the app's from its first paint", async ({
  context
}) => {
  for (const kept of ["/oauth/authorize?r=x", "/settings", null]) {
    const page = await context.newPage();
    // the app never starts: the sheet is the server's document and its head's mark alone
    await page.route("**/*", route =>
      route.request().resourceType() === "script" ? route.abort() : route.continue()
    );
    if (kept)
      await page.addInitScript(
        to => sessionStorage.setItem("grabient-sign-in-return", `${Date.now()} ${to}`),
        kept
      );
    await page.goto("/login?error=access_denied");
    const app = kept?.startsWith("/oauth/") ?? false;
    const sheet = page.locator("main");
    await expect(sheet.getByText("Connect an app to your account."), String(kept)).toBeVisible({
      visible: app
    });
    await expect(sheet.getByText("Save your favorite palettes.")).toBeVisible({ visible: !app });
    await expect(sheet.getByRole("button", { name: "Send code" })).toBeVisible({ visible: app });
    await expect(sheet.locator('[name="code"]')).toBeVisible({ visible: app });
    await page.close();
  }
  // started, the sheet says why it is back and keeps the app's request in its address
  const page = await context.newPage();
  await page.addInitScript(() =>
    sessionStorage.setItem("grabient-sign-in-return", `${Date.now()} /oauth/authorize?r=x`)
  );
  await page.goto("/login?error=access_denied");
  await started(page);
  await expect(page.getByRole("alert")).toHaveText("Google sign-in failed.");
  await expect(page).toHaveURL(/\/login\?redirect=%2Foauth%2Fauthorize%3Fr%3Dx$/);
  await expect(page.locator('main [name="code"]')).toBeVisible();
});

test("the app reviewers' account gives itself its password in Settings, and no other account is offered one", async ({
  page
}) => {
  let reviewer = false;
  await page.route("**/api/auth/get-session*", route =>
    route.fulfill({
      json: {
        session: { id: "e2e", userId: "e2e-reviewer" },
        user: {
          id: "e2e-reviewer",
          name: "Reviewer",
          email: "reviewer@grabient.test",
          emailVerified: true,
          image: null,
          username: "reviewer",
          createdAt: Date.UTC(2026, 6, 15),
          ...(reviewer ? { reviewer: true } : {})
        }
      }
    })
  );
  await page.route("**/api/me/**", route => route.fulfill({ status: 401, json: {} }));
  const sent: unknown[] = [];
  await page.route("**/api/auth/reviewer-password", route => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  const section = page.locator("#account");
  await page.goto("/settings");
  await started(page);
  await expect(section).toContainText("reviewer@grabient.test");
  await expect(section.locator('input[name="password"]')).toHaveCount(0);

  reviewer = true;
  await page.goto("/settings");
  await started(page);
  const password = section.locator('input[name="password"]');
  await password.fill("a long password for the review");
  await section.getByRole("button", { name: "Save" }).click();
  await expect(section.getByRole("status")).toHaveText("Saved.");
  expect(sent).toEqual([{ password: "a long password for the review" }]);
  await expect(password).toHaveValue("");
});
