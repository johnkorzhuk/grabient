import { expect, it } from "vitest";
import { attribution } from "./attribution.ts";

const cookie = (value: unknown) =>
  new Headers({ cookie: `other=1; gb_attr=${encodeURIComponent(JSON.stringify(value))}; x=2` });

it("reads a new account's first visit from its cookie, trimmed and bounded", () => {
  expect(attribution(new Headers())).toEqual({});
  expect(
    attribution(
      cookie({
        s: "google",
        m: "cpc",
        c: "fall",
        r: "news.example",
        l: "/palettes",
        t: 1_700_000_000_000
      })
    )
  ).toEqual({
    attributionSource: "google",
    attributionMedium: "cpc",
    attributionCampaign: "fall",
    attributionReferrer: "news.example",
    attributionLanding: "/palettes",
    attributionAt: new Date("2023-11-14T22:13:20.000Z")
  });
  const long = cookie({ s: `  ${"x".repeat(300)}  `, m: "", c: 7, t: "yesterday" });
  expect(attribution(long)).toEqual({ attributionSource: "x".repeat(200) });
  expect(attribution(cookie({ s: "a", t: Number.NaN }))).toEqual({ attributionSource: "a" });
  expect(attribution(new Headers({ cookie: "gb_attr=%7Bnope" }))).toEqual({});
  expect(attribution(cookie(["a"]))).toEqual({});
});
