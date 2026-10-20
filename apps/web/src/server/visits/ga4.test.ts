import { expect, test } from "vitest";
import { ga4Body, ga4Path } from "./ga4.ts";

test("an account's collection reaches GA4 by its kind, never its owner's handle", () => {
  expect(ga4Path("/@ada/warm-tones")).toBe("/@/collection");
  expect(ga4Path("/ja/@ada/warm-tones/rising")).toBe("/ja/@/collection");
  expect(ga4Path("/ocean-gradients")).toBe("/ocean-gradients");
  expect(ga4Path("/")).toBe("/");
});

test("a landing with campaign tags tells GA4 the campaign first, then the page, one session a day", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const body = ga4Body(
    {
      visitor: "0123456789abcdef",
      what: "landing",
      path: "/palettes",
      country: "US",
      region: "CA",
      european: false,
      device: "mobile",
      browser: "Safari 19",
      system: "iOS",
      language: "en-US",
      referrer: "news.ycombinator.com",
      source: "newsletter",
      medium: "email",
      campaign: "october"
    },
    now
  );
  const session = { session_id: String(Math.floor(now / 86_400_000)), engagement_time_msec: 1 };
  expect(body).toEqual({
    client_id: "0123456789abcdef",
    timestamp_micros: now * 1000,
    non_personalized_ads: true,
    user_location: { country_id: "US", region_id: "US-CA" },
    device: {
      category: "mobile",
      language: "en-US",
      operating_system: "iOS",
      browser: "Safari",
      browser_version: "19"
    },
    events: [
      {
        name: "campaign_details",
        params: { source: "newsletter", medium: "email", campaign: "october", ...session }
      },
      {
        name: "page_view",
        params: {
          page_location: "https://grabient.com/palettes",
          page_referrer: "https://news.ycombinator.com/",
          ...session
        }
      }
    ]
  });
});

test("a palette used is an event of its own, and a page in a partner's frame says so", () => {
  const hit = {
    visitor: "0123456789abcdef",
    path: "/",
    country: "BR",
    region: "",
    european: false,
    device: "desktop",
    browser: "other",
    system: "other",
    language: "",
    referrer: "",
    source: "",
    medium: "",
    campaign: ""
  };
  const used = ga4Body({ ...hit, what: "use" }, 0);
  expect(used.events).toEqual([
    {
      name: "use_palette",
      params: { page_location: "https://grabient.com/", session_id: "0", engagement_time_msec: 1 }
    }
  ]);
  expect(used.user_location).toEqual({ country_id: "BR" });
  expect(used.device).toEqual({ category: "desktop" });
  const framed = ga4Body({ ...hit, what: "framed" }, 0);
  expect((framed.events as { params: Record<string, unknown> }[])[0]!.params.framed).toBe("yes");
});
