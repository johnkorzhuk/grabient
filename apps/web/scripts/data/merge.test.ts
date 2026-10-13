import { beforeAll, describe, expect, it } from "vitest";
import { accountHandle, mergeStatements, moveUnder } from "./merge.ts";
import type { Row, Snapshot } from "./snapshot.ts";
import { lite, production } from "./testing.ts";

let source: { production: Snapshot; lite: Snapshot };
beforeAll(async () => {
  source = { production: await production(), lite: await lite() };
});
const users = () => source.production.rows("auth_user");
let made = 0;
const makeId = () => `new${String(++made).padStart(17, "0")}`;

describe("addresses", () => {
  it.each([
    [{ id: "AbCdEf1234567890", username: null }, "_abcdef1234"],
    [{ id: "x", username: " Ada_L " }, "ada_l"],
    [{ id: "id-with-dashes_and.dots", username: "" }, "_idwithdash"]
  ])("names %j's handle %s", (user, handle) => {
    expect(accountHandle(user)).toBe(handle);
  });

  it("moves a private address under a handle, the first free number where it is taken", () => {
    const taken = new Set(["@ada/warm-sunsets", "@ada/warm-sunsets-2"]);
    expect(moveUnder("@bob/warm-sunsets-3", "ada", slug => taken.has(slug))).toBe(
      "@ada/warm-sunsets-3"
    );
    expect(moveUnder("@bob/blue", "ada", slug => taken.has(slug))).toBe("@ada/blue");
    expect(moveUnder(`@bob/${"x".repeat(78)}`, "a_very_long_username_of_thirty", () => false)).toBe(
      `@a_very_long_username_of_thirty/${"x".repeat(44)}`
    );
  });
});

describe("the merge", () => {
  it("refuses a grabient-lite admin production has no account for", () => {
    const strangers = users().filter(user => user.role !== "admin");
    expect(() => mergeStatements(source.lite, { users: strangers, collections: [] })).toThrow(
      /admin/
    );
  });

  it("gives a collection whose address the target holds the next free one", () => {
    const held: Row = {
      id: "other",
      slug: "warm-sunsets",
      owner_kind: "agent",
      owner_id: "grabient"
    };
    const merge = mergeStatements(source.lite, { users: users(), collections: [held] }, makeId);
    expect(merge.collections.get("c1")).toBe("c1");
    expect(merge.slugs.get("warm-sunsets")).toBe("warm-sunsets-2");
    /* the queue and the reviews follow the address */
    expect(merge.statements.join("\n")).toContain('"slug":"warm-sunsets-2"');
    expect(merge.statements.join("\n")).toContain("collection:warm-sunsets-2");
  });

  it("gives a collection whose id the target holds for another a new id, and moves what names it", () => {
    const held: Row = {
      id: "c1",
      slug: "something-else",
      owner_kind: "agent",
      owner_id: "grabient"
    };
    const merge = mergeStatements(source.lite, { users: users(), collections: [held] }, makeId);
    const id = merge.collections.get("c1")!;
    expect(id).toMatch(/^new/);
    const sql = merge.statements.join("\n");
    expect(sql).toContain(`'${id}', 0, 'kEaaaaaaaa'`);
    expect(sql).toMatch(new RegExp(`'collection', 'de', '${id}'`));
  });

  it("takes a collection the target already holds as the same one", () => {
    const held: Row = { id: "c1", slug: "warm-sunsets", owner_kind: "agent", owner_id: "grabient" };
    const merge = mergeStatements(source.lite, { users: users(), collections: [held] }, makeId);
    expect(merge.collections.get("c1")).toBe("c1");
    expect(merge.slugs.size).toBe(2);
  });

  it("leaves behind a row that names a collection grabient-lite no longer holds", () => {
    const rows = (table: string) =>
      table === "k_collection_notes"
        ? [
            ...source.lite.rows(table),
            { id: "n2", collection_id: "gone", author_id: "LA", text: "x", created_at: 1 }
          ]
        : source.lite.rows(table);
    const merge = mergeStatements({ ...source.lite, rows }, { users: users(), collections: [] });
    expect(merge.dropped).toEqual({ k_collection_notes: 1 });
  });
});
