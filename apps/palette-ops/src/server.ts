import { initDatabase } from "@repo/data-ops/database/setup";
import handler from "@tanstack/react-start/server-entry";

console.log("[server-entry]: palette-ops custom server entry");

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      requestContext: {
        db: ReturnType<typeof initDatabase>;
        fromFetch: boolean;
        env: Env;
      };
    };
  }
}

export default {
  fetch(request: Request, env: Env) {
    const db = initDatabase(env.DB);

    return handler.fetch(request, {
      context: {
        db,
        fromFetch: true,
        env,
      },
    });
  },
};
