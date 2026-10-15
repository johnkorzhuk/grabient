import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { carriedWork, dropStatements, loadStatements } from "./load.ts";
import type { Snapshot } from "./snapshot.ts";
import { copyOf, lite, memory, production, run, snapshotOf, unloaded } from "./testing.ts";

let copy: Snapshot;
beforeAll(async () => {
  const { db } = await copyOf({
    production: await production(),
    lite: await lite(),
    staging: await unloaded()
  });
  copy = await snapshotOf(db, 1000);
});

describe("the load", () => {
  it("makes an empty database the copy: its schema, and every row at its rowid", async () => {
    const db = memory(loadStatements(copy));
    const loaded = await snapshotOf(db, 1000);
    const entries = (schema: Snapshot["schema"]) =>
      schema.map(e => `${e.type} ${e.name} ${e.sql}`).sort();
    expect(entries(loaded.schema)).toEqual(entries(copy.schema));
    for (const table of Object.keys(copy.meta.tables)) {
      expect(loaded.rows(table), table).toEqual(copy.rows(table));
    }
  });

  it("runs no trigger on a loaded row", async () => {
    const db = memory(loadStatements(copy));
    const log = db.prepare("SELECT COUNT(*) AS n FROM k_sync_log").get() as { n: number };
    expect(log.n).toBe(copy.rows("k_sync_log").length);
  });

  it("refuses a copy that counted rows it never read", () => {
    const meta = { ...copy.meta, tables: { ...copy.meta.tables } };
    meta.tables.auth_session = { ...meta.tables.auth_session!, rows: 1 };
    expect(() => loadStatements({ ...copy, meta })).toThrow(/auth_session/);
  });

  it("holds back a copy whose build took the admins' work from staging", () => {
    const dir = mkdtempSync(join(tmpdir(), "grabient-load-"));
    const built = (carried: number) =>
      writeFileSync(join(dir, "report.json"), JSON.stringify({ fromStaging: { carried } }));
    try {
      built(31);
      expect(carriedWork(dir)).toBe(31);
      built(0);
      expect(carriedWork(dir)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("drops a database's tables, those naming others first", () => {
    const db = memory(loadStatements(copy));
    run(db, dropStatements(copy.schema));
    const left = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all();
    expect(left).toEqual([]);
    const order = dropStatements(copy.schema);
    const at = (table: string) => order.findIndex(sql => sql.endsWith(`"${table}"`));
    expect(at("k_collection_items")).toBeLessThan(at("k_collections"));
    expect(at("auth_account")).toBeLessThan(at("auth_user"));
  });
});
