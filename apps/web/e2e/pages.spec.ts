import { expect, type Page, test } from "@playwright/test";

/* The account's pages, the newsletter's and the contact form, each as its document arrives and once it has started:
   what the server draws for anyone, and what only the browser fills in. */

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

test("Settings arrives drawn for anyone, and the browser's own choices come once it has started", async ({
  page,
  request
}) => {
  const answer = await request.get("/settings");
  expect(answer.headers()["cache-control"]).toBe("no-store");
  const html = await answer.text();
  expect(html).toContain("Profile, account and privacy.");
  expect(html).toContain('href="/login?redirect=%2Fsettings"');
  // the server knows no reader's choices: no switch says on or off in its document
  expect(html).not.toContain('role="switch"');

  const errors = watch(page);
  await page.goto("/settings");
  await started(page);
  await expect(page).toHaveTitle("Settings | Grabient");
  await expect(page.getByRole("button", { name: "Theme: System" })).toBeVisible();
  const switches = page.locator('#privacy [role="switch"]');
  await expect(switches).toHaveCount(3);
  // a choice outlasts a reload
  const analytics = switches.first();
  const was = await analytics.getAttribute("aria-checked");
  await analytics.press("Space");
  await expect(analytics).not.toHaveAttribute("aria-checked", was ?? "");
  const now = await analytics.getAttribute("aria-checked");
  await page.reload();
  await expect(page.locator('#privacy [role="switch"]').first()).toHaveAttribute(
    "aria-checked",
    now ?? ""
  );
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

test("an unsubscribe address answers its press, and one with no token says where else to go", async ({
  page
}) => {
  const token = "0".repeat(64);
  const opened = await page.goto(`/unsubscribe/${token}`);
  expect(opened?.headers()["x-frame-options"]).toBe("DENY");
  expect(opened?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/unsubscribe$/);
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
