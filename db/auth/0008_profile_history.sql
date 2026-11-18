CREATE TABLE profile_history (
  profile_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  recorded_at INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (profile_id, recorded_at, key)
);
CREATE INDEX profile_history_key_time ON profile_history(profile_id, key, recorded_at);
