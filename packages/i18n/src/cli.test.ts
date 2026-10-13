import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { compare, run, scan } from "../scripts/i18n.ts";

/** A repository with these files, relative to its root. */
function repository(files: Record<string, string | object>): string {
  const root = mkdtempSync(join(tmpdir(), "i18n-cli-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(
      join(root, path),
      typeof content === "string" ? content : JSON.stringify(content)
    );
  }
  return root;
}

const CODE = `import { msg, rich, t, translate } from "@grabient/i18n";
const ORDER = msg("Saved", "order");
export function Card(props: { on: boolean }) {
  return <button title={t("Copy link")} aria-label={t(ORDER, { $context: "order" })}>
    {t("{count, plural, one {# palette} other {# palettes}}", { count: 2 })}
    {rich("Read the <link>terms</link>.", { link: words => words })}
    {translate("ja", \`Undo\`)}
  </button>;
}
`;
const messages = (root: string, tag: string) =>
  JSON.parse(readFileSync(join(root, `packages/i18n/messages/${tag}.json`), "utf8"));

test("extract writes the master English from the code, keeping the notes", () => {
  const root = repository({
    "apps/web/src/card.tsx": CODE,
    "apps/web/src/card.test.ts": `t("Only a test")`,
    "packages/i18n/messages/en.json": {
      "Copy link": { note: "Button.", refs: ["old.tsx:1"] },
      Gone: { refs: [] }
    }
  });
  const log: string[] = [];
  expect(run(["extract"], root, line => log.push(line))).toBe(0);
  expect(messages(root, "en")).toEqual({
    "Copy link": { note: "Button.", refs: ["apps/web/src/card.tsx:4"] },
    "Read the <link>terms</link>.": { refs: ["apps/web/src/card.tsx:6"] },
    Undo: { refs: ["apps/web/src/card.tsx:7"] },
    "order\u0004Saved": { refs: ["apps/web/src/card.tsx:2"] },
    "{count, plural, one {# palette} other {# palettes}}": { refs: ["apps/web/src/card.tsx:5"] }
  });
  expect(log[0]).toBe("5 messages (4 new, 1 gone)");
});

test("the scan names a top-level t(), spaces at an edge, a malformed message and a conditional prop", () => {
  const root = repository({
    "packages/ui/src/bad.tsx": `const LABEL = t("Copy link");
export const B = (p: { on: boolean }) => <i title={p.on ? t("On") : t("Off")}>{t(" Edge")}{t("{broken")}</i>;
`
  });
  const { problems } = scan(root);
  expect(problems).toEqual([
    expect.stringMatching(/^packages\/ui\/src\/bad\.tsx:1 t\(\) at a module's top level/),
    expect.stringMatching(
      /^packages\/ui\/src\/bad\.tsx:2 the prop title is a conditional around t\(\)/
    ),
    expect.stringMatching(/^packages\/ui\/src\/bad\.tsx:2 a message with spaces at its edge/),
    expect.stringMatching(/^packages\/ui\/src\/bad\.tsx:2 a malformed message/)
  ]);
});

test("check fails on drift and on a translation that breaks its English", () => {
  const root = repository({
    "apps/web/src/card.tsx": CODE,
    "packages/i18n/messages/ja.json": { "Copy link": "リンクをコピー", Undo: "{oops}" }
  });
  run(["extract"], root, () => {});
  const log: string[] = [];
  expect(run(["check"], root, line => log.push(line))).toBe(1);
  expect(log).toContain('    "Undo": values ["oops"] where the English has []');
  writeFileSync(
    join(root, "packages/i18n/messages/ja.json"),
    JSON.stringify({ "Copy link": "リンクをコピー" })
  );
  expect(run(["check"], root, () => {})).toBe(0);
  expect(run(["check", "--strict"], root, () => {})).toBe(1);
  writeFileSync(join(root, "apps/web/src/new.ts"), `export const f = () => t("New words");`);
  expect(run(["check"], root, line => log.push(line))).toBe(1);
  expect(log).toContain("en.json is behind the code by 1 messages: run pnpm i18n extract");
});

test("pending lists what a language lacks; merge checks each translation; prune drops the gone", () => {
  const root = repository({ "apps/web/src/card.tsx": CODE, "packages/i18n/messages/en.json": {} });
  run(["extract"], root, () => {});
  const out: string[] = [];
  run(["pending", "de"], root, line => out.push(line));
  expect(Object.keys(JSON.parse(out.join("\n")))).toHaveLength(5);
  writeFileSync(
    join(root, "de-done.json"),
    JSON.stringify({
      "Copy link": "Link kopieren",
      Undo: { translation: "{x}" },
      Nothing: "Nichts"
    })
  );
  expect(run(["merge", "de", join(root, "de-done.json")], root, () => {})).toBe(1);
  expect(messages(root, "de")).toEqual({ "Copy link": "Link kopieren" });
  writeFileSync(
    join(root, "packages/i18n/messages/de.json"),
    JSON.stringify({ "Copy link": "x", Old: "y" })
  );
  run(["prune"], root, () => {});
  expect(messages(root, "de")).toEqual({ "Copy link": "x" });
});

test("a plural must offer every form its language has, unless exact cases and other write every count", () => {
  const source = "{count, plural, one {# palette} other {# palettes}}";
  expect(compare("ru", source, "{count, plural, one {#} other {#}}")).toEqual([
    "the plural {count} lacks few, many for ru"
  ]);
  expect(compare("ru", source, "{count, plural, one {#} few {#} many {#} other {#}}")).toEqual([]);
  expect(compare("ru", source, "{count, plural, =1 {#} other {#}}")).toEqual([]);
  expect(compare("de", source, "{count} Paletten")).toEqual([
    "a plural in the English is not one here"
  ]);
  expect(compare("ja", source, "{count} 個")).toEqual([]);
});
