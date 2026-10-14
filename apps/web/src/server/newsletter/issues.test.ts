import { readdirSync, readFileSync } from "node:fs";
import { type Issue, issuePage, newsletter, text } from "@grabient/email";
import { localizePath } from "@grabient/i18n";
import { describe, expect, test } from "vitest";
import { meaning } from "../../../../../packages/email/test/support.ts";
import { ISSUES } from "./issues/index.ts";
import { issueFoot } from "./list.ts";
import { beforeOf, draftsAmong, issuesKey, languageOf, publishedPage } from "./page.ts";
import { draftWords, leaks } from "./private.ts";

const ORIGIN = "https://grabient.test";
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const byNumber = (n: number) => ISSUES.find(issue => issue.number === n) as Issue;
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
      const words = issue.write(ORIGIN);
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
    const letter = newsletter({
      ...byNumber(number).write(ORIGIN),
      ...footFor(locale),
      origin: ORIGIN
    });
    expect(letter.text).toBe(fixture(`${name}.txt`));
    expect(meaning(letter.html)).toBe(meaning(fixture(`${name}.html`)));
  });
  test.each([
    ["001-page-en", 1],
    ["002-page-en", 2]
  ] as const)("%s is the sheet /newsletter shows", (name, number) => {
    const foot = issueFoot({ locale: "en", unsubscribe: `${ORIGIN}/unsubscribe` });
    const page = issuePage({ ...byNumber(number).write(ORIGIN), ...foot, origin: ORIGIN });
    expect(page.text).toBe(fixture(`${name}.txt`));
    expect(meaning(page.html)).toBe(meaning(fixture(`${name}.html`)));
  });
  test("No. 2's one press into another app is Claude's own add-connector link", () => {
    const letter = newsletter({ ...byNumber(2).write(ORIGIN), ...footFor("en"), origin: ORIGIN });
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
    expect(issue.html).not.toMatch(/<img\b|<h1\b|\/api\/og\?|class="[^"]*\bwash\b/);
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
