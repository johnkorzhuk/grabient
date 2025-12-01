import * as v from "valibot";
import { emailFieldSchema } from "./contact";

export const redirectUrlSchema = v.optional(v.fallback(v.string(), "/"), "/");

export const loginSearchSchema = v.object({
    redirect: redirectUrlSchema,
});

export const loginEmailSchema = v.object({
    email: v.pipe(
        v.string(),
        v.nonEmpty("Email is required"),
        v.email("Invalid email address"),
    ),
});

export const usernameSchema = v.pipe(
    v.string(),
    v.trim(),
    v.minLength(3, "Username must be at least 3 characters"),
    v.maxLength(30, "Username must be no more than 30 characters"),
    v.regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
);

export const updateUsernameSchema = v.object({
    username: usernameSchema,
});

export { emailFieldSchema };
