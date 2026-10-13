-- A private collection is its owner's alone: every public read leaves it out, and it takes a private address, its title
-- plus a random word (collections.ts privateSlug). Private collections at a bare top-level word (/blue) get a random
-- word after it, so the word leads to its search for everyone else. An account's own @name/ form stays: it takes nobody
-- else's word. Trimmed to 70 characters first, so the address stays within the 80 an address may have.
UPDATE k_collections
SET slug = rtrim(substr(slug, 1, 70), '-') || '-' || lower(hex(randomblob(4)))
WHERE owner_kind = 'user' AND visibility = 'private' AND instr(slug, '/') = 0;

-- A collection's saves count the accounts that hold a copy, each once (collections.ts recountCopies).
UPDATE k_collections
SET fork_count = (SELECT COUNT(DISTINCT f.owner_id) FROM k_collections f WHERE f.forked_from = k_collections.id AND f.owner_kind = 'user');

-- The reads these serve: the saves count above, the hot score's pass over the likes of the last weeks (hot.ts), and the
-- username check while a name is typed in Settings, which compares names without case.
CREATE INDEX IF NOT EXISTS k_collections_forked_from_idx ON k_collections(forked_from);
CREATE INDEX IF NOT EXISTS k_likes_created_idx ON k_likes(created_at);
CREATE INDEX IF NOT EXISTS auth_user_username_lower_idx ON auth_user(lower(username));
