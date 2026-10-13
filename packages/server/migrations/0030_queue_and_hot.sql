-- The queue and the hot score. Additive; nothing existing changes shape.
--
-- k_queue holds what the seeding agents planned ahead: a like by a persona, or palettes for a collection, each with
-- the time it is due. The Worker's schedule applies what is due (server/queue.ts), so the agents can fill the queue
-- months ahead. `key` is the planner's own name for an item, so a plan pushed twice queues once. A row is never
-- deleted by the applier: done, failed and cancelled rows are the record of what happened.
CREATE TABLE IF NOT EXISTS k_queue (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE,
  agent TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('like','collection')),
  actor TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  label TEXT NOT NULL DEFAULT '',
  due_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due','running','done','failed','cancelled')),
  result TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  done_at INTEGER
);
CREATE INDEX IF NOT EXISTS k_queue_due_idx ON k_queue(status, due_at, id);
CREATE INDEX IF NOT EXISTS k_queue_agent_idx ON k_queue(agent, due_at, id);
CREATE INDEX IF NOT EXISTS k_queue_label_idx ON k_queue(label, due_at);

-- The personas: the accounts the agents like with. A like keeps its key (user, palette), so a persona is a real row in
-- auth_user, marked here; it has no credentials and its address cannot receive mail. `taste` is the planner's note of
-- what the persona goes for, a JSON list of words.
CREATE TABLE IF NOT EXISTS k_personas (
  user_id TEXT PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  taste TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

-- The hot score (server/hot.ts): recent likes, decayed, and newness. Written by the schedule and moved by a like the
-- moment it lands. The home page orders by it, then by likes_count for the palettes nothing touched lately.
ALTER TABLE k_palettes ADD COLUMN hot REAL NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS k_palettes_hot_idx ON k_palettes(hot DESC, likes_count DESC, seed);
ALTER TABLE k_collections ADD COLUMN hot REAL NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS k_collections_hot_idx ON k_collections(visibility, hot DESC, updated_at DESC);
