import { describe, expect, test } from "vitest";
import { randomFile } from "./random.ts";
import { namedPalette } from "./resolve.ts";

/** The address the palette's own file is asked for in a random picture's place, or the redirect sent instead. */
async function answered(address: string, extension: "svg" | "png" = "svg") {
  let asked: string | undefined;
  const response = await randomFile(
    new Request(`https://grabient.test${address}`),
    extension,
    async request => {
      asked = request.url.replace("https://grabient.test", "");
      return new Response("drawn");
    }
  );
  return { asked, status: response.status, location: response.headers.get("Location") };
}

describe("a random palette's picture", () => {
  test("a name draws its palette every time, asked of the palette's own address in the view asked for", async () => {
    const { seed } = namedPalette("lee");
    expect(await answered("/random.svg?name=lee&steps=8")).toEqual({
      asked: `/${seed}.svg?name=lee&steps=8`,
      status: 200,
      location: null
    });
    expect((await answered("/random.png?amp;name=lee&size=64x64", "png")).asked).toBe(
      `/${seed}.png?amp;name=lee&size=64x64`
    );
    expect(namedPalette("ada").seed).not.toBe(seed);
  });

  test("the names an app gave its accounts keep their palettes: a generator that draws others changes every avatar", () => {
    expect(
      ["lee", "ada", "jane@example.com", "Ïrma", ""].map(name => namedPalette(name).seed)
    ).toEqual([
      "kYYKCZyrI_uiQwbcn8Lwb9DDPQQc",
      "kc5gBd8wFAfMDwTxhcFYgXA0wDwA7AT_uQA_4",
      "kWjhAILopASQQQEbmUBFKRAQ",
      "kaFAW3l4G_6WAP8zAL_QIE_s6CP7cAr-A",
      "kWuknGM5e_44XOSzHzQVKS_Y"
    ]);
  });

  test("with no name, a new palette each time, sent to its own address with the view asked for", async () => {
    const first = await answered("/random.png?style=radialGradient&size=64x64", "png");
    expect(first).toMatchObject({ asked: undefined, status: 302 });
    expect(first.location).toMatch(
      /^https:\/\/grabient\.test\/k[\w-]+\.png\?style=radialGradient&size=64x64$/
    );
    expect(
      (await answered("/random.png?style=radialGradient&size=64x64", "png")).location
    ).not.toBe(first.location);
  });
});
