CREATE TABLE IF NOT EXISTS voting_cooldowns (
  event_id INTEGER NOT NULL,
  voter_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('style_wars','music')),
  voted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id,voter_key,scope)
);
CREATE INDEX IF NOT EXISTS idx_voting_cooldowns_event_scope ON voting_cooldowns(event_id,scope);
CREATE TABLE IF NOT EXISTS track_vote_events (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL,
  track_id INTEGER NOT NULL,
  voter_key TEXT NOT NULL,
  voted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_track_vote_events_track ON track_vote_events(track_id);
