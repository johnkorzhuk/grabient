import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { protectedFunctionMiddleware } from "@/core/middleware/auth";
import { rateLimitFunctionMiddleware } from "@/core/middleware/rate-limit-function";
import { getAuth } from "@repo/data-ops/auth/server";
import { getDb } from "@repo/data-ops/database/setup";
import { auth_user } from "@repo/data-ops/drizzle/auth-schema";
import { eq } from "drizzle-orm";
import * as v from "valibot";
import { createR2Client, generateAvatarKey, extractKeyFromUrl } from "@/lib/r2";

const generateUploadUrlSchema = v.object({
    contentType: v.pipe(
        v.string(),
        v.regex(/^image\/(jpeg|png|webp)$/, "Invalid content type. Must be image/jpeg, image/png, or image/webp"),
    ),
});

export const generateAvatarUploadUrl = createServerFn({ method: "POST" })
    .middleware([protectedFunctionMiddleware, rateLimitFunctionMiddleware("avatarUpload")])
    .inputValidator((input) => v.parse(generateUploadUrlSchema, input))
    .handler(async (ctx) => {
        const { contentType } = ctx.data;
        const auth = getAuth();

        const session = await auth.api.getSession({
            headers: getRequest().headers,
        });

        if (!session?.user?.id) {
            throw new Error("Unauthorized");
        }

        const env = ctx.context.env;

        const r2Client = createR2Client({
            accountId: env.R2_ACCOUNT_ID,
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            bucketName: env.R2_BUCKET_NAME,
        });

        const key = generateAvatarKey(session.user.id);
        const uploadUrl = await r2Client.generatePresignedUploadUrl(
            key,
            contentType,
            3600,
        );
        const publicUrl = r2Client.getPublicUrl(key, env.R2_PUBLIC_URL);

        return {
            uploadUrl,
            publicUrl,
            key,
            expiresAt: Date.now() + 3600000,
        };
    });

const confirmAvatarUploadSchema = v.object({
    imageUrl: v.pipe(v.string(), v.url()),
});

export const confirmAvatarUpload = createServerFn({ method: "POST" })
    .middleware([protectedFunctionMiddleware, rateLimitFunctionMiddleware("avatarUpload")])
    .inputValidator((input) => v.parse(confirmAvatarUploadSchema, input))
    .handler(async (ctx) => {
        const { imageUrl } = ctx.data;
        const auth = getAuth();
        const db = getDb();
        const env = ctx.context.env;

        const session = await auth.api.getSession({
            headers: getRequest().headers,
        });

        if (!session?.user?.id) {
            throw new Error("Unauthorized");
        }

        if (!imageUrl.startsWith(env.R2_PUBLIC_URL)) {
            throw new Error("Invalid image URL");
        }

        const r2Client = createR2Client({
            accountId: env.R2_ACCOUNT_ID,
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
            bucketName: env.R2_BUCKET_NAME,
        });

        const key = extractKeyFromUrl(imageUrl, env.R2_PUBLIC_URL);
        if (!key) {
            throw new Error("Invalid image URL");
        }

        const metadata = await r2Client.getFileMetadata(key);
        if (!metadata) {
            throw new Error("File not found");
        }

        const MAX_FILE_SIZE = 5 * 1024 * 1024;
        if (metadata.size > MAX_FILE_SIZE) {
            await r2Client.deleteFile(key);
            throw new Error("File size exceeds 5MB limit");
        }

        const validation = await r2Client.validateImageFile(key);
        if (!validation.valid) {
            await r2Client.deleteFile(key);
            throw new Error("Invalid image file. File must be a valid JPEG, PNG, or WebP image");
        }

        const oldImageUrl = session.user.image;

        await db
            .update(auth_user)
            .set({ image: imageUrl, updatedAt: new Date() })
            .where(eq(auth_user.id, session.user.id));

        if (oldImageUrl) {
            try {
                const r2Client = createR2Client({
                    accountId: env.R2_ACCOUNT_ID,
                    accessKeyId: env.R2_ACCESS_KEY_ID,
                    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
                    bucketName: env.R2_BUCKET_NAME,
                });

                const oldKey = extractKeyFromUrl(oldImageUrl, env.R2_PUBLIC_URL);
                if (oldKey) {
                    await r2Client.deleteFile(oldKey);
                }
            } catch (error) {
                console.error("Failed to delete old avatar:", error);
            }
        }

        return { success: true, imageUrl };
    });
