import { createAuthClient } from "better-auth/react";
import {
  magicLinkClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import type { createBetterAuth } from "@repo/data-ops/auth/setup";

// Quick Start Mode: Gracefully handle missing auth configuration
// If server auth is not configured, create a no-op client
let authClient: ReturnType<typeof createAuthClient>;
let useSession: any;
let signIn: any;
let signOut: any;

try {
  authClient = createAuthClient({
    plugins: [
      magicLinkClient(),
      inferAdditionalFields<ReturnType<typeof createBetterAuth>>(),
    ],
  });

  ({ useSession, signIn, signOut } = authClient);
} catch (error) {
  console.log("[Quick Start Mode] Auth client initialization skipped - auth not configured");

  // Provide no-op implementations
  authClient = {} as any;
  useSession = () => ({ data: null, isPending: false, error: null });
  signIn = { social: () => Promise.resolve() };
  signOut = () => Promise.resolve();
}

export { authClient, useSession, signIn, signOut };
