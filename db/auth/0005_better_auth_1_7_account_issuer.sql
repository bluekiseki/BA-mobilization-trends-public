-- Better Auth 1.7 identifies an external account by (issuer, accountId).
-- SQLite requires rebuilding the table to add the required issuer column.
CREATE TABLE account_new (
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

-- Only credential and GitHub are configured authentication providers.
-- A different legacy provider intentionally fails the migration until its
-- trusted issuer mapping is added explicitly.
INSERT INTO account_new (
  id, userId, issuer, accountId, providerId, accessToken, refreshToken, idToken,
  accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt
)
SELECT
  id,
  userId,
  CASE providerId
    WHEN 'credential' THEN 'local:credential'
    WHEN 'github' THEN 'local:oauth:github'
  END,
  CASE WHEN providerId = 'credential' THEN userId ELSE accountId END,
  providerId,
  accessToken,
  refreshToken,
  idToken,
  accessTokenExpiresAt,
  refreshTokenExpiresAt,
  scope,
  password,
  createdAt,
  updatedAt
FROM account;

DROP TABLE account;
ALTER TABLE account_new RENAME TO account;

CREATE INDEX idx_account_userId ON account(userId);
CREATE UNIQUE INDEX idx_account_issuer_account_id ON account(issuer, accountId);
