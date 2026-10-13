import { describe, expect, it } from "vitest";
import {
  insertRows,
  LITE,
  literal,
  local,
  PRODUCTION,
  readOnly,
  requests,
  STAGING,
  writable
} from "./d1.ts";

describe("D1 access", () => {
  it("reads with one SELECT and nothing else", () => {
    expect(readOnly("SELECT 1")).toBe("SELECT 1");
    for (const sql of [
      "DELETE FROM likes",
      "SELECT 1; DROP TABLE likes",
      "WITH x AS (SELECT 1) DELETE FROM likes"
    ]) {
      expect(() => readOnly(sql)).toThrow(/single SELECT/);
    }
  });

  it("writes grabient-staging and local copies alone", () => {
    expect(writable(STAGING)).toBe(STAGING);
    expect(writable(local("/tmp/x")).persist).toBe("/tmp/x");
    for (const db of [PRODUCTION, LITE, { ...local("/tmp/x"), id: PRODUCTION.id }]) {
      expect(() => writable(db)).toThrow(/Refusing/);
    }
  });

  it("writes values as SQL literals", () => {
    expect(literal(null)).toBe("NULL");
    expect(literal("it's")).toBe("'it''s'");
    expect(literal(0.1 + 0.2)).toBe("0.30000000000000004");
    expect(() => literal(Number.NaN)).toThrow();
  });

  it("groups statements under D1's sizes, in order", () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      id: `row-${i}`,
      text: "x".repeat(200)
    }));
    const statements = insertRows("t", ["id", "text"], rows);
    expect(statements.every(sql => Buffer.byteLength(sql) < 41_000)).toBe(true);
    const parts = requests(statements);
    expect(parts.flat().join(";\n")).toBe(statements.join(";\n"));
    for (const part of parts) {
      expect(part.every(entry => Buffer.byteLength(entry) < 90_000)).toBe(true);
      expect(Buffer.byteLength(part.join(""))).toBeLessThan(1_000_000);
    }
  });
});
