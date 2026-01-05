import { createServerFn } from "@tanstack/react-start";
import { getAuth, type Session } from "@repo/data-ops/auth/server";
import { getRequest } from "@tanstack/react-start/server";
import { protectedFunctionMiddleware } from "@/core/middleware/auth";
import { rateLimitFunctionMiddleware } from "@/core/middleware/rate-limit-function";
import * as v from "valibot";
import { updateUsernameSchema } from "@repo/data-ops/valibot-schema/auth";
import { getDb } from "@repo/data-ops/database/setup";
import { auth_user } from "@repo/data-ops/drizzle/auth-schema";
import { sql } from "drizzle-orm";

export const getServerSession = createServerFn({ method: "GET" }).handler(
    async (): Promise<Session | null> => {
        const auth = getAuth();
        const session = await auth.api.getSession({
            headers: getRequest().headers,
            query: {
                disableCookieCache: true,
            },
        });

        // Cast to our Session type which includes additional fields (role, username)
        // The runtime values are present, but better-auth's types don't reflect additionalFields
        return session as Session | null;
    }
);

const deleteAccountSchema = v.object({
    token: v.string(),
});

export const deleteAccount = createServerFn({ method: "POST" })
    .middleware([protectedFunctionMiddleware, rateLimitFunctionMiddleware("accountMutation")])
    .inputValidator((input) => v.parse(deleteAccountSchema, input))
    .handler(async (ctx) => {
        const { token } = ctx.data;
        const auth = getAuth();

        try {
            // Better Auth's deleteUser API handles all validation internally
            // (same as magic link verification):
            // 1. Looks up the token in auth_verification table
            // 2. Verifies the token value matches (cryptographic validation)
            // 3. Checks if token is not expired
            // 4. Validates the token was issued for account deletion
            // 5. Ensures the token belongs to the authenticated user
            // 6. Deletes the user if all validations pass
            const result = await auth.api.deleteUser({
                headers: getRequest().headers,
                body: { token },
            });

            if (!result.success) {
                throw new Error(result.message || "Failed to delete account");
            }

            return { success: true };
        } catch (error) {
            console.error("Account deletion error:", error);
            throw new Error("Failed to delete account");
        }
    });

const checkUsernameSchema = v.object({
    username: v.string(),
});

export const checkUsernameAvailability = createServerFn({ method: "POST" })
    .inputValidator((input) => v.parse(checkUsernameSchema, input))
    .handler(async (ctx) => {
        const { username } = ctx.data;
        const db = getDb();

        const existingUser = await db
            .select({ id: auth_user.id })
            .from(auth_user)
            .where(sql`LOWER(${auth_user.username}) = LOWER(${username})`)
            .limit(1);

        return { available: existingUser.length === 0 };
    });

export const updateUsername = createServerFn({ method: "POST" })
    .middleware([protectedFunctionMiddleware, rateLimitFunctionMiddleware("accountMutation")])
    .inputValidator((input) => v.parse(updateUsernameSchema, input))
    .handler(async (ctx) => {
        const { username } = ctx.data;
        const userId = ctx.context.userId;
        const db = getDb();

        if (!userId) {
            throw new Error("Unauthorized");
        }

        const existingUser = await db
            .select({ id: auth_user.id })
            .from(auth_user)
            .where(sql`LOWER(${auth_user.username}) = LOWER(${username})`)
            .limit(1);

        if (existingUser.length > 0 && existingUser[0]?.id !== userId) {
            throw new Error("Username already taken");
        }

        await db
            .update(auth_user)
            .set({ username })
            .where(sql`${auth_user.id} = ${userId}`);

        return { success: true };
    });
