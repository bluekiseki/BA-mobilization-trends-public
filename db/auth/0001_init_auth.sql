-- better-auth managed tables
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  emailVerified INTEGER,
  name TEXT,
  image TEXT,
  createdAt INTEGER,
  updatedAt INTEGER,
  seq INTEGER,
  username TEXT,
  displayUsername TEXT
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  issuer TEXT NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER,
  updatedAt INTEGER,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  expiresAt INTEGER,
  ipAddress TEXT,
  userAgent TEXT,
  createdAt INTEGER,
  updatedAt INTEGER,
  token TEXT,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER,
  createdAt INTEGER,
  updatedAt INTEGER,
  UNIQUE(identifier, value)
);

CREATE TABLE IF NOT EXISTS passkey (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT,
  publicKey TEXT NOT NULL,
  counter INTEGER,
  transports TEXT,
  createdAt INTEGER,
  updatedAt INTEGER,
  webauthnUserId TEXT,
  deviceType TEXT,
  backedUp INTEGER,
  aaguid TEXT,
  credentialID TEXT,
  FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rate_limit (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  lastRequest INTEGER NOT NULL
);

-- Custom user profile tables
CREATE TABLE IF NOT EXISTS user_profiles (
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

CREATE TABLE IF NOT EXISTS profile_data (
  profile_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (profile_id, key),
  FOREIGN KEY (profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_email ON user(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON user(username);
CREATE INDEX IF NOT EXISTS idx_account_userId ON account(userId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_issuer_account_id ON account(issuer, accountId);
CREATE INDEX IF NOT EXISTS idx_session_userId ON session(userId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_passkey_userId ON passkey(userId);
CREATE INDEX IF NOT EXISTS idx_passkey_credentialID ON passkey(credentialID);
CREATE INDEX IF NOT EXISTS idx_user_profiles_userId ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_data_profileId ON profile_data(profile_id);

-- Sequential display ID trigger
CREATE TRIGGER IF NOT EXISTS user_seq_trigger
  AFTER INSERT ON user
BEGIN
  UPDATE user SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM user WHERE id != NEW.id) + 1
  WHERE id = NEW.id;
END;
