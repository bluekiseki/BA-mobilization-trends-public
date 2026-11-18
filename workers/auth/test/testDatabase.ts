import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/** Execute D1-style prepared statements against real SQLite, including atomic batch rollback. */
export function testDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE user_profiles (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE profile_data (profile_id TEXT, key TEXT, value TEXT, schema_version INTEGER DEFAULT 1, revision INTEGER DEFAULT 0, updated_at INTEGER, PRIMARY KEY(profile_id, key));
    CREATE TABLE profile_history (profile_id TEXT, recorded_at INTEGER, key TEXT, value TEXT, schema_version INTEGER DEFAULT 1, PRIMARY KEY(profile_id, recorded_at, key));
    CREATE INDEX profile_history_key_time ON profile_history(profile_id, key, recorded_at);
    INSERT INTO user_profiles VALUES ('p1', 'u1'), ('p2', 'u2');
  `);
  const reads: string[] = [];
  const prepare = (sql: string, params: SQLInputValue[] = []) => ({
    bind: (...values: SQLInputValue[]) => prepare(sql, values),
    all: () => {
      if (sql.startsWith('SELECT')) reads.push(sql);
      return Promise.resolve({ results: sqlite.prepare(sql).all(...params), success: true, meta: {} });
    },
    first: () => {
      reads.push(sql);
      return Promise.resolve(sqlite.prepare(sql).get(...params) ?? null);
    },
    run: () => Promise.resolve({ success: true, meta: { changes: sqlite.prepare(sql).run(...params).changes } }),
  });
  const adapter = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db: adapter as unknown as Cloudflare.Env['ba_user'], sqlite, reads };
}
