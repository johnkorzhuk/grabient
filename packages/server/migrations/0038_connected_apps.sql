-- Connected apps: what the OAuth provider keeps (packages/data-ops/src/auth). An app such as an MCP client registers
-- itself, an account allows it once on the consent page, and the app holds a refresh token it trades for access
-- tokens. Codes and tokens are stored hashed. Lists (scopes, redirect addresses) are JSON text. Every row about
-- an account goes with the account, and a token outlives the browser session it was allowed from.
CREATE TABLE IF NOT EXISTS auth_oauth_client (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT,
  disabled INTEGER DEFAULT 0,
  skip_consent INTEGER,
  enable_end_session INTEGER,
  subject_type TEXT,
  scopes TEXT,
  user_id TEXT REFERENCES auth_user(id) ON DELETE CASCADE,
  created_at INTEGER,
  updated_at INTEGER,
  name TEXT,
  uri TEXT,
  icon TEXT,
  contacts TEXT,
  tos TEXT,
  policy TEXT,
  software_id TEXT,
  software_version TEXT,
  software_statement TEXT,
  redirect_uris TEXT NOT NULL,
  post_logout_redirect_uris TEXT,
  token_endpoint_auth_method TEXT,
  grant_types TEXT,
  response_types TEXT,
  public INTEGER,
  type TEXT,
  require_pkce INTEGER,
  reference_id TEXT,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS auth_oauth_client_user_idx ON auth_oauth_client(user_id);
CREATE INDEX IF NOT EXISTS auth_oauth_client_created_idx ON auth_oauth_client(created_at);

CREATE TABLE IF NOT EXISTS auth_oauth_refresh_token (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES auth_oauth_client(client_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES auth_session(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  reference_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked INTEGER,
  auth_time INTEGER,
  scopes TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_oauth_refresh_token_client_idx ON auth_oauth_refresh_token(client_id, user_id);
CREATE INDEX IF NOT EXISTS auth_oauth_refresh_token_user_idx ON auth_oauth_refresh_token(user_id);
CREATE INDEX IF NOT EXISTS auth_oauth_refresh_token_session_idx ON auth_oauth_refresh_token(session_id);
CREATE INDEX IF NOT EXISTS auth_oauth_refresh_token_expires_idx ON auth_oauth_refresh_token(expires_at);

CREATE TABLE IF NOT EXISTS auth_oauth_access_token (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE,
  client_id TEXT NOT NULL REFERENCES auth_oauth_client(client_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES auth_session(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES auth_user(id) ON DELETE CASCADE,
  reference_id TEXT,
  refresh_id TEXT REFERENCES auth_oauth_refresh_token(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  scopes TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_oauth_access_token_client_idx ON auth_oauth_access_token(client_id, user_id);
CREATE INDEX IF NOT EXISTS auth_oauth_access_token_user_idx ON auth_oauth_access_token(user_id);
CREATE INDEX IF NOT EXISTS auth_oauth_access_token_session_idx ON auth_oauth_access_token(session_id);
CREATE INDEX IF NOT EXISTS auth_oauth_access_token_refresh_idx ON auth_oauth_access_token(refresh_id);
CREATE INDEX IF NOT EXISTS auth_oauth_access_token_expires_idx ON auth_oauth_access_token(expires_at);

CREATE TABLE IF NOT EXISTS auth_oauth_consent (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES auth_oauth_client(client_id) ON DELETE CASCADE,
  user_id TEXT REFERENCES auth_user(id) ON DELETE CASCADE,
  reference_id TEXT,
  scopes TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_oauth_consent_user_idx ON auth_oauth_consent(user_id, client_id);
CREATE INDEX IF NOT EXISTS auth_oauth_consent_client_idx ON auth_oauth_consent(client_id);
