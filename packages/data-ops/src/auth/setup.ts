import { betterAuth, type BetterAuthOptions } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { AwsClient } from "aws4fetch";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

async function migrateClerkAvatarToR2(
  userId: string,
  clerkImageUrl: string,
  r2Config: R2Config,
  updateUserImage: (userId: string, newImageUrl: string) => Promise<void>
): Promise<void> {
  try {
    // Download from Clerk
    const response = await fetch(clerkImageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AvatarMigration/1.0)' },
    });

    if (!response.ok) {
      console.error(`[avatar-migration] Failed to download Clerk avatar for ${userId}`);
      return;
    }

    const imageData = await response.arrayBuffer();
    const buffer = new Uint8Array(imageData);

    // Detect content type from magic bytes
    let contentType = 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      contentType = 'image/png';
    } else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
               buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      contentType = 'image/webp';
    } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      contentType = 'image/gif';
    }

    // Upload to R2
    const timestamp = Date.now();
    const r2Key = `avatars/${userId}/${timestamp}.webp`;

    const client = new AwsClient({
      accessKeyId: r2Config.accessKeyId,
      secretAccessKey: r2Config.secretAccessKey,
    });

    const endpoint = `https://${r2Config.accountId}.r2.cloudflarestorage.com`;
    const uploadUrl = `${endpoint}/${r2Config.bucketName}/${r2Key}`;

    const uploadResponse = await client.fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      console.error(`[avatar-migration] Failed to upload to R2 for ${userId}: ${uploadResponse.status}`);
      return;
    }

    // Update user's image URL in database
    const newImageUrl = `${r2Config.publicUrl}/${r2Key}`;
    await updateUserImage(userId, newImageUrl);

    console.log(`[avatar-migration] Successfully migrated avatar for ${userId}`);
  } catch (error) {
    console.error(`[avatar-migration] Error migrating avatar for ${userId}:`, error);
  }
}

export const createBetterAuth = (config: {
  database: BetterAuthOptions["database"];
  secret?: BetterAuthOptions["secret"];
  socialProviders?: BetterAuthOptions["socialProviders"];
  emailAndPassword?: { enabled: boolean; requireEmailVerification?: boolean };
  sendMagicLink?: (data: { email: string; url: string; token: string }, request?: Request) => void | Promise<void>;
  sendDeleteAccountVerification?: (data: {
    user: {
      id: string;
      email: string;
      emailVerified: boolean;
      username?: string | null;
      createdAt: Date;
      updatedAt: Date;
      image?: string | null;
    };
    url: string;
    token: string;
  }, request?: Request) => Promise<void>;
  r2Config?: R2Config;
  drizzleDb?: unknown;
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

  return betterAuth({
    database: config.database,
    secret: config.secret,
    emailAndPassword: config.emailAndPassword ?? {
      enabled: false,
    },
    socialProviders: config.socialProviders,
    plugins,
    user: {
      modelName: "auth_user",
      additionalFields: {
        username: {
          type: "string",
          required: false,
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
    databaseHooks: config.r2Config && config.drizzleDb ? {
      session: {
        create: {
          after: async (session) => {
            // Check if user has a Clerk avatar that needs migration
            // We need to query the user to get their image URL
            const db = config.drizzleDb as ReturnType<typeof import("drizzle-orm/d1").drizzle>;
            const { auth_user } = await import("@/drizzle/auth-schema");
            const { eq } = await import("drizzle-orm");

            const users = await db.select({ id: auth_user.id, image: auth_user.image })
              .from(auth_user)
              .where(eq(auth_user.id, session.userId))
              .limit(1);

            const user = users[0];
            if (user?.image?.includes('img.clerk.com')) {
              // Migrate in background - don't block session creation
              migrateClerkAvatarToR2(
                user.id,
                user.image,
                config.r2Config!,
                async (userId, newImageUrl) => {
                  await db.update(auth_user)
                    .set({ image: newImageUrl, updatedAt: new Date() })
                    .where(eq(auth_user.id, userId));
                }
              ).catch(err => console.error('[avatar-migration] Background migration failed:', err));
            }
          },
        },
      },
    } : undefined,
  });
};
