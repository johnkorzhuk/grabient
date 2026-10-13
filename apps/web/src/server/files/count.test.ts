import { expect, test } from "vitest";
import { countFile } from "./count.ts";

test("a file fetched is counted by its format and by who asked, a page of the site, another or none", () => {
  const points: string[] = [];
  const env = {
    USAGE: {
      writeDataPoint: (point: { blobs: string[] }) => void points.push(point.blobs.join(" "))
    }
  } as never;
  const fetched = (path: string, headers: Record<string, string> = {}, method = "GET") =>
    countFile(env, new Request(`https://grabient.test${path}`, { method, headers }), path);
  fetched("/kS7Q8Yy5S_SChv0.css", { "Sec-Fetch-Site": "same-origin" });
  fetched("/kS7Q8Yy5S_SChv0.tokens.json", { Referer: "https://example.com/post" });
  fetched("/@ada/warm-sunsets.md", { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" });
  fetched("/kS7Q8Yy5S_SChv0.png", { "Sec-Fetch-Site": "cross-site" });
  fetched("/kS7Q8Yy5S_SChv0.svg", { Referer: "https://grabient.test/palettes" });
  fetched("/kS7Q8Yy5S_SChv0.svg", {}, "HEAD");
  fetched("/palettes");
  expect(points).toEqual([
    "file css site reader",
    "file tokens.json other reader",
    "file md none crawler",
    "file png other reader",
    "file svg site reader"
  ]);
});
