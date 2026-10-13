import { LOCALES, messageKey } from "@grabient/i18n";
import { expect, test } from "vitest";
import { mcpViewHtml } from "./build.ts";
import { MESSAGES_ID, ORIGIN_META } from "./page.ts";

/* The page an AI app draws: one file, built as it ships, that asks for nothing outside itself and carries the words
   of every language it can be read in. */

test("the view builds to one page that loads nothing from outside", async () => {
  const html = await mcpViewHtml();
  expect(html).toContain(ORIGIN_META);
  // no file, stylesheet, image or font is fetched: no address in an attribute, no import, no url() but a fragment
  expect(html).not.toMatch(/\s(src|href|srcset)=/i);
  expect(html).not.toMatch(/@import|url\((?!["']?(#|data:))/);
  expect(html.match(/<script/g)).toHaveLength(2);
  expect(html.length).toBeLessThan(400_000);
  const words = html.match(
    new RegExp(`<script type="application/json" id="${MESSAGES_ID}">(.*?)</script>`, "s")
  );
  const catalogs = JSON.parse(words?.[1] ?? "{}") as Record<string, Record<string, string>>;
  expect(Object.keys(catalogs).sort()).toEqual(LOCALES.filter(l => l !== "en").sort());
  for (const message of [
    "Open on Grabient",
    "Couldn't load palettes.",
    "Palette {number}: {name}",
    "Copy {hex}"
  ])
    expect(catalogs.ja[messageKey(message)], message).toBeTruthy();
}, 60_000);
