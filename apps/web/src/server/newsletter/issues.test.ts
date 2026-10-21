import { readdirSync, readFileSync } from "node:fs";
import { type Issue, type IssueContent, issuePage, newsletter, text } from "@grabient/email";
import { localizePath } from "@grabient/i18n";
import { describe, expect, test } from "vitest";
import { meaning } from "../../../../../packages/email/test/support.ts";
import { ISSUES } from "./issues/index.ts";
import {
  asRun,
  endedBy,
  type IssueFacts,
  leadOptions,
  ledBy,
  NO_FACTS,
  nameOf,
  tipOptions
} from "./lead.ts";
import { issueFoot } from "./list.ts";
import { draftsAmong, drawn, publishedPage, testIssue } from "./page.ts";
import { draftWords, leaks } from "./private.ts";
import { beforeOf, issuesKey, languageOf } from "./query.ts";
import { tagLinks } from "./sends.ts";

const ORIGIN = "https://grabient.test";
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const byNumber = (n: number) => ISSUES.find(issue => issue.number === n) as Issue;
/* No. 1's picks under the titles staging's gallery gave them; No. 2's go by their colors */
const FACTS: IssueFacts = {
  leads: new Map(),
  tips: new Map(),
  names: new Map([
    ["kWMS7qPZ68084TQkCrUnaNBo", "Smoky aubergine ember beam"],
    ["kU9ClB669AFIzOk9Lj2g", "Golden rust ember glow"],
    ["kWziAlUZi-bxAvSmqr2kRe7g", "Ember Sunset Bloom"],
    ["kUby9y5jE3PaQwI4IDlg", "Leaf green marigold and ivory fan"],
    ["kUkSoUPQrBKiNOiSm75A", "Dusty rose charcoal bands"]
  ])
};
const run = (n: number, facts = FACTS) => asRun(byNumber(n), ORIGIN, facts);
/* a reader's foot, with the sample token that names no account */
const footFor = (locale: "en" | "ar") =>
  issueFoot({
    locale,
    unsubscribe: ORIGIN + localizePath(`/unsubscribe/${"0".repeat(64)}`, locale)
  });

describe("the issues", () => {
  test("each has its own number and month, and a published one its day", () => {
    expect(new Set(ISSUES.map(issue => issue.number)).size).toBe(ISSUES.length);
    for (const issue of ISSUES) {
      expect(issue.month).toMatch(/^\d{4}-(?:0[1-9]|1[0-2])$/);
      if (issue.published) expect(issue.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(ISSUES.some(issue => issue.published)).toBe(true);
  });
  test.each(ISSUES.map(issue => [issue.number, issue] as const))(
    "No. %i can be made, as an email under Gmail's clip and as a page that says the same",
    (_, issue) => {
      const words = asRun(issue, ORIGIN, FACTS);
      const letter = newsletter({ ...words, ...footFor("en"), origin: ORIGIN });
      expect(Buffer.byteLength(letter.html)).toBeLessThan(102 * 1024);
      expect(letter.text).toContain(words.title);
      expect(issuePage({ ...words, ...footFor("en"), origin: ORIGIN }).text).toBe(letter.text);
    }
  );
  test.each([
    ["001-email-en", 1, "en"],
    ["001-email-ar", 1, "ar"],
    ["002-email-en", 2, "en"],
    ["002-email-ar", 2, "ar"]
  ] as const)("%s is the email the issue sends", (name, number, locale) => {
    const letter = newsletter({ ...run(number), ...footFor(locale), origin: ORIGIN });
    expect(letter.text).toBe(fixture(`${name}.txt`));
    expect(meaning(letter.html)).toBe(meaning(fixture(`${name}.html`)));
  });
  test.each([
    ["001-page-en", 1],
    ["002-page-en", 2]
  ] as const)("%s is the sheet /newsletter shows", (name, number) => {
    const foot = issueFoot({ locale: "en", unsubscribe: `${ORIGIN}/unsubscribe` });
    const page = issuePage({ ...run(number), ...foot, origin: ORIGIN });
    expect(page.text).toBe(fixture(`${name}.txt`));
    expect(meaning(page.html)).toBe(meaning(fixture(`${name}.html`)));
  });
  test("a send's letter tags its links to the site's pages with the issue's campaign, and nothing else", () => {
    const tags = (n: number) => `utm_source=newsletter&utm_medium=email&utm_campaign=issue-${n}`;
    const one = newsletter({ ...run(1), ...footFor("en"), origin: ORIGIN });
    const sent = tagLinks(one, ORIGIN, 1);
    // in the markup each & is written as the email writes it, after the address's own query
    expect(sent.html).toContain(`href="${ORIGIN}/collections?${tags(1).replaceAll("&", "&#38;")}"`);
    expect(sent.html).toContain(
      `href="${ORIGIN}/kWziAlUZi-bxAvSmqr2kRe7g?style=angularSwatches&#38;steps=32&#38;angle=0&#38;${tags(1).replaceAll("&", "&#38;")}"`
    );
    expect(sent.text).toContain(`${ORIGIN}/palettes/rising?${tags(1)}\n`);
    // the way out and the pictures keep none
    expect(sent.html).toContain(`href="${ORIGIN}/unsubscribe/${"0".repeat(64)}"`);
    const pictures = (html: string) => [...html.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
    expect(pictures(sent.html)).toEqual(pictures(one.html));
    // every link to a page has them, once
    for (const [, href] of sent.html.matchAll(/href="([^"]+)"/g)) {
      const page = href!.startsWith(ORIGIN) && !href!.includes("/unsubscribe/");
      expect(href!.split("utm_source=").length - 1).toBe(page ? 1 : 0);
    }
    // another site's address keeps its own, the MCP's inside it too
    const two = tagLinks(newsletter({ ...run(2), ...footFor("en"), origin: ORIGIN }), ORIGIN, 2);
    expect(two.html).toContain(
      `href="https://claude.ai/customize/connectors?modal=add-custom-connector&#38;connectorName=Grabient&#38;connectorUrl=${encodeURIComponent(`${ORIGIN}/mcp`)}"`
    );
    expect(two.html).toContain(`href="${ORIGIN}/mcp-server?${tags(2).replaceAll("&", "&#38;")}"`);
  });
  test("No. 2's one press into another app is Claude's own add-connector link", () => {
    const letter = newsletter({ ...run(2), ...footFor("en"), origin: ORIGIN });
    const outside = [...letter.text.matchAll(/https:\/\/\S+/g)]
      .map(m => m[0].replace(/\)$/, ""))
      .filter(href => !href.startsWith(ORIGIN));
    expect(outside).toEqual([
      `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Grabient&connectorUrl=${encodeURIComponent(`${ORIGIN}/mcp`)}`
    ]);
  });
  test("a reader's foot is in the reader's language", () => {
    const token = "ab".repeat(32);
    expect(
      issueFoot({
        locale: "ja",
        unsubscribe: `${ORIGIN}${localizePath(`/unsubscribe/${token}`, "ja")}`
      })
    ).toEqual(JSON.parse(fixture("issue-foot-ja.json")));
  });
});

describe("the issues as pages", () => {
  /* the suite's own issues: three published and one not, two to a page */
  const made = (number: number, published?: string): Issue => ({
    number,
    month: `2026-0${number}`,
    published,
    write: () => ({
      subject: `S${number}`,
      title: `Issue ${number}`,
      liked: [],
      body: [text(`Words of ${number}.`)]
    })
  });
  const four = [made(2, "2026-02-01"), made(4), made(1, "2026-01-01"), made(3, "2026-03-01")];
  test("published issues come newest first, two to a page, each page naming the next", () => {
    const one = publishedPage(four, ORIGIN);
    const two = publishedPage(four, ORIGIN, "en", one.next ?? undefined);
    expect([one.issues.map(issue => issue.number), one.next]).toEqual([[3, 2], 2]);
    expect([two.issues.map(issue => issue.number), two.next]).toEqual([[1], null]);
    expect(publishedPage(four, ORIGIN, "en", 1)).toEqual({ issues: [], next: null });
  });
  test("an admin's test sends this month's issue, else the nearest month's, the coming one where two are as near", () => {
    const on = (day: string) => Date.parse(`${day}T12:00:00Z`);
    // the suite's issues are for January to April 2026
    expect(testIssue(four, on("2026-03-15")).number).toBe(3);
    expect(testIssue(four, on("2026-04-01")).number).toBe(4);
    expect(testIssue(four, on("2025-11-20")).number).toBe(1);
    expect(testIssue(four, on("2026-09-30")).number).toBe(4);
    expect(testIssue([made(1), made(3)], on("2026-02-10")).number).toBe(3);
    // as the issues stand: October's in October, November's from November
    expect(testIssue(ISSUES, on("2026-10-15"))).toBe(byNumber(1));
    expect(testIssue(ISSUES, on("2026-11-03"))).toBe(byNumber(2));
  });

  test("drafts are the issues with no day, newest first", () => {
    expect(draftsAmong(four, ORIGIN).map(issue => [issue.number, issue.month])).toEqual([
      [4, "2026-04"]
    ]);
  });
  test("each is its email's sheet on the page's own paper, its foot naming no reader", () => {
    const [issue] = publishedPage(ISSUES, ORIGIN).issues;
    expect(
      issue.html.startsWith(
        "<style>.inset{container-type:inline-size}.sheet{background-color:var(--color-paper-solid)!important"
      )
    ).toBe(true);
    expect(issue.html).toMatch(/<td class="sheet" /);
    expect(issue.html).toMatch(
      /<span data-part="head" role="img" aria-label="Grabient"[^>]*><svg /
    );
    // a palette is drawn, never a picture: the only pictures are the issue's own files
    expect(issue.html).not.toMatch(/<h1\b|\/api\/og\?|class="[^"]*\bwash\b/);
    for (const [picture] of issue.html.matchAll(/<img\b[^>]*>/g)) {
      expect(picture).toMatch(new RegExp(`src="${ORIGIN}/email/[\\w-]+\\.(?:gif|png)"`));
    }
    expect(issue.html).toContain(`<a class="ink" href="${ORIGIN}/unsubscribe"`);
    expect(issue.html).not.toMatch(/unsubscribe\/[0-9a-f]/);
  });
  test("its links lead to the reader's language", () => {
    const seedLink = /href="https:\/\/grabient\.test\/(ja\/)?k[\w-]{10,}/;
    expect(seedLink.exec(publishedPage(ISSUES, ORIGIN, "ja").issues[0].html)?.[1]).toBe("ja/");
    expect(seedLink.exec(publishedPage(ISSUES, ORIGIN).issues[0].html)?.[1]).toBeUndefined();
  });
  test("a request's before and language are read as the API reads them", () => {
    const params = (query: string) => new URLSearchParams(query);
    expect([
      beforeOf(params("before=12")),
      beforeOf(params("before=0")),
      beforeOf(params("before=x"))
    ]).toEqual([12, null, null]);
    expect([languageOf(params("lang=ja")), languageOf(params("lang=xx"))]).toEqual(["ja", "en"]);
    expect(issuesKey(params("lang=en&before=012&junk=1")).toString()).toBe("");
    expect(issuesKey(params("junk=1&lang=ja&before=3")).toString()).toBe("before=3&lang=ja");
  });
});

describe("an issue's lead", () => {
  const october = byNumber(1);
  const words = october.write(ORIGIN);
  const seeds = (content: { picks?: readonly { seed: string }[] }) =>
    (content.picks ?? []).map(chosen => chosen.seed);
  const [first, second, third] = seeds(words);
  const extra = october.leads?.[0]?.seed ?? "";
  test("offers the picks, then the issue's own leads, each once", () => {
    const offered = leadOptions(october, words).map(option => option.seed);
    expect(offered.slice(0, 5)).toEqual(seeds(words));
    expect(offered.slice(5)).toEqual((october.leads ?? []).map(option => option.seed));
    expect(new Set(offered).size).toBe(offered.length);
  });
  test("a pick chosen trades places with the first, and an offered palette takes the first's place", () => {
    expect(seeds(ledBy(october, words, third)).slice(0, 3)).toEqual([third, second, first]);
    expect(seeds(ledBy(october, words, extra))).toEqual([extra, ...seeds(words).slice(1)]);
    expect(ledBy(october, words, first)).toBe(words);
    expect(ledBy(october, words, "kNotOffered00000")).toBe(words);
    expect(ledBy(october, words, undefined)).toBe(words);
  });
  test("leads with the admin's choice, and every palette it offers may lead", () => {
    const chosen = asRun(october, ORIGIN, { ...FACTS, leads: new Map([[1, extra]]) });
    expect(chosen.picks?.[0]).toMatchObject({ seed: extra, note: "Linear" });
    for (const option of leadOptions(october, words)) {
      const page = drawn(october, ORIGIN, "en", FACTS, option.seed).html;
      expect(page).toMatch(/<td dir="ltr" data-part="lead"/);
      expect(page).toContain(`href="${ORIGIN}/${option.seed}`);
    }
  });
  test("names each pick as its page does: the title written for it while it is drawn as it was saved, else its colors' name", () => {
    const named = run(1);
    expect(named.picks?.map(chosen => chosen.name)).toEqual([...FACTS.names.values()]);
    const plain = asRun(october, ORIGIN, NO_FACTS);
    expect(plain.picks?.[0]?.name).toBe(
      nameOf({ seed: first, style: "linearGradient", steps: 40, angle: 135 })
    );
    expect(plain.picks?.[0]?.name).toMatch(/^[A-Z][a-z]/);
    // a title the colors contradict is passed over, as the palette's page passes it over
    const view = { seed: first, style: "linearGradient", steps: 40, angle: 135 } as const;
    const saved = { style: "linearGradient", steps: 40, angle: 135 } as const;
    expect(nameOf(view, { title: "Bright lime and cyan", view: saved })).toBe(nameOf(view));
    expect(nameOf(view, { title: "Smoky aubergine ember beam", view: saved })).toBe(
      "Smoky aubergine ember beam"
    );
    // at another angle it keeps the title; in another style or steps its colors name it
    expect(
      nameOf(view, { title: "Smoky aubergine ember beam", view: { ...saved, angle: 90 } })
    ).toBe("Smoky aubergine ember beam");
    for (const other of [
      { ...saved, style: "radialSwatches" },
      { ...saved, steps: 41 }
    ] as const)
      expect(nameOf(view, { title: "Smoky aubergine ember beam", view: other })).toBe(nameOf(view));
  });
});

describe("an issue's quick tip", () => {
  const october = byNumber(1);
  const words = october.write(ORIGIN);
  const ids = (content: IssueContent) => tipOptions(content).map(tip => tip.id);
  const letterOf = (content: IssueContent) =>
    newsletter({ ...content, ...footFor("en"), origin: ORIGIN });
  /* the tip's part of an email or a page, up to the foot's links */
  const tipPart = (html: string) =>
    html.slice(html.indexOf('data-part="tip"'), html.indexOf('data-part="links"'));
  test("October offers its tips each once, and ends with the first until an admin chooses another", () => {
    const offered = ids(words);
    expect(offered.length).toBeGreaterThanOrEqual(5);
    expect(new Set(offered).size).toBe(offered.length);
    expect(asRun(october, ORIGIN, FACTS).tips?.[0]?.id).toBe("css");
    const chosen = asRun(october, ORIGIN, { ...FACTS, tips: new Map([[1, offered[1]]]) });
    expect(ids(chosen)).toEqual([offered[1], ...offered.filter(id => id !== offered[1])]);
    // one it does not offer, or none, leaves the issue as it is written
    expect(endedBy(words, "kNotATip")).toBe(words);
    expect(endedBy(words, offered[0])).toBe(words);
    expect(endedBy(words, undefined)).toBe(words);
  });
  test("draws each tip it offers under the Quick tip heading, its links the site's, its email under Gmail's clip", () => {
    const texts = new Set<string>();
    for (const tip of tipOptions(words)) {
      const content = asRun(october, ORIGIN, FACTS, undefined, tip.id);
      const letter = letterOf(content);
      expect(Buffer.byteLength(letter.html)).toBeLessThan(102 * 1024);
      const part = tipPart(letter.html);
      expect(part).toContain("Quick tip");
      for (const [, href] of part.matchAll(/href="([^"]+)"/g))
        expect(href).toMatch(/^https:\/\/grabient\.test\//);
      expect(issuePage({ ...content, ...footFor("en"), origin: ORIGIN }).text).toBe(letter.text);
      expect(tipPart(drawn(october, ORIGIN, "en", FACTS, undefined, tip.id).html)).toContain(
        "Quick tip"
      );
      texts.add(letter.text);
    }
    expect(texts.size).toBe(tipOptions(words).length);
  });
  test("the hex tip shows the color it searches for beside its button", () => {
    const part = tipPart(letterOf(asRun(october, ORIGIN, FACTS, undefined, "hex")).html);
    expect(part).toMatch(/<table\b[^>]*data-part="swatch"[^>]*><tr><td\b[^>]*bgcolor="#bada55"/);
    expect(part).toContain(`href="${ORIGIN}/palettes?q=%23bada55"`);
  });
  test("an issue that offers none ends without one", () => {
    const november = byNumber(2);
    expect(tipOptions(november.write(ORIGIN))).toEqual([]);
    expect(drawn(november, ORIGIN, "en", FACTS).html).not.toContain('data-part="tip"');
  });
});

describe("drafts stay private", () => {
  test("the build's check finds a draft's subject or title in a file the browser is given", () => {
    const words = draftWords();
    const drafts = ISSUES.filter(issue => !issue.published);
    expect(words).toHaveLength(2 * drafts.length);
    expect(words).toContain("Rising in November, and Grabient in your AI app");
    expect(leaks([["assets/a.js", "const x = 1;"]], words)).toEqual([]);
    expect(leaks([["assets/b.js", `"${words[1]}"`]], words)).toEqual([
      `assets/b.js: ${JSON.stringify(words[1])}`
    ]);
  });
  test("no published page or public answer holds a draft's words", () => {
    const published = JSON.stringify([
      publishedPage(ISSUES, ORIGIN),
      publishedPage(ISSUES, ORIGIN, "ja")
    ]);
    for (const words of draftWords()) expect(published).not.toContain(words);
  });
  test("only the newsletter's server modules read the issues", () => {
    const src = new URL("../../", import.meta.url);
    const importers = readdirSync(src, { recursive: true, encoding: "utf8" })
      .filter(name => /\.tsx?$/.test(name))
      .filter(name =>
        /from "[^"]*issues\/(?:index|\d+)\.ts"/.test(readFileSync(new URL(name, src), "utf8"))
      );
    for (const name of importers) expect(name).toMatch(/^server\/newsletter\/[\w.-]+\.ts$/);
    expect(importers.length).toBeGreaterThan(0);
  });
});
