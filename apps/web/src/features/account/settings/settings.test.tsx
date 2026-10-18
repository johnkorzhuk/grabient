import { renderToString } from "@solidjs/web";
import { QueryClientProvider } from "@tanstack/solid-query";
import { describe, expect, test } from "vitest";
import { createQueryClient } from "../../../lib/query.ts";
import { ColorFormatSetting, MotionSetting, ThemeSetting } from "./Appearance.tsx";
import { Profile } from "./Profile.tsx";

/* Settings as the server draws it, for anyone: it reads no session and knows none of the browser's choices, so the
   document holds every place and says only what is true for every reader. */

const count = (markup: string, piece: string) => markup.split(piece).length - 1;
const tag = (markup: string, id: string) => markup.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0];

describe("Settings in the server's document", () => {
  test("the profile holds the way in and the account's form, unmarked, for the document's head to show one", () => {
    // under the query client every page has (router.tsx), which the profile shares with Privacy
    const html = renderToString(() => (
      <QueryClientProvider client={createQueryClient()}>
        <Profile back="/settings" name={() => ""} onSaved={() => {}} notice={() => ""} />
      </QueryClientProvider>
    ));
    expect(tag(html, "profile")).not.toContain("data-for");
    expect(html).toContain('href="/login?redirect=%2Fsettings"');
    expect(html).toMatch(/class="visitor"[^>]*><p[^>]*>Sign in to change your profile\./);
    expect(html).toMatch(/class="account"[^>]*><p[^>]*>Update your username and avatar\./);
    // the form stands where it will, and nothing in it can be changed or sent before the account answers
    expect(html).toMatch(/<form[^>]*class="form account"/);
    expect(html).toMatch(/<input[^>]*name="username"[^>]*disabled/);
    const presses = html.match(/<button[^>]*>/g) ?? [];
    expect(presses.length).toBeGreaterThan(0);
    expect(presses.every(press => /\bdisabled\b/.test(press))).toBe(true);
  });

  test("this browser's choices keep their room and say nothing", () => {
    const html = renderToString(() => (
      <>
        <ThemeSetting />
        <MotionSetting />
        <ColorFormatSetting />
      </>
    ));
    for (const id of ["theme-line", "motion-line", "color-format-line"]) {
      expect(tag(html, id)).toContain("unseen");
    }
    // every word a press can say is in the document, to hold the press's width, and none is seen
    const words = html.match(/<span class="[^"]*cell[^"]*">[^<]+<\/span>/g) ?? [];
    expect(words).toHaveLength(3 + 3 + 4);
    expect(words.every(word => word.includes("unseen"))).toBe(true);
    expect(count(html, "<h2")).toBe(3);
  });
});
