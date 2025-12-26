import { betterAuth, type BetterAuthOptions, type GenericEndpointContext } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { polar, checkout, portal, usage, webhooks } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";

export interface PolarConfig {
  accessToken: string;
  webhookSecret: string;
  server: "sandbox" | "production";
  products: {
    monthly: { productId: string; slug: string };
    yearly: { productId: string; slug: string };
  };
  successUrl: string;
}

export const createBetterAuth = (config: {
  database: BetterAuthOptions["database"];
  secret?: BetterAuthOptions["secret"];
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
  polar?: PolarConfig;
}): ReturnType<typeof betterAuth> => {
  const plugins = [];

  // Add magic link plugin if sendMagicLink is provided
  if (config.sendMagicLink) {
    plugins.push(
      magicLink({
        sendMagicLink: config.sendMagicLink,
      })
    );
  }

  // Add Polar plugin if polar config is provided
  if (config.polar) {
    const polarClient = new Polar({
      accessToken: config.polar.accessToken,
      server: config.polar.server,
    });

    plugins.push(
      polar({
        client: polarClient,
        createCustomerOnSignUp: true,
        use: [
          checkout({
            products: [
              {
                productId: config.polar.products.monthly.productId,
                slug: config.polar.products.monthly.slug,
              },
              {
                productId: config.polar.products.yearly.productId,
                slug: config.polar.products.yearly.slug,
              },
            ],
            successUrl: config.polar.successUrl,
            authenticatedUsersOnly: true,
          }),
          portal(),
          usage(),
          webhooks({
            secret: config.polar.webhookSecret,
            onPayload: async (payload) => {
              console.log("[Polar Webhook]:", payload.type);
            },
          }),
        ],
      })
    );
  }

  return betterAuth({
    database: config.database,
    secret: config.secret,
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
    },
    verification: {
      modelName: "auth_verification",
    },
    account: {
      modelName: "auth_account",
    },
  });
};
