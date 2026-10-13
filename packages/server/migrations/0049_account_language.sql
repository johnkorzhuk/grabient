-- The language an account reads Grabient in: one of the tags in packages/i18n/src/locales.ts, or NULL while none is known.
-- An email that no page asks for is written in it; one a page asks for (a sign-in link, a deletion's confirmation) is
-- written in that page's language. The first page the account syncs from sets it (apps/web/src/server/account-sync.ts),
-- and no later sync changes it. Additive.
ALTER TABLE auth_user ADD COLUMN locale TEXT;
