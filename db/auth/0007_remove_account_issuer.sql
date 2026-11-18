-- Better Auth 1.7.0-1.7.2 briefly required an `issuer` column on `account`;
-- 1.7.3 reverted this and recognizes accounts by (providerId, accountId) again,
-- as in 1.6. See: https://www.better-auth.com/docs/guides/1-7-upgrade-guide
-- SQLite requires rebuilding the table to drop the NOT NULL issuer column.
CREATE TABLE account_new (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
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

INSERT INTO account_new (
  id, userId, accountId, providerId, accessToken, refreshToken, idToken,
  accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt
)
SELECT
  id, userId, accountId, providerId, accessToken, refreshToken, idToken,
  accessTokenExpiresAt, refreshTokenExpiresAt, scope, password, createdAt, updatedAt
FROM account;

DROP TABLE account;
ALTER TABLE account_new RENAME TO account;

CREATE INDEX idx_account_userId ON account(userId);
CREATE UNIQUE INDEX idx_account_provider_account_id ON account(providerId, accountId);
