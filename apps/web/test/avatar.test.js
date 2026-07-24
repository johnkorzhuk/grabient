// Avatar helpers + GDPR geo detection.
import { describe, expect, it } from "vitest";
import { avatarKey, avatarKeyFromUrl, isWebpBuffer } from "../src/avatar";
import { isGdprRegion } from "../src/geo";

const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]).buffer;
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]).buffer;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;

describe("isWebpBuffer", () => {
  it("accepts a RIFF/WEBP header", () => {
    expect(isWebpBuffer(WEBP)).toBe(true);
  });

  it("rejects png, jpeg, truncated and empty buffers", () => {
    expect(isWebpBuffer(PNG)).toBe(false);
    expect(isWebpBuffer(JPEG)).toBe(false);
    expect(isWebpBuffer(WEBP.slice(0, 8))).toBe(false);
    expect(isWebpBuffer(new ArrayBuffer(0))).toBe(false);
  });
});

describe("avatarKey", () => {
  it("uses the original's avatars/{userId}/{timestamp}.webp scheme", () => {
    expect(avatarKey("user123", 1763999918861)).toBe("avatars/user123/1763999918861.webp");
  });
});

describe("avatarKeyFromUrl", () => {
  const BASE = "https://pub-a081a47d10f74a968f0995c41036fbe4.r2.dev";

  it("extracts the key from a URL on our public base", () => {
    expect(avatarKeyFromUrl(`${BASE}/avatars/u/1.webp`, BASE)).toBe("avatars/u/1.webp");
  });

  it("returns null for third-party URLs (old avatar cleanup skips them)", () => {
    expect(avatarKeyFromUrl("https://lh3.googleusercontent.com/a/x=s96-c", BASE)).toBeNull();
    // A lookalike host must not slip through (prefix match, not substring).
    expect(avatarKeyFromUrl(`${BASE}.evil.com/avatars/u/1.webp`, BASE)).toBeNull();
  });
});

describe("isGdprRegion", () => {
  it("treats EU + UK countries as GDPR", () => {
    expect(isGdprRegion({ country: "FR" })).toBe(true);
    expect(isGdprRegion({ country: "DE" })).toBe(true);
    expect(isGdprRegion({ country: "GB" })).toBe(true);
    expect(isGdprRegion({ country: "NO" })).toBe(true);
  });

  it("honors Cloudflare's isEUCountry signal even for unlisted countries", () => {
    expect(isGdprRegion({ country: "XX", isEUCountry: "1" })).toBe(true);
  });

  it("treats non-EEA countries and missing cf data as non-GDPR", () => {
    expect(isGdprRegion({ country: "US" })).toBe(false);
    expect(isGdprRegion({ country: "JP" })).toBe(false);
    expect(isGdprRegion(undefined)).toBe(false);
    expect(isGdprRegion({})).toBe(false);
  });
});
