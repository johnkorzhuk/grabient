-- The admins' likes are one pool, and each keeps where it was pressed (apps/web/src/server/likes.ts): the search it
-- answered, as every list's address writes its words, and the collection whose page showed it. `via` says how a like
-- was made when not on the site's own pages: 'mcp' through a connected app, 'production' when it was carried over from
-- grabient.com. The three are written for admin accounts alone; every other account's likes leave them empty.
ALTER TABLE k_likes ADD COLUMN query TEXT;
ALTER TABLE k_likes ADD COLUMN collection_id TEXT;
ALTER TABLE k_likes ADD COLUMN via TEXT;

-- The admin accounts, a handful among every account: read whenever an admin's likes are.
CREATE INDEX IF NOT EXISTS auth_user_admin_idx ON auth_user(role) WHERE role = 'admin';
