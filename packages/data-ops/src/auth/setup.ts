import { betterAuth, type BetterAuthOptions, type GenericEndpointContext } from "better-auth";
import { magicLink } from "better-auth/plugins";

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
