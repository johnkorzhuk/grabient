import { betterAuth, type BetterAuthOptions, type GenericEndpointContext } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
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

  // Store polar client at module level for hooks to access
  let polarClient: Polar | undefined;

  // Add Polar plugin if polar config is provided
  if (config.polar) {
    polarClient = new Polar({
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
          }),
        ],
      })
    );
  }

  // After hook: ensure Polar customer exists for existing users on sign-in
  // Also handles re-linking customers who deleted their account and signed up again
  const polarAfterHook = polarClient ? createAuthMiddleware(async (ctx) => {
    const isSignIn = ctx.path.includes("/sign-in/") || ctx.path.includes("/callback/");
    if (!isSignIn) return;

    const newSession = ctx.context.newSession;
    if (!newSession?.user) return;

    const user = newSession.user;

    try {
      await polarClient.customers.getExternal({ externalId: user.id });
    } catch (error: unknown) {
      // Check for ResourceNotFound error (Polar SDK throws typed errors)
      const isNotFound = error instanceof Error &&
        (error.name === "ResourceNotFound" || error.message.includes("ResourceNotFound") || error.message.includes("Not found"));

      if (isNotFound) {
        try {
          // First, check if a customer exists with this email (e.g., user deleted account and signed up again)
          const existingCustomers = await polarClient.customers.list({ email: user.email });
          const existingCustomer = existingCustomers.result.items[0];

          if (existingCustomer) {
            // Re-link the existing customer to the new user ID
            // This preserves their subscription/trial history and prevents trial abuse
            await polarClient.customers.update({
              id: existingCustomer.id,
              customerUpdate: { externalId: user.id },
            });
          } else {
            // No existing customer - create a new one
            await polarClient.customers.create({
              email: user.email,
              externalId: user.id,
              name: user.name || user.email,
            });
          }
        } catch {
          // Silently fail - customer creation is not critical for sign-in
        }
      }
    }
  }) : undefined;

  // Before hook: cancel subscriptions before account deletion (keeps customer to prevent trial abuse)
  const polarBeforeHook = polarClient ? createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/delete-user/callback") return;

    const session = ctx.context.session;
    if (!session?.user?.id) return;

    try {
      // Get the customer by external ID
      const customer = await polarClient.customers.getExternal({ externalId: session.user.id });

      // Revoke all active subscriptions for this customer (immediate cancellation)
      const subscriptions = await polarClient.subscriptions.list({ customerId: customer.id });
      for (const subscription of subscriptions.result.items) {
        if (subscription.status === "active" || subscription.status === "trialing") {
          await polarClient.subscriptions.revoke({ id: subscription.id });
        }
      }
      // Note: We intentionally do NOT delete the customer record
      // This preserves trial history and prevents users from getting new trials by deleting/recreating accounts
    } catch {
      // Silently fail - customer may not exist
    }
  }) : undefined;

  return betterAuth({
    database: config.database,
    secret: config.secret,
    emailAndPassword: config.emailAndPassword ?? {
      enabled: false,
    },
    socialProviders: config.socialProviders,
    plugins,
    hooks: (polarAfterHook || polarBeforeHook) ? {
      after: polarAfterHook,
      before: polarBeforeHook,
    } : undefined,
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
