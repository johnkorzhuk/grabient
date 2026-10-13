-- Google's tokens (access, refresh and ID; the ID token holds the name, email and picture) are never used: the site
-- asks Google who you are at sign-in and never calls it again. The auth config writes none (NO_TOKENS in
-- packages/data-ops/src/auth/index.ts); this clears the ones already stored.
UPDATE auth_account SET access_token = NULL, refresh_token = NULL, id_token = NULL, access_token_expires_at = NULL, refresh_token_expires_at = NULL
  WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL OR id_token IS NOT NULL OR access_token_expires_at IS NOT NULL OR refresh_token_expires_at IS NOT NULL;

-- Sessions record no address (disableIpTracking); this clears it from the rows already stored.
UPDATE auth_session SET ip_address = NULL WHERE ip_address IS NOT NULL;
