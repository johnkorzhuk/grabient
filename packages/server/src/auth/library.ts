import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { captcha, emailOTP, magicLink } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import { batch } from "../db/d1.ts";
import { sendEmail } from "../email/send.ts";
import type { Env } from "../env.ts";
import { accountDeletion, deleteAvatars } from "./account-data.ts";
import { attribution } from "./attribution.ts";
import { confirmDeletion, signInCode, signInLink } from "./letters.ts";
import { reviewerAddress } from "./roles.ts";
import * as schema from "./schema.ts";

/* Better Auth for one environment: Google, a link by email, a code by email while an app connects, and a password for
   the app reviewers' account alone. Its routes are reached only through the gate (gate.ts), which opens the ones the
   site uses; the server calls its API directly. */

const NAME_MAX = 80;
// Google's tokens are never kept: the site asks Google who you are once, at sign-in, and calls no Google API after.
const NO_TOKENS = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null
};
// The prefix of cookies set for the name every Preview address ends in, which no other deploy reads as its session.
const PREVIEW_COOKIES = "grabient-previews";

/** Google's credentials, where the deploy holds them. A Preview holds none: Google sends a sign-in back only to an
    address registered with it, and each branch has its own. */
export function google(env: Env) {
  return env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : null;
}

/** The link in a deletion email: Settings at the site's origin, in the language of the Settings page that asked. */
function deletionLink(env: Env, request: Request | undefined, token: string): string {
  const origin = env.BETTER_AUTH_URL ?? (request ? new URL(request.url).origin : "");
  let path = "/settings";
  try {
    const page = new URL(request?.headers.get("Referer") ?? "");
    if (page.origin === origin && /^\/[^/]+\/settings$/.test(page.pathname)) path = page.pathname;
  } catch {
    // No page named: the default language.
  }
  return `${origin}${path}?token=${encodeURIComponent(token)}`;
}

function createAuth(env: Env) {
  const credentials = google(env);
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    // With no BETTER_AUTH_URL the library takes each request's origin, so a Preview signs in at its branch's address.
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(drizzle(env.DB), { provider: "sqlite", schema }),
    // The gate counts every request by address and by account itself (limits/).
    rateLimit: { enabled: false },
    // A password only for the reviewers' account, which setReviewerPassword gives one: no sign-up, no reset.
    emailAndPassword: { enabled: Boolean(env.REVIEWER_EMAIL), disableSignUp: true },
    // The page goes to Google and back; an ID token posted alone, which the page never sends, would make a session.
    socialProviders: credentials ? { google: { ...credentials, disableIdTokenSignIn: true } } : {},
    // A failed Google sign-in comes back to the sign-in page, which says so in the reader's language.
    onAPIError: { errorURL: "/login" },
    plugins: [
      /* A link's token and a code are stored hashed, so no row another flow keeps under a plain value can be redeemed
         as one. verification.storeIdentifier stays unset: it would look plain values up too. */
      magicLink({
        expiresIn: 300,
        storeToken: "hashed",
        sendMagicLink: ({ email, url }) => sendEmail(env, { to: email, ...signInLink(url) })
      }),
      // A code for the sign-in an app asks for, typed in the window that asked, where a link would open elsewhere.
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: "hashed",
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type === "sign-in") await sendEmail(env, { to: email, ...signInCode(otp) });
        }
      }),
      ...(env.REVIEWER_EMAIL && env.TURNSTILE_SECRET_KEY
        ? [
            captcha({
              provider: "cloudflare-turnstile",
              secretKey: env.TURNSTILE_SECRET_KEY,
              endpoints: ["/sign-in/email"]
            })
          ]
        : [])
    ],
    hooks: {
      // Every other address is refused before any password is hashed or compared.
      before: createAuthMiddleware(async ctx => {
        if (ctx.path !== "/sign-in/email") return;
        const email: unknown = ctx.body?.email;
        if (typeof email !== "string" || !reviewerAddress(env, email)) {
          throw new APIError("UNAUTHORIZED", {
            code: "INVALID_EMAIL_OR_PASSWORD",
            message: "Invalid email or password"
          });
        }
      })
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => ({
            data: {
              ...user,
              name: String(user.name ?? "")
                .trim()
                .slice(0, NAME_MAX),
              ...attribution(context?.request?.headers ?? context?.headers)
            }
          })
        }
      },
      account: {
        create: {
          before: async account => ({ data: { ...account, ...NO_TOKENS } })
        },
        update: { before: async account => ({ data: { ...account, ...NO_TOKENS } }) }
      },
      session: {
        create: {
          before: async session => {
            // Untracked, the library writes an empty address; the column has held none since addresses went.
            return { data: { ...session, ipAddress: null } };
          }
        }
      }
    },
    advanced: {
      // No session records an address, and the library's own limiting, which would need one, is off.
      ipAddress: { disableIpTracking: true },
      // Without a base URL the library cannot tell a Worker serves https alone.
      useSecureCookies: env.DEPLOYMENT !== "development",
      ...(env.COOKIE_DOMAIN
        ? {
            crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN },
            cookiePrefix: PREVIEW_COOKIES
          }
        : {})
    },
    // Profile edits go through Settings' own routes, and a deletion is confirmed there, never by a GET.
    disabledPaths: [
      "/update-user",
      "/delete-user/callback",
      "/change-email",
      "/link-social",
      "/unlink-account",
      "/sign-up/email",
      "/change-password",
      "/request-password-reset",
      "/reset-password"
    ],
    user: {
      modelName: "auth_user",
      // Each is written by the site's own code, never from a sign-in request.
      additionalFields: {
        username: { type: "string", required: false, input: false },
        role: { type: "string", required: false, defaultValue: "user", input: false },
        attributionSource: { type: "string", required: false, input: false },
        attributionMedium: { type: "string", required: false, input: false },
        attributionCampaign: { type: "string", required: false, input: false },
        attributionReferrer: { type: "string", required: false, input: false },
        attributionLanding: { type: "string", required: false, input: false },
        attributionAt: { type: "date", required: false, input: false }
      },
      deleteUser: {
        enabled: true,
        deleteTokenExpiresIn: 24 * 60 * 60,
        // After the library accepts the emailed token. The batch takes the account's row, which leaves the library's
        // own deletes after it nothing to do.
        beforeDelete: async user => {
          await batch(env.DB, accountDeletion(user.id));
        },
        afterDelete: async user => {
          try {
            await deleteAvatars(env, user.id);
          } catch (error) {
            console.error("account deletion: avatars left", user.id, error);
          }
        },
        sendDeleteAccountVerification: ({ user, token }, request) =>
          sendEmail(env, { to: user.email, ...confirmDeletion(deletionLink(env, request, token)) })
      }
    },
    // A signed five-minute copy of the session in a cookie spares most reads a database query.
    session: {
      modelName: "auth_session",
      freshAge: 0,
      cookieCache: { enabled: true, maxAge: 300 }
    },
    /* Google's sign-in state rides in an encrypted cookie for its ten minutes, so asking to sign in writes no row, and a
       returning Google sign-in writes nothing to its account row. */
    account: {
      modelName: "auth_account",
      updateAccountOnSignIn: false,
      storeStateStrategy: "cookie"
    },
    verification: { modelName: "auth_verification" }
  });
}

export type Auth = ReturnType<typeof createAuth>;

// One instance per environment: two never share a database or a session cache, in one process or a test.
const instances = new WeakMap<Env, Auth>();

export function authFor(env: Env): Auth {
  let auth = instances.get(env);
  if (!auth) {
    auth = createAuth(env);
    instances.set(env, auth);
  }
  return auth;
}
