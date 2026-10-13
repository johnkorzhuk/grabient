import { describe, expect, it } from "vitest";
import { pageSql, readDatabase } from "./read.ts";
import { reads } from "./snapshot.ts";
import { insert, memory, PRODUCTION_SCHEMA } from "./testing.ts";

describe("the read", () => {
  it("reads whether a link holds a Google token or a password, never the value", async () => {
    const db = memory(PRODUCTION_SCHEMA);
    insert(db, {
      auth_user: [{ id: "a", email: "a@example.test", created_at: 1, updated_at: 1 }],
      auth_account: [
        {
          id: "x",
          account_id: "g",
          provider_id: "google",
          user_id: "a",
          id_token: "eyJ.secret",
          scope: "openid",
          created_at: 1,
          updated_at: 1
        },
        {
          id: "y",
          account_id: "h",
          provider_id: "google",
          user_id: "a",
          created_at: 1,
          updated_at: 1
        }
      ]
    });
    const columns = ["id", "access_token", "id_token", "password", "scope"];
    const { rows } = await reads(db)(pageSql("auth_account", columns, 0));
    expect(rows).toEqual([
      [1, "x", null, "", null, "openid"],
      [2, "y", null, null, null, null]
    ]);
  });

  it("reads every table a page at a time and only counts sessions", async () => {
    const db = memory(PRODUCTION_SCHEMA);
    const user = (id: string) => ({
      id,
      email: `${id}@example.test`,
      created_at: 1,
      updated_at: 1
    });
    insert(db, {
      auth_user: ["a", "b", "c", "d", "e"].map(user),
      auth_session: [
        { id: "s", expires_at: 1, token: "secret", created_at: 1, updated_at: 1, user_id: "a" }
      ]
    });
    const asked: string[] = [];
    const read = reads(db);
    const { meta, tables } = await readDatabase(
      sql => {
        asked.push(sql);
        return read(sql);
      },
      { name: "memory", id: "memory" },
      2
    );
    expect(tables.get("auth_user")!.map(row => row.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(meta.tables.auth_session).toMatchObject({ rows: 1, skipped: "sessions" });
    expect(tables.has("auth_session")).toBe(false);
    expect(
      asked.filter(sql => sql.includes('FROM "auth_session"')).every(sql => !sql.includes("token"))
    ).toBe(true);
    expect(asked.filter(sql => sql.includes('FROM "auth_user"'))).toHaveLength(3);
    expect(meta.mostRowsRead).toBeLessThanOrEqual(2);
  });
});
