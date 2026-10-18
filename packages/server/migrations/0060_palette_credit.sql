-- The username an account lets the site show on the palettes it liked first, as it stood when a check found it fit to
-- show (apps/web/src/server/account/credit.ts). NULL, which every account holds until it turns this on in Settings,
-- shows nothing. A palette's credit reads it only while it is still the account's username, so a name changed since
-- is never shown before it is checked. Additive.
ALTER TABLE auth_user ADD COLUMN credit_name TEXT;
