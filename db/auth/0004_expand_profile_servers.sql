-- Rebuild both related tables so existing profile data remains intact while
-- expanding the server CHECK constraint used by older databases.
CREATE TABLE user_profiles_next (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Profile 1',
  server TEXT CHECK(server IN ('jp', 'kr', 'tw', 'asia', 'global', 'na')) DEFAULT 'jp',
  is_default INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

INSERT INTO user_profiles_next (id, user_id, name, server, is_default, sort_order, created_at, updated_at)
SELECT id, user_id, name, CASE WHEN server = 'both' THEN 'kr' ELSE server END, is_default, sort_order, created_at, updated_at
FROM user_profiles;

CREATE TABLE profile_data_next (
  profile_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, key),
  FOREIGN KEY (profile_id) REFERENCES user_profiles_next(id) ON DELETE CASCADE
);

INSERT INTO profile_data_next (profile_id, key, value, updated_at, schema_version, revision)
SELECT profile_id, key, value, updated_at, schema_version, revision
FROM profile_data;

DROP TABLE profile_data;
DROP TABLE user_profiles;

ALTER TABLE user_profiles_next RENAME TO user_profiles;
ALTER TABLE profile_data_next RENAME TO profile_data;

CREATE INDEX idx_user_profiles_userId ON user_profiles(user_id);
CREATE INDEX idx_profile_data_profileId ON profile_data(profile_id);
