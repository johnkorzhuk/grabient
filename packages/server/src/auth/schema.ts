import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/* The sign-in library's four tables as production has always kept them: these names, these columns, times in
   milliseconds. Existing Google identities and sessions stay valid only while they stay so. */

const time = (name: string) => integer(name, { mode: "timestamp_ms" });

export const auth_user = sqliteTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  username: text("username").unique(),
  role: text("role").notNull(),
  attributionSource: text("attribution_source"),
  attributionMedium: text("attribution_medium"),
  attributionCampaign: text("attribution_campaign"),
  attributionReferrer: text("attribution_referrer"),
  attributionLanding: text("attribution_landing"),
  attributionAt: time("attribution_at"),
  createdAt: time("created_at").notNull(),
  updatedAt: time("updated_at").notNull()
});

export const auth_session = sqliteTable("auth_session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id").notNull(),
  expiresAt: time("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: time("created_at").notNull(),
  updatedAt: time("updated_at").notNull()
});

export const auth_account = sqliteTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: time("access_token_expires_at"),
  refreshTokenExpiresAt: time("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: time("created_at").notNull(),
  updatedAt: time("updated_at").notNull()
});

export const auth_verification = sqliteTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: time("expires_at").notNull(),
  createdAt: time("created_at").notNull(),
  updatedAt: time("updated_at").notNull()
});
