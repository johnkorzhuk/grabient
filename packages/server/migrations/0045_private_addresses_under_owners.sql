-- A private collection lives under its owner: @{handle}/{its title's address}, the handle being the account's username in
-- lowercase or, for an account without one, an underscore and the first ten characters of its id in lowercase (the
-- design package's accountHandle). Collections saved before had the title's address and a random word at the top level
-- (title-xxxxxxxx), or an account's own form (@name/title): each moves under its owner, keeping the title's part, cut
-- so the address stays within 80 characters, with -2, -3… where an owner holds two of one title. Only accounts' private
-- collections move; the agents' and every public one keep their addresses.
WITH moving AS (
  SELECT c.id,
    CASE WHEN u.username IS NOT NULL AND trim(u.username) <> '' THEN lower(trim(u.username))
      ELSE '_' || substr(lower(c.owner_id), 1, 10) END AS handle,
    CASE WHEN instr(c.slug, '/') > 0 THEN substr(c.slug, instr(c.slug, '/') + 1)
      WHEN length(c.slug) > 9 AND substr(c.slug, -9, 1) = '-' AND instr(substr(c.slug, -8), '-') = 0 THEN substr(c.slug, 1, length(c.slug) - 9)
      ELSE c.slug END AS title_part
  FROM k_collections c LEFT JOIN auth_user u ON u.id = c.owner_id
  WHERE c.owner_kind = 'user' AND c.visibility = 'private'
), fitted AS (
  SELECT id, handle, coalesce(nullif(rtrim(substr(title_part, 1, 74 - length(handle)), '-'), ''), 'collection') AS base FROM moving
), numbered AS (
  SELECT id, handle, base, ROW_NUMBER() OVER (PARTITION BY handle, base ORDER BY id) AS n FROM fitted
)
UPDATE k_collections SET slug = (
  SELECT '@' || handle || '/' || base || CASE WHEN n > 1 THEN '-' || n ELSE '' END FROM numbered WHERE numbered.id = k_collections.id
) WHERE id IN (SELECT id FROM numbered);
