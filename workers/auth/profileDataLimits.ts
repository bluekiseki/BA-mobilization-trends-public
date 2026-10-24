// Cap on sync keys per profile: checked only when a new key would be created (updates cost no extra query).
// Production peaks at 26 keys per profile (2026-10), so 500 only stops runaway key creation filling ba-user.
export const MAX_KEYS_PER_PROFILE = 500;

// The slice of D1Database this needs, so tests can pass a plain object.
export interface CountQueryDb {
  prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null> } };
}

export async function assertCanCreateKey(userDb: CountQueryDb, profileId: string): Promise<void> {
  const row = await userDb.prepare('SELECT COUNT(*) AS c FROM profile_data WHERE profile_id = ?').bind(profileId).first<{ c: number }>();
  if ((row?.c ?? 0) >= MAX_KEYS_PER_PROFILE) throw new Error(`Too many keys for this profile (max ${MAX_KEYS_PER_PROFILE})`);
}
