import type { InferSelectModel } from "drizzle-orm";
import type { auth_user } from "../drizzle/auth-schema";

export type AuthUser = InferSelectModel<typeof auth_user>;
