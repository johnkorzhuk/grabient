// better-auth wiring, ported from the current site's server.ts: same
// factory (@repo/data-ops createBetterAuth via setAuth), same D1 drizzle
// adapter, same Google + magic-link providers, same Resend email. setAuth is
// memoized per isolate, so calling initAuth on every request is free after
// the first; env values are stable for the isolate's lifetime.
import { setAuth, type Session } from "@repo/data-ops/auth/server";
import { initDatabase, getDb } from "@repo/data-ops/database/setup";

export type { Session };

// Both auth emails go through Resend exactly like the current site's
// server.ts — same sender, same templates.
async function sendEmail(env: Env, to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }),
  });
  if (!response.ok) {
    throw new Error(`Failed to send email: ${await response.text()}`);
  }
}

export function initAuth(env: Env) {
  initDatabase(env.DB);
  return setAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    adapter: { drizzleDb: getDb(), provider: "sqlite" },
    sendMagicLink: async (data) => {
      await sendEmail(
        env,
        data.email,
        "Sign in to Grabient",
        `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Sign in to Grabient</h2>
  <p>Click the button below to sign in to your account:</p>
  <a href="${data.url}"
     style="display: inline-block; padding: 12px 24px; background-color: #0070f3;
            color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
    Sign In
  </a>
  <p style="color: #666; font-size: 14px;">
    This link will expire in 5 minutes. If you didn't request this email, you can safely ignore it.
  </p>
  <p style="color: #999; font-size: 12px;">
    Or copy and paste this URL into your browser:<br/>
    ${data.url}
  </p>
</div>`,
      );
    },
    // Account-deletion confirmation, ported from the current site's server.ts:
    // the email links to /settings?token=… (NOT better-auth's default callback)
    // so the user reviews the danger zone and confirms there. The origin is
    // BETTER_AUTH_URL — the same value Google OAuth redirects use — so the
    // link always lands on this deployment, never on a derived request URL.
    sendDeleteAccountVerification: async (data) => {
      const origin = env.BETTER_AUTH_URL || "https://grabient.com";
      const url = `${origin}/settings?token=${data.token}`;
      await sendEmail(
        env,
        data.user.email,
        "Confirm Account Deletion - Grabient",
        `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #dc2626;">Confirm Account Deletion</h2>
  <p>You requested to delete your Grabient account (${data.user.email}).</p>
  <p><strong>This action is permanent and cannot be undone.</strong></p>
  <p>Click the button below to complete the deletion. You'll need to be logged in to confirm.</p>
  <a href="${url}"
     style="display: inline-block; padding: 12px 24px; background-color: #dc2626;
            color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
    Delete My Account
  </a>
  <p style="color: #666; font-size: 14px;">
    This link will expire in 24 hours.
  </p>
</div>`,
      );
    },
  });
}

// Honors the signed cookie cache (see session.cookieCache in data-ops
// auth/setup.ts): within its 5-minute window this is pure HMAC verification,
// no D1 read. The cache cookie itself is set/refreshed by the /api/auth/*
// handler responses the client already fetches on every load and swap;
// Set-Cookie headers from this server-side call are dropped, which only means
// a refresh waits for the next /api/auth/get-session round-trip.
export async function getSession(env: Env, headers: Headers): Promise<Session | null> {
  const auth = initAuth(env);
  return (await auth.api.getSession({ headers })) as Session | null;
}
