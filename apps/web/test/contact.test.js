import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { contactContent } from "../src/pages";
import { layout } from "../src/html";

const env = {
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  TURNSTILE_SITE_KEY: "site-key",
  RESEND_API_KEY: "resend-secret",
  EMAIL_FROM: "noreply@grabient.com",
};

const submit = (body) =>
  app.request(
    "https://grabient.com/api/contact",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.8",
      },
      body: JSON.stringify(body),
    },
    env,
  );

afterEach(() => vi.unstubAllGlobals());

describe("contact form", () => {
  it("renders an explicit Turnstile mount and starts disabled", () => {
    const html = contactContent("public-site-key");
    expect(html).toContain('data-turnstile-site-key="public-site-key"');
    expect(html).toContain('id="contact-turnstile"');
    expect(html).toMatch(/<button type="submit" disabled/);
    expect(html).not.toContain("mailto:");
  });

  it("rejects invalid content before any external request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await submit({
      message: "short",
      turnstileToken: "token",
    });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never sends email when Turnstile rejects the token", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ success: false }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await submit({
      email: "person@example.com",
      subject: "Feedback",
      message: "This is a long enough contact message.",
      turnstileToken: "bad-token",
    });
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("siteverify");
  });

  it("sends escaped, replyable mail only after verification", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ id: "email-id" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await submit({
      email: "person@example.com",
      subject: "Bug Report",
      message: "A valid message with <script>alert(1)</script>.",
      turnstileToken: "valid-token",
    });
    expect(response.status).toBe(200);
    const options = fetchMock.mock.calls[1][1];
    const email = JSON.parse(options.body);
    expect(email.reply_to).toBe("person@example.com");
    expect(email.subject).toBe("Grabient Contact: Bug Report");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<script>");
  });
});

describe("analytics delivery", () => {
  it("loads Zaraz on production HTML but not workers.dev", () => {
    const meta = {
      title: "Grabient",
      description: "Gradients",
      canonical: "https://grabient.com/contact",
    };
    expect(layout(meta, "")).toContain('/cdn-cgi/zaraz/i.js');
    expect(
      layout(
        {
          ...meta,
          canonical: "https://grabient-lite.jkorzhuk.workers.dev/contact",
        },
        "",
      ),
    ).not.toContain('/cdn-cgi/zaraz/i.js');
  });

  it("proxies PostHog ingestion through the same-origin /e route", async () => {
    const fetchMock = vi.fn(async (url) =>
      new Response("ok", { status: 200, headers: { "X-Upstream": "posthog" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await app.request(
      "https://grabient.com/e/decide?v=3",
      { method: "POST", body: "{}" },
      env,
    );
    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://us.i.posthog.com/decide?v=3",
    );
  });
});
