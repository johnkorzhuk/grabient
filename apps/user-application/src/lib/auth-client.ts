import { createAuthClient } from "better-auth/react";
import {
  magicLinkClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import { polarClient } from "@polar-sh/better-auth/client";
import type { createBetterAuth } from "@repo/data-ops/auth/setup";

export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    inferAdditionalFields<ReturnType<typeof createBetterAuth>>(),
    polarClient(),
  ],
});

export const { useSession, signIn, signOut } = authClient;
