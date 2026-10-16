-- An account made where the law asks for a yes before the newsletter (packages/server/src/consent.ts, the rules ask and
-- tell) holds 1: until it makes a choice of its own (k_newsletter.subscribed) it gets no newsletter. NULL, which every
-- other account holds, keeps the newsletter's own rule: it comes until the account ends it. The sign-in library
-- writes it once, as it makes the account (auth/library.ts). Additive.
ALTER TABLE auth_user ADD COLUMN newsletter_opt_in INTEGER;
