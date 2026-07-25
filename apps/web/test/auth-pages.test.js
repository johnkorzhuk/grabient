// Auth + saved-palettes SSR surfaces: login page, like buttons, /saved list.
import { describe, expect, it } from "vitest";
import { listPage, loginPage, seedPage, settingsPage } from "../src/pages";

const SEED = "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x";
// Deliberately NOT SEED: the heart's identity (coefficient key) and the row
// id a like INSERTs under are separate data attrs.
const KEY = "testcoeffkey";

const item = (likesCount) => ({
  seed: SEED,
  key: KEY,
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
  it("carries the coefficient key + row id + effective params and the count", () => {
    const html = page([item(3)]);
    expect(html).toContain(`data-like-seed="${KEY}"`);
    expect(html).toContain(`data-like-row="${SEED}"`);
    expect(html).toContain('data-like-style="linearGradient"');
    expect(html).toContain('data-like-steps="7"');
    expect(html).toContain('data-like-angle="90"');
    expect(html).toContain('data-count="3"');
    expect(html).toMatch(/like-count[^>]*>3</);
  });

  it("starts with the Save palette label + tooltip (client flips to Unsave)", () => {
    const html = page([item(3)]);
    expect(html).toContain('aria-label="Save palette"');
    expect(html).toContain('data-tip="Save palette"');
  });

  it("renders a per-card download trigger", () => {
    const html = page([item(3)]);
    expect(html).toContain("data-palette-download");
    expect(html).toContain('aria-label="Download gradient"');
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
    expect(html).toContain("Saved palettes");
    expect(html).not.toContain('id="grid-island"');
    expect(html).toContain('id="__DATA__" data-static-preview');
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
    expect(html).toContain("lg:pt-4");
  });
});

describe("auth slot", () => {
  it("cached pages SSR the placeholder circle (client swaps it for Sign in or avatar)", () => {
    const html = page([item(1)]);
    expect(html).toContain("data-auth-signin data-auth-placeholder");
    expect(html).not.toContain(">Sign in</a>");
  });

  it("per-user pages SSR the avatar directly when signed in (no placeholder, no flash)", () => {
    const html = settingsPage({
      user: {
        username: "jane_doe",
        email: "jane@example.com",
        emailVerified: true,
        image: "https://example.com/a.webp",
        createdAt: Date.UTC(2025, 0, 15),
      },
      token: null,
      origin: "https://example.com",
      stars: 0,
      gdpr: false,
    });
    expect(html).toContain('id="avatar-btn"');
    expect(html).toContain("https://example.com/a.webp");
    expect(html).not.toContain("data-auth-placeholder");
  });
});

describe("settings page", () => {
  const user = {
    username: "jane_doe",
    email: "jane@example.com",
    emailVerified: true,
    image: null,
    createdAt: Date.UTC(2025, 0, 15),
  };
  const page = (extra = {}) =>
    settingsPage({
      user,
      token: null,
      origin: "https://example.com",
      stars: 0,
      gdpr: false,
      ...extra,
    });

  it("signed in: renders profile (prefilled), account, and danger zone", () => {
    const html = page();
    expect(html).toContain('id="settings-username"');
    expect(html).toContain('value="jane_doe"');
    expect(html).toContain('data-current="jane_doe"');
    expect(html).toContain("January 15, 2025");
    expect(html).toContain("jane@example.com");
    expect(html).toContain("Verified");
    expect(html).toContain('id="settings-signout"');
    expect(html).toContain('id="danger-zone"');
    expect(html).toContain('id="delete-account-btn"');
    expect(html).toContain(">Delete account</button>");
    expect(html).not.toContain("Sign up to manage your profile");
  });

  it("renders the avatar upload controls (client stages + canvas-crops, save uploads)", () => {
    const html = page();
    expect(html).toContain('id="settings-avatar"');
    expect(html).toContain('id="avatar-change"');
    expect(html).toContain(">Change avatar</button>");
    expect(html).toContain('id="avatar-upload"');
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html).toContain("JPG, PNG or WebP. Max 5MB.");
    expect(html).toContain("256x256");
    expect(html).toContain("Update your profile information and avatar");
  });

  it("privacy card: three consent switches, SSR'd unchecked, with the geo default", () => {
    const html = page({ gdpr: true });
    expect(html).toContain('id="privacy"');
    expect(html).toContain('data-gdpr="1"');
    expect(html).toContain("Privacy &amp; Consent");
    for (const id of ["consent-analytics", "consent-sessionReplay", "consent-advertising"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('data-consent="analytics"');
    expect(html).toContain('data-consent="sessionReplay"');
    expect(html).toContain('data-consent="advertising"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('data-state="unchecked"');
    expect(html).toContain("Help us improve by allowing anonymous usage analytics");
    expect(html).toContain("Anonymized session recordings to help us fix issues");
    expect(html).toContain("Allow personalized ads and marketing content");
    expect(html).toContain('href="#privacy"');
  });

  it("non-GDPR requests carry data-gdpr=0", () => {
    expect(page({ gdpr: false })).toContain('data-gdpr="0"');
  });

  it("signed out: shows the sign-up overlay and hides account sections", () => {
    const html = page({ user: null });
    expect(html).toContain("Sign up to manage your profile");
    expect(html).toContain('href="/login?redirect=%2Fsettings"');
    expect(html).not.toContain('id="account"');
    expect(html).not.toContain('id="danger-zone"');
    expect(html).not.toContain('id="delete-account-btn"');
  });

  it("signed out: privacy card + nav link still render (consent is client-side state)", () => {
    const html = page({ user: null });
    expect(html).toContain('id="privacy"');
    expect(html).toContain('id="consent-analytics"');
    expect(html).toContain('href="#privacy"');
    expect(html).not.toContain('href="#account"');
  });

  it("with a deletion token: danger zone switches to confirm state", () => {
    const html = page({ token: "tok123" });
    expect(html).toContain('data-token="tok123"');
    expect(html).toContain(">Confirm delete</button>");
    expect(html).toContain("Click the button to confirm account deletion");
  });

  it("hides the sidebar nav anchors that need a session when signed out", () => {
    const html = page({ user: null });
    expect(html).toContain('href="#profile"');
    expect(html).not.toContain('href="#account"');
    expect(html).not.toContain('href="#danger-zone"');
  });
});
