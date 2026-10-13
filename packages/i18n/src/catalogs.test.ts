import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { buildCatalogs } from "../vite.ts";
import { messageKey } from "./message-key.ts";

function messages(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "i18n-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(content));
  }
  return `${dir}/`;
}

test("a catalog holds the translations of messages en.json still lists, keyed and hashed", () => {
  const built = buildCatalogs(
    messages({
      en: { "Copy link": { note: "", refs: [] }, Undo: { note: "", refs: [] } },
      ja: { "Copy link": "リンクをコピー", Undo: "", Gone: "消えた" }
    })
  );
  const ja = built.get("ja")!;
  expect(JSON.parse(ja.source)).toEqual({ [messageKey("Copy link")]: "リンクをコピー" });
  expect(ja.fileName).toMatch(/^assets\/i18n-ja-[0-9a-f]{10}\.json$/);
  // a language without a file ships an empty catalog and reads in English
  expect(built.get("pt-BR")).toMatchObject({ source: "{}" });
  expect(built.get("pt-BR")!.fileName).toMatch(/^assets\/i18n-pt-br-/);
  expect(built.has("en")).toBe(false);
});

test("two messages with one key are refused", () => {
  // FNV-1a gives both the key rbf4p7
  const dir = messages({
    en: { "Palette 522789": {}, "Palette 739192": {} },
    de: { "Palette 522789": "a", "Palette 739192": "b" }
  });
  expect(() => buildCatalogs(dir)).toThrow(/share the key rbf4p7/);
});
