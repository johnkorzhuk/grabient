import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { live } from "./live.ts";

/* The editor's MP4 while an effect plays: Download makes the clip in the reader's browser, in a worker, by the module
   the Worker draws clips with, so the file is the clip the server answers at the address Copy link copies; the chip
   shows how far along it is, and a press on it stops it, as the stage showing another clip does. Copy hands over no
   clip. */

const SEED = "kWnCIwwC47igfOklkTlShq44";

/** What a browser's video makes of a file: its size and its length. */
const played = (page: Page, file: Buffer) =>
  page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const video = document.createElement("video");
    video.muted = true;
    video.src = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
    await new Promise((done, failed) => {
      video.onloadeddata = done;
      video.onerror = () => failed(new Error(`the video did not play: ${video.error?.message}`));
    });
    return { width: video.videoWidth, height: video.videoHeight, seconds: video.duration };
  }, file.toString("base64"));

test("Download MP4 makes the effect's clip in the browser, a file that plays at its size and length, the server's clip at its link byte for byte", async ({
  page,
  context,
  request,
  baseURL
}) => {
  /* a cold dev server compiles the worker's modules at the first press, and the Worker draws the clip for its link */
  test.slow();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const asked: string[] = [];
  page.on("request", r => asked.push(r.url()));
  await page.goto(`/${SEED}?style=glass&angle=135&soft=30&grain=20&speed=10&size=320x180`);
  await live(page);
  /* the module and the worker come with the press, never with the page */
  expect(asked.filter(url => /\.wasm|worker/.test(url))).toEqual([]);
  await expect(page.getByRole("button", { name: "Copy MP4" })).toHaveCount(0);
  await page.getByRole("button", { name: "Copying. Switch to download" }).first().click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download MP4" }).click();
  await expect(page.getByRole("button", { name: "Making MP4. Stop" })).toBeVisible();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`grabient-${SEED}-glass.mp4`);
  const bytes = readFileSync(await file.path());
  await expect(page.getByRole("button", { name: "Download MP4" })).toBeVisible();
  /* a screen reader is told once the file is handed over, where its chip's name stayed the same as it was made */
  await expect(page.locator("[data-announce]")).toHaveText("Downloaded MP4");
  /* the glass's loop of 56 seconds at speed 10, at 60 frames a second, at the size the stage shows */
  expect(await played(page, bytes)).toEqual({ width: 320, height: 180, seconds: 5.6 });

  await page.getByRole("button", { name: "Downloading. Switch to links" }).first().click();
  await page.getByRole("button", { name: "Copy MP4 link" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toBe(
    `${baseURL}/${SEED}.mp4?style=glass&angle=135&soft=30&grain=20&speed=10&w=320&h=180`
  );
  /* development draws a new clip for anyone, as staging and Previews do */
  const served = await request.get(link);
  expect(served.headers()["content-type"]).toBe("video/mp4");
  expect(Buffer.from(await served.body()).equals(bytes)).toBe(true);
});

test("an MP4 being made stops at a press on it, or once the stage shows another clip: its worker goes, no file comes, and its chip downloads again", async ({
  page
}) => {
  const files: string[] = [];
  page.on("download", file => files.push(file.suggestedFilename()));
  /* the card's size at speed 1: a clip of the most work, many seconds to make */
  await page.goto(`/${SEED}?style=rosette`);
  await live(page);
  await page.getByRole("button", { name: "Copying. Switch to download" }).first().click();
  const download = page.getByRole("button", { name: "Download MP4" });
  const making = page.getByRole("button", { name: "Making MP4. Stop" });
  /* the clip's own worker, beside any other the page runs */
  const clips = () => page.workers().filter(worker => /video-worker/.test(worker.url())).length;
  /* a double click makes it once: the press that comes before its ring is not a stop */
  await download.dblclick();
  await expect(making).toBeVisible();
  await expect.poll(clips).toBe(1);
  /* its tooltip says how far along it is, where its name does not */
  await page.mouse.move(0, 0);
  await making.hover();
  await expect(page.getByRole("tooltip")).toHaveText(/^Making MP4, \d+%\. Stop$/);
  await making.click();
  await expect(download).toBeVisible();
  await expect.poll(clips).toBe(0);

  /* another palette on the stage, as a random one is: the clip pressed for is gone from it */
  await download.click();
  await expect(making).toBeVisible();
  await expect.poll(clips).toBe(1);
  const before = new URL(page.url()).pathname;
  await page.keyboard.press("b");
  await expect.poll(() => new URL(page.url()).pathname).not.toBe(before);
  await expect(download).toBeVisible();
  await expect.poll(clips).toBe(0);
  await page.waitForTimeout(500);
  expect(files).toEqual([]);
});
