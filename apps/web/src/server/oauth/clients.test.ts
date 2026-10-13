import { describe, expect, it } from "vitest";
import {
  ADMIN_SCOPES,
  AS_METADATA_PATH,
  appName,
  clientKind,
  fetchableClientId,
  givenName,
  MCP_PATH,
  MCP_SCOPES,
  OAUTH_PATHS,
  RESOURCE_METADATA_PATH,
  redirectPlace,
  SAVED_CLIENT_IDS,
  SAVED_REDIRECTS,
  trustedRedirect
} from "./clients.ts";
import golden from "./fixtures/oauth-rules.json" with { type: "json" };
import { decodeResume, encodeResume, QUERY_MAX, RESUME_MAX, tooLong } from "./resume.ts";

describe("which apps may connect", () => {
  it("fetch only a document whose address URL parsing spells, on a public name that is not this site's", () => {
    for (const [id, fetchable] of golden.fetchableClientId as [string, boolean][]) {
      expect(fetchableClientId(id, "https://grabient-lite.jkorzhuk.workers.dev"), id).toBe(
        fetchable
      );
    }
  });

  it("send a browser unasked only to this computer or a redirect a saved document lists", () => {
    for (const [uri, trusted] of golden.trustedRedirect as [string, boolean][]) {
      expect(trustedRedirect(uri), uri).toBe(trusted);
    }
    expect([...SAVED_CLIENT_IDS]).toEqual(golden.savedClientIds);
    expect([...SAVED_REDIRECTS]).toEqual(golden.savedRedirects);
  });

  it("are known as saved, fetched or registered, and named as they named themselves", () => {
    for (const [id, kind] of golden.clientKind) expect(clientKind(id!)).toBe(kind);
    for (const [uri, place] of golden.redirectPlace as [string, unknown][])
      expect(redirectPlace(uri)).toEqual(place);
    for (const [raw, name] of golden.givenName) expect(givenName(raw)).toBe(name);
    for (const [raw, name] of golden.appName) expect(appName(raw)).toBe(name);
  });

  it("keep the addresses and scopes apps know", () => {
    expect({ MCP_SCOPES, ADMIN_SCOPES, MCP_PATH }).toEqual(golden.scopes);
    expect({ OAUTH_PATHS, AS_METADATA_PATH, RESOURCE_METADATA_PATH }).toEqual(golden.paths);
  });
});

describe("a request riding through sign-in", () => {
  it("comes back whole, decoded once more or not", () => {
    const query =
      "response_type=code&client_id=abc&redirect_uri=https%3A%2F%2Fapp.test%2Fcb&state=é✓";
    const r = encodeResume(query);
    expect(decodeResume(r)).toBe(query);
    expect(decodeURIComponent(r)).toBe(r);
  });

  it("refuses what is not base64url, too long, or not UTF-8", () => {
    expect(decodeResume("not base64!")).toBeNull();
    expect(decodeResume("abcde")).toBeNull();
    expect(decodeResume("A".repeat(RESUME_MAX + 4))).toBeNull();
    expect(decodeResume(encodeResume("x").slice(0, 1))).toBeNull();
    expect(decodeResume("_w")).toBeNull();
    expect(tooLong("x".repeat(QUERY_MAX))).toBe(false);
    expect(tooLong("x".repeat(QUERY_MAX + 1))).toBe(true);
  });
});
