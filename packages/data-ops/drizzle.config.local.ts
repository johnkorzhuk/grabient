// packages/data-ops/drizzle.config.local.ts
// Local development config for Drizzle Studio
import type { Config } from "drizzle-kit";

const config: Config = {
  out: "./src/drizzle",
  schema: ["./src/drizzle/auth-schema.ts", "./src/drizzle/app-schema.ts"],
  dialect: "sqlite",
  dbCredentials: {
    url: "../../apps/tagging-service/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/06e073622537963f86456202fc971f89fca54fa5b0fbb83f4b3b5287163bc841.sqlite",
  },
  tablesFilter: ["!auth_*"],
};

export default config satisfies Config;
