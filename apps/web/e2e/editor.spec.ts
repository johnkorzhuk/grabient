import { devices, expect, type Page, type Route, test } from "@playwright/test";

/* The editor at a palette's address: the static page the server sends, the editor the browser draws over it, the
   address that follows each edit in place, the undo the entry keeps, and what the page asks the server. */

/* The first tests meet a dev server that has transformed nothing yet, and they run beside each other: each has a
   minute. */
test.describe.configure({ timeout: 60_000 });

const SEED = "kS7CQ31Do6asvY-";
const here = (page: Page) => {
  const url = new URL(page.url());
  return url.pathname + url.search;
};
const entries = (page: Page) => page.evaluate(() => history.length);

/** Opens a palette's page and waits for the editor to stand where the static page was. */
async function open(page: Page, address = `/${SEED}`) {
  await page.goto(address);
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
}

test("the server sends the static page, and the editor takes its place", async ({
  page,
  request
}) => {
  const html = await (await request.get(`/${SEED}`)).text();
  expect(html).toContain('class="palette-static"');
  expect(html).toMatch(/<h1 dir="auto">[^<]+<\/h1>/);
  await open(page);
  await expect(page.locator(".palette-static")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "The gradient" })).toBeVisible();
});

test.describe("while the editor's code loads", () => {
  /** Holds every script the page asks for; the returned function lets them through, or fails them. */
  async function holdScripts(page: Page) {
    const held: Route[] = [];
    let holding = true;
    await page.route("**/*", route => {
      if (holding && route.request().resourceType() === "script") held.push(route);
      else void route.continue();
    });
    return async (how: "continue" | "abort") => {
      holding = false;
      await Promise.all(held.map(route => (how === "abort" ? route.abort() : route.continue())));
    };
  }
  /** Whether the static page was visible, frame by frame, from the first frame that held it. */
  const frames = (page: Page) => page.evaluate(() => (window as { shown?: boolean[] }).shown ?? []);
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const shown: boolean[] = [];
      Object.assign(window, { shown });
      const record = () => {
        const fallback = document.querySelector(".palette-static");
        if (fallback && shown.length < 2000) shown.push(fallback.checkVisibility());
        requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    });
  });

  test("no frame shows the static page, and the editor takes its place", async ({ page }) => {
    const release = await holdScripts(page);
    await page.goto(`/${SEED}?size=2560x1664`, { waitUntil: "commit" });
    await page.locator(".palette-static").waitFor({ state: "attached" });
    await page.waitForTimeout(500);
    await expect(page.locator("html")).toHaveAttribute("data-seed-boot", "");
    await expect(page.locator(".palette-static")).toBeHidden();
    const before = await frames(page);
    expect(before.length).toBeGreaterThan(0);
    expect(before).not.toContain(true);
    await release("continue");
    await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible({
      timeout: 30_000
    });
    await expect(page.locator("html")).not.toHaveAttribute("data-seed-boot");
    await expect(page.locator(".palette-static")).toHaveCount(0);
    expect(await frames(page)).not.toContain(true);
  });

  /** The picture and the strip as a reader sees them: their boxes, the picture's paint, and each hex where it stands. */
  const drawn = (page: Page, root: string) =>
    page.evaluate(root => {
      const at = document.querySelector(root);
      const box = (el: Element | null | undefined) => {
        const r = el?.getBoundingClientRect();
        return r ? [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10) : null;
      };
      const stage = at?.querySelector('[class*="_stage_"]');
      const art = stage?.firstElementChild;
      const strip = at?.querySelector('[aria-label="Palette colors"], [class*="_still_"]');
      const labels = [...(strip?.querySelectorAll('[class*="_label_"]') ?? [])]
        .filter(label => label.checkVisibility())
        .map(label => {
          const style = getComputedStyle(label);
          return [label.textContent, box(label), style.fontSize, style.writingMode].join(" ");
        });
      return {
        stage: box(stage),
        art: art ? [box(art), getComputedStyle(art).backgroundImage] : null,
        strip: box(strip),
        labels
      };
    }, root);
  for (const { name, address, size, away } of [
    {
      name: "beside its side",
      address: `/${SEED}`,
      size: { width: 1600, height: 1000 },
      away: false
    },
    {
      name: "at a fixed size with the side away",
      address: `/${SEED}?size=1920x1080`,
      size: { width: 1600, height: 1000 },
      away: true
    },
    {
      name: "in two rows of upright hexes",
      address: `/${SEED}?steps=21`,
      size: { width: 1024, height: 768 },
      away: false
    },
    { name: "on a phone", address: `/${SEED}`, size: { width: 390, height: 844 }, away: false }
  ])
    test(`the picture and the strip stand drawn before the editor's code comes, as the editor draws them: ${name}`, async ({
      page
    }) => {
      await page.setViewportSize(size);
      if (away) await page.addInitScript(() => localStorage.setItem("grabient-panel", "0"));
      const release = await holdScripts(page);
      await page.goto(address, { waitUntil: "commit" });
      const boot = '[aria-hidden="true"][data-beside-scrollbar]';
      await page.locator(boot).waitFor();
      await page.evaluate(() => document.fonts.ready);
      const before = await drawn(page, boot);
      await release("continue");
      // the scripts held come at once, which a dev server that has transformed nothing yet takes its time over
      await expect(page.getByRole("img", { name: "The gradient" })).toBeVisible({
        timeout: 30_000
      });
      const after = await drawn(page, "main#main");
      expect(before.labels.length).toBeGreaterThan(0);
      expect(before).toEqual(after);
    });

  test("a script that fails to load brings the static page back, whole", async ({ page }) => {
    const release = await holdScripts(page);
    await page.goto(`/${SEED}?size=2560x1664`, { waitUntil: "commit" });
    await page.locator(".palette-static").waitFor({ state: "attached" });
    await expect(page.locator(".palette-static")).toBeHidden();
    await release("abort");
    await expect(page.locator(".palette-static")).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-seed-boot");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download PNG" })).toHaveAttribute(
      "href",
      `/${SEED}.png?w=2560&h=1664`
    );
  });

  test("an editor whose own code fails to load leaves the static page, whole", async ({ page }) => {
    await page.route(
      /\/(assets\/Editor-[^/]+\.js|src\/features\/editor\/Editor\.tsx)(\?|$)/,
      route => route.abort()
    );
    await page.goto(`/${SEED}`);
    await expect(page.locator(".palette-static")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("html")).not.toHaveAttribute("data-seed-boot");
    await expect(page.getByRole("complementary", { name: "Editor" })).toHaveCount(0);
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });
    test("the static page is whole", async ({ page }) => {
      await page.goto(`/${SEED}?size=2560x1664`);
      await expect(page.locator("html")).not.toHaveAttribute("data-seed-boot");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const picture = await page.locator(".palette-static [data-picture]").boundingBox();
      if (!picture) throw new Error("no picture");
      expect(picture.width / picture.height).toBeCloseTo(2560 / 1664, 2);
      await expect(page.locator(".palette-static [data-stops] li")).toHaveCount(7);
      await expect(page.getByRole("link", { name: "Palette JSON" })).toHaveAttribute(
        "href",
        `/${SEED}.json`
      );
    });
  });
});

test("the editor lays itself out without an error to report", async ({ page }) => {
  const reports: string[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/api/client-error")) reports.push(request.postData() ?? "");
  });
  await open(page);
  // past the first frames, where its observers measure the page, the strip and the sheet
  await page.waitForTimeout(1000);
  expect(reports).toEqual([]);
});

test("the strip of a palette of many colors goes to two rows and back as the window narrows and widens, without an error to report", async ({
  page
}) => {
  const reports: string[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/api/client-error")) reports.push(request.postData() ?? "");
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await open(page, `/${SEED}?steps=20`);
  // two rows stand taller than one: the strip's own size changes with what it reads of its width
  const strip = page.getByRole("group", { name: "Palette colors" });
  await expect(strip).not.toHaveAttribute("data-two");
  await page.setViewportSize({ width: 1400, height: 1000 });
  await expect(strip).toHaveAttribute("data-two", "");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(strip).not.toHaveAttribute("data-two");
  await page.waitForTimeout(500);
  expect(reports).toEqual([]);
});

test("the strip and the plots come back from the selection's export screen at their own size, from its first frame", async ({
  page
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await open(page, `/${SEED}?steps=20`);
  const strip = page.getByRole("group", { name: "Palette colors" });
  await expect(strip).not.toHaveAttribute("data-two");
  await page
    .getByRole("group", { name: "Palette actions" })
    .first()
    .getByRole("button", { name: "Add to selection" })
    .click();
  await page
    .getByRole("button", { name: /^Selection/ })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Close selection" })).toBeVisible();
  // each frame as it is painted: an observer made after the page's own reports after theirs, just before the paint
  await page.evaluate(() => {
    const painted: string[] = [];
    Object.assign(window, { painted });
    const strip = document.querySelector('main [role="group"][aria-label="Palette colors"]');
    const plots = [...document.querySelectorAll('main svg[role="img"][width]')];
    const sizes = new ResizeObserver(() => {
      if (!strip?.getClientRects().length) return;
      const rows = strip.hasAttribute("data-two") ? "two rows" : "one row";
      const fit = plots.filter(
        plot =>
          Number(plot.getAttribute("width")) ===
          Math.round(plot.parentElement?.getBoundingClientRect().width ?? 0)
      );
      painted.push(`${rows}, ${fit.length} of ${plots.length} plots fit`);
    });
    if (strip) sizes.observe(strip);
  });
  await page.keyboard.press("Escape");
  await expect(strip).toBeVisible();
  await page.waitForTimeout(300);
  const painted = await page.evaluate(() => (window as unknown as { painted: string[] }).painted);
  expect(painted.length).toBeGreaterThan(0);
  expect(painted.filter(frame => frame !== "one row, 3 of 3 plots fit")).toEqual([]);
});

test("another spelling of an address answers with the canonical one", async ({ request }) => {
  const answer = await request.get(`/${SEED}?angle=90&steps=7&lock=hue,lightness`, {
    maxRedirects: 0
  });
  expect(answer.status()).toBe(301);
  const to = new URL(answer.headers().location ?? "", "http://localhost");
  expect(to.pathname + to.search).toBe(`/${SEED}?lock=lightness,hue`);
});

test("the document the edge keeps for an address is the same page for its lock words and campaign tags", async ({
  page,
  request
}) => {
  const plain = "/kQ4RjAYQ6_g?steps=6&angle=180";
  const kept = await (await request.get(plain)).text();
  const title = /<title[^>]*>([^<]*)<\/title>/.exec(kept)?.[1] ?? "";
  for (const words of ["&lock=hue", "&utm_source=news"]) {
    const address = plain + words;
    await page.route(
      url => url.pathname + url.search === address,
      route => route.fulfill({ body: kept, contentType: "text/html; charset=utf-8" })
    );
    await open(page, address);
    await page.waitForTimeout(1000);
    await expect(page).toHaveTitle(title);
    expect(here(page)).toBe(address);
  }
  await open(page, `${plain}&lock=hue`);
  await expect(
    page.getByRole("complementary", { name: "Editor" }).getByRole("button", { name: "Lock hue" })
  ).toHaveAttribute("aria-pressed", "true");
});

test("a change of view keeps the title the server wrote for the palette", async ({ page }) => {
  await open(page, "/kQ4RjAYQ6_g?steps=6&angle=180");
  const title = await page.title();
  await page.keyboard.press("]");
  await expect.poll(() => here(page)).toBe("/kQ4RjAYQ6_g?angle=180");
  await page.waitForTimeout(500);
  await expect(page).toHaveTitle(title);
  await page.keyboard.press("[");
  await expect.poll(() => here(page)).toBe("/kQ4RjAYQ6_g?steps=6&angle=180");
  await page.waitForTimeout(500);
  await expect(page).toHaveTitle(title);
});

test("random leads to a new palette at the view asked for", async ({ request }) => {
  const answer = await request.get("/random?style=radialGradient", { maxRedirects: 0 });
  expect(answer.status()).toBe(302);
  const to = new URL(answer.headers().location ?? "", "http://localhost");
  expect(to.pathname).toMatch(/^\/k[A-Za-z0-9_-]{8,49}$/);
  expect(to.searchParams.get("style")).toBe("radialGradient");
});

test("edits rewrite the address in place, and the undo walks them both ways", async ({ page }) => {
  await open(page);
  const before = await entries(page);
  await page.keyboard.press("b");
  await expect.poll(() => here(page)).not.toBe(`/${SEED}`);
  const first = here(page);
  await page.keyboard.press("i");
  await expect.poll(() => here(page)).not.toBe(first);
  const second = here(page);
  expect(await entries(page)).toBe(before);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => here(page)).toBe(first);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => here(page)).toBe(`/${SEED}`);
  // with nothing left to take back, an undo changes nothing and leaves nowhere
  await page.keyboard.press("ControlOrMeta+z");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => here(page)).toBe(first);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => here(page)).toBe(second);
  expect(await entries(page)).toBe(before);
});

test("a burst of presses writes the address at most once a rhythm, and the last press lands", async ({
  page
}) => {
  // Safari refuses a page more than a hundred history calls in thirty seconds
  await page.addInitScript(() => {
    const calls: number[] = [];
    Object.assign(window, { historyCalls: calls });
    for (const name of ["replaceState", "pushState"] as const) {
      const real = History.prototype[name];
      History.prototype[name] = function (this: History, ...args: [unknown, string, string?]) {
        calls.push(performance.now());
        return real.apply(this, args);
      };
    }
  });
  await open(page);
  const invert = await page.getByRole("button", { name: "Invert" }).boundingBox();
  if (!invert) throw new Error("no Invert press");
  const calls = () =>
    page.evaluate(() => [...(window as unknown as { historyCalls: number[] }).historyCalls]);
  const before = (await calls()).length;
  for (let i = 0; i < 15; i++) {
    await page.mouse.click(invert.x + invert.width / 2, invert.y + invert.height / 2);
    await page.waitForTimeout(40);
  }
  // an odd count of inverts is the palette inverted once
  await expect.poll(() => here(page)).toBe("/kSEiS3qzo6dQvY-");
  const writes = (await calls()).slice(before);
  expect(writes.length).toBeGreaterThan(1);
  for (let i = 1; i < writes.length; i++)
    expect(writes[i]! - writes[i - 1]!).toBeGreaterThanOrEqual(300);
});

test("a press that leads to another entry lands the edit still waiting in the entry it leaves", async ({
  page
}) => {
  await open(page);
  const presses = page.getByRole("group", { name: "Palette actions" }).first();
  await presses.getByRole("button", { name: "Add to selection" }).click();
  const terms = page.getByRole("link", { name: "Terms" });
  for (const leave of [
    () => presses.getByRole("button", { name: /^Selection/ }).click(),
    () => terms.click()
  ]) {
    await page.keyboard.press("i");
    await expect.poll(() => here(page)).not.toContain("kS7CQ31Do6asvY-");
    const inverted = here(page);
    // the address was written a moment ago, so the next edit's waits its turn
    await page.keyboard.press("e");
    await leave();
    await expect.poll(() => here(page)).not.toBe(inverted);
    await page.goBack();
    await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
    await expect.poll(() => here(page)).toBe("/kSqF5vKzob4kSRW");
    // back where the walk began, for the next press
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => here(page)).toBe(`/${SEED}`);
  }
});

test("U copies the address as the last edit leaves it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await page.keyboard.press("i");
  await expect.poll(() => here(page)).not.toBe(`/${SEED}`);
  const inverted = here(page);
  // the address was written a moment ago, so the next edit's waits its turn
  await page.keyboard.press("e");
  await page.keyboard.press("u");
  await expect.poll(() => here(page)).not.toBe(inverted);
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(new URL(here(page), page.url()).href);
});

test("the campaign tags a reader landed with stay in the address through its edits", async ({
  page
}) => {
  await open(page, `/${SEED}?utm_source=news&steps=9`);
  await page.waitForTimeout(500);
  expect(here(page)).toBe(`/${SEED}?utm_source=news&steps=9`);
  await page.keyboard.press("i");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/kSEiS3qzo6dQvY-");
  const params = new URL(page.url()).searchParams;
  expect(params.get("steps")).toBe("9");
  expect(params.get("utm_source")).toBe("news");
});

test("the view's keys change the address, never the undo or the history", async ({ page }) => {
  await open(page);
  const before = await entries(page);
  await page.keyboard.press("]");
  await page.keyboard.press(".");
  await expect.poll(() => here(page)).toBe(`/${SEED}?steps=8&angle=105`);
  expect(await entries(page)).toBe(before);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("a radial palette's Appearance names and offers its angle, as every style's does", async ({
  page
}) => {
  await open(page, `/${SEED}?style=radialGradient`);
  await page.keyboard.press(".");
  await expect.poll(() => here(page)).toBe(`/${SEED}?style=radialGradient&angle=105`);
  const appearance = page.getByRole("button", { name: /^Appearance:/ });
  await expect(appearance).toHaveAccessibleName("Appearance: As saved, 105°");
  await appearance.click();
  await expect(page.locator('#appearance-menu input[aria-label="Angle"]')).toHaveValue("105°");
});

test("an entry's record of a view no address could carry is no record", async ({ page }) => {
  await open(page, `/${SEED}?steps=9`);
  // the browser hands back whatever a history entry kept
  await page.evaluate(() => {
    const opened = { style: "bogus", steps: 9999, angle: 9999, set: { style: true, angle: true } };
    History.prototype.replaceState.call(history, { ...history.state, opened }, "");
  });
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Appearance:/ })).toHaveAccessibleName(
    "Appearance: As saved"
  );
  expect(here(page)).toBe(`/${SEED}?steps=9`);
});

test("a drag on a number is one step, however long it rests", async ({ page }) => {
  await open(page);
  const box = await page
    .getByRole("complementary", { name: "Editor" })
    .getByRole("spinbutton", { name: "Chroma" })
    .boundingBox();
  if (!box) throw new Error("no Chroma field");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 - i * 8, y);
  await page.waitForTimeout(900);
  for (let i = 9; i <= 16; i++) await page.mouse.move(box.x + box.width / 2 - i * 8, y);
  await page.mouse.up();
  await expect.poll(() => here(page)).not.toBe(`/${SEED}`);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => here(page)).toBe(`/${SEED}`);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("a number or a hex entered or put back keeps the keyboard on its field, whose arrows go on stepping", async ({
  page
}) => {
  await open(page);
  const start = page.getByRole("spinbutton", { name: /^(Lightness start|Start)$/ });
  await start.focus();
  await page.keyboard.type("0.8");
  await page.keyboard.press("Enter");
  await expect(start).toBeFocused();
  const entered = await start.inputValue();
  await page.keyboard.press("ArrowUp");
  await expect(start).not.toHaveValue(entered);
  const stepped = await start.inputValue();
  // a key that types takes the field again, and Escape puts its number back
  await page.keyboard.type("0.3");
  await expect(start).toHaveValue("0.3");
  await page.keyboard.press("Escape");
  await expect(start).toBeFocused();
  await expect(start).toHaveValue(stepped);
  // a keyframe held alone has its hex, which does the same
  await page.getByRole("option", { name: /^Keyframe 2,/ }).click();
  const hex = page.getByRole("textbox", { name: "Hex color" });
  await hex.focus();
  await page.keyboard.type("#336699");
  await page.keyboard.press("Enter");
  await expect(hex).toBeFocused();
  await expect(hex).toHaveValue("#336699");
  await page.keyboard.type("#ff0000");
  await page.keyboard.press("Escape");
  await expect(hex).toBeFocused();
  await expect(hex).toHaveValue("#336699");
  // in the Appearance menu the second Escape closes it, and its press has the keyboard back
  const appearance = page.getByRole("button", { name: /^Appearance/ });
  await appearance.click();
  const steps = page.getByRole("spinbutton", { name: "Steps" });
  await steps.focus();
  await page.keyboard.press("Escape");
  await expect(steps).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(steps).toBeHidden();
  await expect(appearance).toBeFocused();
});

test("Back leaves an edited palette in one press, and Forward brings it back with its undo", async ({
  page
}) => {
  await page.goto("/about");
  await open(page);
  await page.keyboard.press("b");
  await expect.poll(() => here(page)).not.toBe(`/${SEED}`);
  const first = here(page);
  await page.keyboard.press("i");
  await expect.poll(() => here(page)).not.toBe(first);
  const edited = here(page);
  await page.goBack();
  await expect.poll(() => here(page)).toBe("/about");
  await page.goForward();
  await expect.poll(() => here(page)).toBe(edited);
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => here(page)).toBe(first);
});

test("Back with an edit's address still waiting lands on the page it leaves for", async ({
  page,
  request
}) => {
  const listed = (await (await request.get("/api/collections")).json()) as {
    items: { slug: string }[];
  };
  const collection = `/${listed.items[0]?.slug}`;
  await page.goto(collection);
  // started, so the palette opens in the page
  await page.waitForFunction(() => !("$_TSR" in window));
  await page.locator("main article a[aria-label^='Edit ']").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  // a document of its own, so Back reads the collection again, and slowly
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  await page.route("**/api/collections/**", async route => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    await route.continue();
  });
  const before = await entries(page);
  const opened = here(page);
  await page.keyboard.press("i");
  await expect.poll(() => here(page)).not.toBe(opened);
  // the address was written a moment ago, so the next edit's waits its turn
  await page.keyboard.press("i");
  await page.evaluate(() => history.back());
  await expect(page.getByRole("complementary", { name: "Editor" })).toHaveCount(0, {
    timeout: 10_000
  });
  expect(here(page)).toBe(collection);
  expect(await entries(page)).toBe(before);
});

test("the sheet asks for the palettes like this one only once it is in view", async ({ page }) => {
  const asks: URL[] = [];
  page.on("request", r => {
    const url = new URL(r.url());
    if (url.pathname === "/api/search.json") asks.push(url);
  });
  await open(page);
  // edits on the first screen ask nothing
  await page.keyboard.press("b");
  await page.keyboard.press("b");
  await page.waitForTimeout(1500);
  expect(asks).toEqual([]);
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, 2000);
  // the sheet's own code comes with the scroll, which a dev server transforms as it is asked for
  await expect.poll(() => asks.length, { timeout: 30_000 }).toBe(1);
  expect(asks[0]?.searchParams.get("query")).toBe(new URL(page.url()).pathname.slice(1));
});

test("the order of the palettes like this one is kept for the tab, in the lists' own record", async ({
  page
}) => {
  await open(page);
  const order = page.getByRole("radiogroup", { name: "Order" });
  await order.scrollIntoViewIfNeeded();
  await expect(order.getByRole("radio", { name: "Popular" })).toBeChecked();
  await order.getByRole("radio", { name: /^Rising/ }).click();
  await expect(order.getByRole("radio", { name: /^Rising/ })).toBeChecked();
  const kept = await page.evaluate(() => sessionStorage.getItem("grabient-order"));
  expect(JSON.parse(kept ?? "null")).toMatchObject({ order: "rising" });
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  const again = page.getByRole("radiogroup", { name: "Order" });
  await again.scrollIntoViewIfNeeded();
  await expect(again.getByRole("radio", { name: /^Rising/ })).toBeChecked();
});

test("the sheet opened with no connection asks for Rising's frames again once it returns", {
  tag: "@served"
}, async ({ page }) => {
  await page.goto("/palettes");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.context().setOffline(true);
  await open(page);
  const order = page.getByRole("radiogroup", { name: "Order" });
  const rising = order.getByRole("radio", { name: /^Rising/ });
  const asked = page.waitForRequest("**/api/frames");
  await order.scrollIntoViewIfNeeded();
  await asked;
  await expect(rising).toHaveAccessibleName("Rising");
  // an admin turned a second frame on meanwhile: the sheet offers it once it is back in view
  await page.route("**/api/frames", route => route.fulfill({ json: { frames: ["1w", "3m"] } }));
  await page.context().setOffline(false);
  await page.evaluate(() => scrollTo(0, 0));
  await order.scrollIntoViewIfNeeded();
  await expect(rising).toHaveAccessibleName(/^Rising 1w/);
});

test("a palette in the selection offers Add to collection under its check", async ({ page }) => {
  await open(page);
  const presses = page.getByRole("group", { name: "Palette actions" }).first();
  await expect(presses.getByRole("button", { name: /^Like/ })).toBeVisible();
  await expect(presses.getByLabel("Add to collection")).toHaveCount(0);
  await presses.getByRole("button", { name: "Add to selection" }).click();
  await expect(presses.getByRole("button", { name: "Remove from selection" })).toBeVisible();
  const collect = presses.getByLabel("Add to collection");
  await expect(collect).toBeVisible();
  const check = await presses.getByRole("button", { name: "Remove from selection" }).boundingBox();
  const under = await collect.boundingBox();
  if (!check || !under) throw new Error("no check or no press under it");
  expect(under.y).toBeGreaterThanOrEqual(check.y + check.height);
  expect(Math.abs(under.x - check.x)).toBeLessThanOrEqual(1);
});

test("the header's bar carries the palette from the server's render", async ({ request }) => {
  const html = await (await request.get(`/${SEED}`)).text();
  const first = /palette-static[\s\S]*?(#[0-9a-f]{6})/.exec(html)?.[1];
  expect(first).toBeTruthy();
  const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
  expect(header).toContain(first);
});

test("an old link no map holds is fitted in the browser, and its address becomes the palette's", async ({
  page,
  request
}) => {
  const old = "/_gH0gH0gH0gH0gH0gH0gPogPogPogAAgFNgKa?style=angularGradient";
  // the server never fits one: to a crawler it is no page
  expect((await request.get(old, { maxRedirects: 0 })).status()).toBe(404);
  await page.goto(old);
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  expect(here(page)).toBe("/kYq5wTxGc3MlDuPtT7O58281NAs8?style=angularGradient");
});

test("an old id nobody can read is a page not found, never a page named by the id", async ({
  page
}) => {
  const answer = await page.goto("/_abc1234");
  expect(answer?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByText("_abc1234")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Editor" })).toHaveCount(0);
});

test("the selection's export screen takes the page's place, and Escape closes it", async ({
  page
}) => {
  await open(page);
  await page.getByRole("button", { name: "Add to selection" }).first().click();
  await page
    .getByRole("button", { name: /^Selection/ })
    .first()
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.has("selection")).toBe(true);
  await expect(page.getByRole("button", { name: "Close selection" })).toBeVisible();
  // the editor's keys rest while the screen stands
  const opened = here(page);
  await page.keyboard.press("b");
  await page.waitForTimeout(500);
  expect(here(page)).toBe(opened);
  await page.keyboard.press("Escape");
  await expect.poll(() => here(page)).toBe(`/${SEED}`);
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
});

test("a step taken in the selection is the first an undo takes back once it closes", async ({
  page
}) => {
  await open(page);
  const presses = page.getByRole("group", { name: "Palette actions" }).first();
  await presses.getByRole("button", { name: "Add to selection" }).click();
  await page.keyboard.press("i");
  await expect.poll(() => here(page)).toBe("/kSEiS3qzo6dQvY-");
  await page.keyboard.press("e");
  const edited = "/kSqF5vKzob4kSRW";
  await expect.poll(() => here(page)).toBe(edited);
  await presses.getByRole("button", { name: "Add to selection" }).click();
  const selection = page.getByRole("button", { name: /^Selection/ }).first();
  await expect(selection).toHaveAccessibleName("Selection 2");
  await selection.click();
  await page
    .getByRole("group", { name: "Export preview" })
    .first()
    .getByRole("button", { name: /^Remove .+ from selection$/ })
    .first()
    .click();
  await page.keyboard.press("Escape");
  await expect.poll(() => here(page)).toBe(edited);
  await expect(selection).toHaveAccessibleName("Selection 1");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(selection).toHaveAccessibleName("Selection 2");
  expect(here(page)).toBe(edited);
  // the edits are next, in the order they were made
  await page.keyboard.press("ControlOrMeta+z");
  await expect(selection).toHaveAccessibleName("Selection 1");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => here(page)).toBe("/kSEiS3qzo6dQvY-");
});

test("the selection's entry keeps the palette's undo, so a reload there loses none of it", async ({
  page
}) => {
  await open(page);
  await page.keyboard.press("i");
  await expect.poll(() => here(page)).toBe("/kSEiS3qzo6dQvY-");
  await page.keyboard.press("e");
  await expect.poll(() => here(page)).toBe("/kSqF5vKzob4kSRW");
  const presses = page.getByRole("group", { name: "Palette actions" }).first();
  await presses.getByRole("button", { name: "Add to selection" }).click();
  await presses.getByRole("button", { name: /^Selection/ }).click();
  await expect.poll(() => page.evaluate(() => !!history.state?.edits)).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Close selection" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => here(page)).toBe("/kSEiS3qzo6dQvY-");
});

test("an admin's Mod+S in the selection's fields saves no palette", async ({ page }) => {
  // an admin's session and account copy, and a palette in the gallery, as the server would answer them
  const admin = {
    id: "e2e-admin",
    name: "Admin",
    email: "admin@grabient.test",
    emailVerified: true,
    image: null,
    username: "admin",
    createdAt: Date.UTC(2026, 6, 15)
  };
  const asked: string[] = [];
  await page.route("**/api/me/**", route => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/auth/get-session*", route =>
    route.fulfill({ json: { session: { id: "e2e", userId: admin.id }, user: admin } })
  );
  await page.route("**/api/me/sync", route =>
    route.fulfill({
      json: {
        cursor: 1,
        reset: true,
        likes: [],
        unliked: [],
        collections: [],
        removed: [],
        lastMutation: 0,
        results: [],
        admin: true
      }
    })
  );
  await page.route("**/api/me/palettes/*", route => {
    const seed = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
    asked.push(`${route.request().method()} ${seed}`);
    return route.fulfill({ json: { seed, gallery: {}, collections: [], liked: false } });
  });
  await open(page);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await page.keyboard.press("i");
  await expect.poll(() => here(page)).toBe("/kSEiS3qzo6dQvY-");
  const presses = page.getByRole("group", { name: "Palette actions" }).first();
  await presses.getByRole("button", { name: "Add to selection" }).click();
  await presses.getByRole("button", { name: /^Selection/ }).click();
  await page.getByRole("complementary", { name: "Export" }).getByLabel("Width").click();
  await page.keyboard.press("ControlOrMeta+s");
  await page.waitForTimeout(1000);
  // the palette's standing is asked once, for the palette the page opened on
  expect(asked).toEqual([`GET ${SEED}`]);
  // in the editor's own fields it is Save
  await page.getByRole("button", { name: "Close selection" }).click();
  const side = page.getByRole("complementary", { name: "Editor" });
  await side.getByRole("option").first().click();
  await side.getByLabel("Hex color").click();
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(() => asked).toEqual([`GET ${SEED}`, `PUT ${SEED}`]);
});

test("About's first figure is the editor's own controls over a palette of its own, with its own undo", async ({
  page
}) => {
  await page.goto("/about");
  const chips = page.getByRole("listbox", { name: "Keyframes" }).first().getByRole("option");
  const undo = page.getByRole("button", { name: "Undo" }).first();
  const reset = page.getByRole("button", { name: "Reset", includeHidden: true }).first();
  await expect(chips).toHaveCount(5);
  await expect(undo).toBeDisabled();
  await expect(reset).toBeHidden();
  const address = here(page);
  await page.getByRole("button", { name: "Add keyframe" }).first().click();
  await expect(chips).toHaveCount(6);
  await expect(undo).toBeEnabled();
  await expect(reset).toBeVisible();
  // a held keyframe's numbers are its own, as in the editor's side
  await chips.nth(1).click();
  await expect(page.getByRole("spinbutton", { name: "Lightness", exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Lightness start" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("spinbutton", { name: "Lightness start" }).first()).toBeVisible();
  // the figure's undo is its own: the page's address and history never move
  await page.keyboard.press("ControlOrMeta+z");
  await expect(chips).toHaveCount(5);
  await expect(undo).toBeDisabled();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(chips).toHaveCount(6);
  expect(here(page)).toBe(address);
  // Reset puts the opened palette back as one step the undo takes back
  await reset.click();
  await expect(chips).toHaveCount(5);
  await expect(reset).toBeHidden();
  await undo.click();
  await expect(chips).toHaveCount(6);
});

test("About's keys leave select all to the article, turn no hue and take no keyframe without a hold", async ({
  page
}) => {
  await page.goto("/about");
  const chips = page.getByRole("listbox", { name: "Keyframes" }).first().getByRole("option");
  await expect(chips).toHaveCount(5);
  const before = await chips.allTextContents();
  await page.getByRole("heading", { level: 1 }).click();
  await page.keyboard.press("ControlOrMeta+a");
  expect(await page.evaluate(() => getSelection()?.toString().length ?? 0)).toBeGreaterThan(100);
  await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Backspace");
  await page.keyboard.press(".");
  await page.keyboard.press(",");
  await expect(chips).toHaveCount(5);
  expect(await chips.allTextContents()).toEqual(before);
});

test.describe("on a phone", () => {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices["Pixel 7"];
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });
  test("the controls follow the strip, under the first screen", async ({ page }) => {
    await open(page);
    const side = await page.getByRole("complementary", { name: "Editor" }).boundingBox();
    const art = await page.getByRole("img", { name: "The gradient" }).boundingBox();
    if (!side || !art) throw new Error("no side or picture");
    expect(side.y).toBeGreaterThanOrEqual(art.y + art.height);
    await expect(page.getByRole("spinbutton", { name: "Hue" })).toBeAttached();
  });

  test("the palette's name stands at the picture's foot as the first screen's largest paint, and gives way to the presses a tap brings", async ({
    page
  }) => {
    // the page's largest paint as a reader's Chrome reports it, the element's class read as it is reported
    await page.addInitScript(() => {
      const seen: string[] = [];
      Object.assign(window, { largestPaints: seen });
      new PerformanceObserver(list => {
        for (const entry of list.getEntries())
          seen.push(String((entry as PerformanceEntry & { element?: Element }).element?.className));
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    await open(page, `/${SEED}?steps=8`);
    const caption = page.locator('main#main [class*="_caption_"]');
    await expect(caption).toBeVisible();
    expect(await caption.textContent()).toBe((await page.title()).replace(/ \| Grabient$/, ""));
    await expect
      .poll(() =>
        page.evaluate(() => (window as { largestPaints?: string[] }).largestPaints?.at(-1) ?? "")
      )
      .toMatch(/_caption_/);
    await page.getByRole("img", { name: "The gradient" }).tap();
    await expect(caption).toHaveCSS("opacity", "0");
  });

  test("the way into the selection floats at the page's corner only once the page has moved", async ({
    page
  }) => {
    await open(page);
    // a tap on the picture shows its presses to a finger
    await page.getByRole("img", { name: "The gradient" }).tap();
    await page.getByRole("button", { name: "Add to selection" }).first().tap();
    const floating = page.locator("main > span").getByRole("button", {
      name: /^Selection/,
      includeHidden: true
    });
    await expect(floating).toHaveCount(1);
    // at rest the picture's own presses hold the way in
    await expect(floating).toBeHidden();
    await expect(
      page
        .getByRole("group", { name: "Palette actions" })
        .first()
        .getByRole("button", {
          name: /^Selection/
        })
    ).toBeVisible();
    await page.evaluate(() => scrollTo(0, 400));
    await expect(floating).toBeVisible();
    await expect(floating).toBeInViewport();
    await page.evaluate(() => scrollTo(0, 0));
    await expect(floating).toBeHidden();
  });

  test("every color of a long palette keeps a finger's width on the strip, which scrolls sideways in its one row", async ({
    page
  }) => {
    await open(page, `/${SEED}?style=linearSwatches&steps=24`);
    const strip = page.getByRole("group", { name: "Palette colors" });
    const chips = strip.getByRole("button");
    await expect(chips.first()).toBeVisible();
    const boxes = await chips.evaluateAll(all =>
      all.map(chip => {
        const box = chip.getBoundingClientRect();
        return { width: box.width, top: box.top };
      })
    );
    expect(boxes.length).toBeGreaterThan(12);
    expect(Math.min(...boxes.map(box => box.width))).toBeGreaterThanOrEqual(44);
    expect(new Set(boxes.map(box => Math.round(box.top))).size).toBe(1);
    // the last color comes into view as the keyboard reaches it, and a press copies that one
    await chips.first().focus();
    await page.keyboard.press("End");
    const last = chips.last();
    await expect(last).toBeFocused();
    await expect(last).toBeInViewport({ ratio: 1 });
  });

  test("two fingers spread on the panel's controls zoom the page and change nothing", async ({
    page
  }) => {
    const controls = [
      (p: Page) => p.getByRole("spinbutton", { name: "Chroma" }),
      (p: Page) => p.getByRole("spinbutton", { name: /^(Lightness start|Start)$/ }),
      (p: Page) => p.locator('svg[role="img"][aria-label="Chroma"]'),
      (p: Page) => p.getByRole("complementary", { name: "Editor" }).getByRole("listbox")
    ];
    for (const control of controls) {
      await open(page);
      const target = control(page);
      await target.evaluate(el => el.scrollIntoView({ block: "center" }));
      const box = await target.boundingBox();
      if (!box) throw new Error("no control");
      const before = here(page);
      const fields = await page
        .getByRole("spinbutton")
        .evaluateAll(all => all.map(field => (field as HTMLInputElement).value));
      // both fingers land at once, then move apart along the row
      const cdp = await page.context().newCDPSession(page);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const at = (d: number) => [
        { x: x - d, y, id: 1 },
        { x: x + d, y, id: 2 }
      ];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(16) });
      for (let d = 22; d <= 100; d += 6)
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(d) });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(() => page.evaluate(() => visualViewport?.scale ?? 1)).toBeGreaterThan(1.2);
      expect(here(page)).toBe(before);
      expect(
        await page
          .getByRole("spinbutton")
          .evaluateAll(all => all.map(field => (field as HTMLInputElement).value))
      ).toEqual(fields);
      await cdp.detach();
    }
  });
});
