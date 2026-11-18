CREATE TABLE IF NOT EXISTS posts (
  post_id TEXT PRIMARY KEY,
  region TEXT,
  category TEXT,
  first_crawled_at INTEGER,
  type TEXT DEFAULT 'NOTICE',
  url TEXT,
  thumbnail TEXT
);

CREATE TABLE IF NOT EXISTS post_versions (
  version_id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT,
  title TEXT,
  content TEXT,
  images TEXT,
  api_modify_date INTEGER,
  crawled_at INTEGER,
  api_create_date INTEGER,
  is_latest INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (post_id) REFERENCES posts(post_id)
);

CREATE INDEX IF NOT EXISTS idx_pv_post_is_latest ON post_versions(post_id, is_latest);
CREATE INDEX IF NOT EXISTS idx_pv_is_latest_date ON post_versions(is_latest, api_create_date);
