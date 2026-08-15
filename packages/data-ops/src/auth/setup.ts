import { betterAuth, type BetterAuthOptions, type GenericEndpointContext } from "better-auth";
import { magicLink } from "better-auth/plugins";


/**
 * First-touch attribution, lifted off the `gb_attr` cookie at account creation.
 *
 * A cookie rather than localStorage on purpose: Google sign-in is a redirect
 * flow, so the account row is created during a server-side callback where no
 * client storage is reachable. A first-party cookie is the only channel that
 * survives the round trip, which is also why it must be SameSite=Lax — Strict
 * would not be sent on the return leg from Google and every social signup would
 * record as direct.
 *
 * Written once, never updated. If a visitor arrives from a campaign, wanders off
 * and comes back a week later via a Google search before signing up, this still
 * credits the campaign. Last-touch would credit the search and the campaign
 * would look like it converted nobody.
 */
const ATTRIBUTION_COOKIE = "gb_attr";

/** Bounded so a hostile cookie cannot write large values into every row. */
const MAX_FIELD = 200;

interface Attribution {
  attributionSource?: string;
  attributionMedium?: string;
  attributionCampaign?: string;
  attributionReferrer?: string;
  attributionLanding?: string;
  attributionAt?: Date;
}

function readAttribution(headers: Headers | undefined): Attribution {
  const cookie = headers?.get("cookie");
  if (!cookie) return {};
  const match = new RegExp(`(?:^|;\\s*)${ATTRIBUTION_COOKIE}=([^;]+)`).exec(cookie);
  if (!match?.[1]) return {};

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(decodeURIComponent(match[1]));
  } catch {
    // A malformed cookie is not worth failing a signup over.
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};

  const str = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim().slice(0, MAX_FIELD);
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const at = typeof parsed.t === "number" && Number.isFinite(parsed.t) ? new Date(parsed.t) : undefined;

  return {
    attributionSource: str(parsed.s),
    attributionMedium: str(parsed.m),
    attributionCampaign: str(parsed.c),
    attributionReferrer: str(parsed.r),
    attributionLanding: str(parsed.l),
    // Ignore a timestamp that is not plausible rather than storing a bad date.
    attributionAt: at && !Number.isNaN(at.getTime()) ? at : undefined,
  };
}

export const createBetterAuth = (config: {
  database: BetterAuthOptions["database"];
  secret?: BetterAuthOptions["secret"];
  baseURL?: BetterAuthOptions["baseURL"];
  socialProviders?: BetterAuthOptions["socialProviders"];
  emailAndPassword?: { enabled: boolean; requireEmailVerification?: boolean };
  sendMagicLink?: (data: { email: string; url: string; token: string }, ctx?: GenericEndpointContext) => void | Promise<void>;
  sendDeleteAccountVerification?: (data: {
    user: {
      id: string;
      email: string;
      emailVerified: boolean;
      name: string;
      username?: string | null;
      createdAt: Date;
      updatedAt: Date;
      image?: string | null;
    };
    url: string;
    token: string;
  }, request?: Request) => Promise<void>;
}) => {
  const plugins = [];

  if (config.sendMagicLink) {
    plugins.push(
      magicLink({
        sendMagicLink: config.sendMagicLink,
      })
    );
  }

  return betterAuth({
    database: config.database,
    secret: config.secret,
    baseURL: config.baseURL,
    emailAndPassword: config.emailAndPassword ?? {
      enabled: false,
    },
    socialProviders: config.socialProviders,
    plugins,
    databaseHooks: {
      user: {
        create: {
          // Runs inside the sign-up request (and inside the OAuth callback for
          // social sign-in), so the request headers here still carry the
          // visitor's cookies.
          before: async (user, ctx) => {
            const context = ctx as GenericEndpointContext | null | undefined;
            const headers =
              (context?.request as Request | undefined)?.headers ??
              (context?.headers as Headers | undefined);
            const attribution = readAttribution(headers);
            if (Object.keys(attribution).length === 0) return;
            return { data: { ...user, ...attribution } };
          },
        },
      },
    },
    user: {
      modelName: "auth_user",
      additionalFields: {
        username: {
          type: "string",
          required: false,
        },
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
        // input: false on all of these — they are set server-side from the
        // cookie in the create hook above and must never be settable by a
        // client, or anyone could post themselves any attribution they liked.
        attributionSource: { type: "string", required: false, input: false },
        attributionMedium: { type: "string", required: false, input: false },
        attributionCampaign: { type: "string", required: false, input: false },
        attributionReferrer: { type: "string", required: false, input: false },
        attributionLanding: { type: "string", required: false, input: false },
        attributionAt: { type: "date", required: false, input: false },
      },
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: config.sendDeleteAccountVerification,
      },
    },
    session: {
      modelName: "auth_session",
      freshAge: 0,
      // Signed session-in-cookie cache: getSession calls within maxAge verify
      // the cookie's HMAC and skip the D1 session read entirely. The client
      // hits /api/auth/get-session on every page load and swap, and every SSR
      // page checks the session too — without this each of those is a D1
      // round-trip. 5 minutes bounds revocation lag (sign-out on THIS device
      // clears the cookie immediately; only a remotely revoked session can
      // linger, for at most maxAge).
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    verification: {
      modelName: "auth_verification",
    },
    account: {
      modelName: "auth_account",
    },
  });
};
