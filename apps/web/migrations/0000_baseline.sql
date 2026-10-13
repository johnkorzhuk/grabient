-- The Better Auth tables and the older palette tables every later migration builds on. Production's database
-- already holds them, so here they are created only where missing.
CREATE TABLE IF NOT EXISTS auth_user (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE, email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, attribution_source TEXT,
  attribution_medium TEXT, attribution_campaign TEXT, attribution_referrer TEXT,
  attribution_landing TEXT, attribution_at INTEGER
);
CREATE TABLE IF NOT EXISTS auth_session (
  id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ip_address TEXT, user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS auth_account (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  access_token TEXT, refresh_token TEXT, id_token TEXT, access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER, scope TEXT, password TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_verification (
  id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL,
  expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS palettes (id TEXT PRIMARY KEY, style TEXT NOT NULL, steps INTEGER NOT NULL, angle INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS likes (
  user_id TEXT NOT NULL, palette_id TEXT NOT NULL, coeff_key TEXT,
  style TEXT NOT NULL, steps INTEGER NOT NULL, angle INTEGER NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, palette_id)
);
CREATE TABLE IF NOT EXISTS refine_sessions (id TEXT PRIMARY KEY, user_id TEXT);
