import { beforeAll, describe, expect, it } from "vitest";
import { dropStatements, loadStatements } from "./load.ts";
import type { Snapshot } from "./snapshot.ts";
import { copyOf, lite, memory, production, run, snapshotOf } from "./testing.ts";

let copy: Snapshot;
beforeAll(async () => {
  const { db } = await copyOf({ production: await production(), lite: await lite() });
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
