import { createAuthClient } from "better-auth/react";
import {
  magicLinkClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import type { createBetterAuth } from "@repo/data-ops/auth/setup";

export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    inferAdditionalFields<ReturnType<typeof createBetterAuth>>(),
  ],
});

export const { useSession, signIn, signOut } = authClient;
