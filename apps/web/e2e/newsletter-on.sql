-- The site the browser tests read has the newsletter on, as readers will once an admin turns it on in Site features.
INSERT INTO k_flags (name, enabled, updated_at) VALUES ('newsletter', 1, 0)
ON CONFLICT (name) DO UPDATE SET enabled = 1;
