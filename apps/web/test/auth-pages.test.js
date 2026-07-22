// Auth + saved-palettes SSR surfaces: login page, like buttons, /saved list.
import { describe, expect, it } from "vitest";
import { listPage, loginPage, seedPage } from "../src/pages";

const SEED = "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x";

const item = (likesCount) => ({
  seed: SEED,
  href: `/${SEED}`,
  background: "linear-gradient(90deg,#000,#fff)",
  likesCount,
  createdAtMs: Date.UTC(2026, 0, 1),
  style: "linearGradient",
  steps: 7,
  angle: 90,
});

const page = (items, extra = {}) =>
  listPage({
    sort: "popular",
    path: "/",
    params: { style: "auto", steps: "auto", angle: "auto", page: 1, limit: 24 },
    items,
    total: items.length,
    totalPages: 1,
    origin: "https://example.com",
    nowMs: Date.UTC(2026, 6, 21),
    stars: 0,
    ...extra,
  });

describe("login page", () => {
  const html = loginPage({ redirect: "/saved", origin: "https://example.com", stars: 0 });

  it("renders Google OAuth + magic-link form with the redirect", () => {
    expect(html).toContain('id="login-google"');
    expect(html).toContain("Sign in with Google");
    expect(html).toContain('id="login-form"');
    expect(html).toContain('data-redirect="/saved"');
    expect(html).toContain("Send magic link");
    expect(html).toContain("Or continue with email");
  });

  it("links terms and privacy", () => {
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });
});

describe("card like button", () => {
  it("carries seed + effective params and the count", () => {
    const html = page([item(3)]);
    expect(html).toContain(`data-like-seed="${SEED}"`);
    expect(html).toContain('data-like-style="linearGradient"');
    expect(html).toContain('data-like-steps="7"');
    expect(html).toContain('data-like-angle="90"');
    expect(html).toContain('data-count="3"');
    expect(html).toMatch(/like-count[^>]*>3</);
  });

  it("user-set params override the palette's own values", () => {
    const html = page([item(1)], {
      params: { style: "linearSwatches", steps: 12, angle: 45, page: 1, limit: 24 },
    });
    expect(html).toContain('data-like-style="linearSwatches"');
    expect(html).toContain('data-like-steps="12"');
    expect(html).toContain('data-like-angle="45"');
  });

  it("hides a zero count via opacity but keeps the span for optimistic likes", () => {
    const html = page([item(0)]);
    expect(html).toMatch(/like-count[^>]*opacity-0[^>]*>1</);
  });
});

describe("saved page", () => {
  it("renders without the grid island and with the Saved nav state", () => {
    const html = page([item(1)], { sort: "saved", path: "/saved", island: false });
    expect(html).toContain("Saved gradients");
    expect(html).not.toContain('id="grid-island"');
    expect(html).not.toContain('id="__DATA__"');
    expect(html).toMatch(/<option value="\/saved" selected>Saved<\/option>/);
  });

  it("shows the empty state when nothing is saved", () => {
    const html = page([], {
      sort: "saved",
      path: "/saved",
      island: false,
      emptyText: "You haven't saved any palettes yet.",
    });
    expect(html).toContain("You haven&#39;t saved any palettes yet.");
    expect(html).not.toContain("<ol");
  });
});

describe("nav select", () => {
  it("offers Saved on regular list pages too", () => {
    expect(page([item(1)])).toContain('<option value="/saved">Saved</option>');
  });
});

describe("seed page like button", () => {
  it("reads the live seed from the URL and fetches count client-side", () => {
    const html = seedPage({
      seed: SEED,
      params: { style: "auto", steps: "auto", angle: "auto", page: 1, limit: 24 },
      size: "auto",
      graph: false,
      origin: "https://example.com",
      stars: 0,
    });
    expect(html).toContain("data-like-current");
    expect(html).toContain("data-like-info");
    expect(html).toContain(`data-like-seed="${SEED}"`);
  });
});
