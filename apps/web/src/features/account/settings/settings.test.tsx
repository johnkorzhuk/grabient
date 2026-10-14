import { renderToString } from "@solidjs/web";
import { describe, expect, test } from "vitest";
import { ColorFormatSetting, MotionSetting, ThemeSetting } from "./Appearance.tsx";
import { Profile } from "./Profile.tsx";

/* Settings as the server draws it, for anyone: it reads no session and knows none of the browser's choices, so the
   document holds every place and says only what is true for every reader. */

const count = (markup: string, piece: string) => markup.split(piece).length - 1;
const tag = (markup: string, id: string) => markup.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0];

describe("Settings in the server's document", () => {
  test("the profile holds the way in and the form's shape, unmarked, for the document's head to show one", () => {
    const html = renderToString(() => (
      <Profile back="/settings" name={() => ""} onSaved={() => {}} notice={() => ""} />
    ));
    expect(tag(html, "profile")).not.toContain("data-for");
    expect(html).toContain('href="/login?redirect=%2Fsettings"');
    expect(html).toMatch(/class="visitor"[^>]*><p[^>]*>Sign in to change your profile\./);
    expect(html).toMatch(/class="account"[^>]*><p[^>]*>Update your username and avatar\./);
    // the form's shape, kept from a screen reader, and no form
    expect(html).toMatch(/class="form account"[^>]*aria-hidden="true"/);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
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
