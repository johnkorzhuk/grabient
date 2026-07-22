// better-auth wiring, ported from the current site's server.ts: same
// factory (@repo/data-ops createBetterAuth via setAuth), same D1 drizzle
// adapter, same Google + magic-link providers, same Resend email. setAuth is
// memoized per isolate, so calling initAuth on every request is free after
// the first; env values are stable for the isolate's lifetime.
import { setAuth, type Session } from "@repo/data-ops/auth/server";
import { initDatabase, getDb } from "@repo/data-ops/database/setup";

export type { Session };

export function initAuth(env: Env) {
  initDatabase(env.DB);
  return setAuth({
    secret: env.BETTER_AUTH_SECRET,
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    adapter: { drizzleDb: getDb(), provider: "sqlite" },
    sendMagicLink: async (data) => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: data.email,
          subject: "Sign in to Grabient",
          html: `
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
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to send email: ${await response.text()}`);
      }
    },
  });
}

export async function getSession(env: Env, headers: Headers): Promise<Session | null> {
  const auth = initAuth(env);
  return (await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  })) as Session | null;
}
