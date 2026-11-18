import { profileHistoryFingerprint } from '../../app/utils/profileHistoryFingerprint';
import { validateProfileDataValue } from '../../app/schemas/profileDataValidation';
type Database = Cloudflare.Env['ba_user'];
interface Row {
  key: string;
  value: string | null;
  schema_version: number;
  recorded_at: number;
}
interface Current {
  key: string;
  value: string;
  schema_version: number;
  revision: number;
  updated_at?: number;
}
interface Meta {
  closed: boolean;
  disabled?: boolean;
  before?: number;
  keys?: string[];
  requestId?: string;
  startedAt?: number;
}
const parse = (row: Row): Meta => JSON.parse(row.value ?? '{}') as Meta;
const encoder = new TextEncoder();
function decodeValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
async function historyMetadata(db: Database, profileId: string) {
  const rows = (
    await db
      .prepare(
        "SELECT recorded_at, MAX(CASE WHEN key = '' THEN value END) value, COALESCE(SUM(length(CAST(value AS BLOB))), 0) bytes FROM profile_history WHERE profile_id = ? GROUP BY recorded_at ORDER BY recorded_at DESC",
      )
      .bind(profileId)
      .all<Row & { bytes: number }>()
  ).results;
  return { headers: rows.filter((row) => row.value !== null), bytes: rows.reduce((total, row) => total + row.bytes, 0) };
}
export async function historyList(db: Database, profileId: string, before = Number.MAX_SAFE_INTEGER) {
  const result = await db
    .prepare("SELECT recorded_at, value FROM profile_history WHERE profile_id = ? AND key = '' AND recorded_at < ? ORDER BY recorded_at DESC LIMIT 20")
    .bind(profileId, before)
    .all<Row>();
  return result.results.map((row) => ({ recordedAt: row.recorded_at, ...parse(row) }));
}
export async function historyValues(db: Database, profileId: string, at: number) {
  const header = await db.prepare("SELECT * FROM profile_history WHERE profile_id = ? AND key = '' AND recorded_at = ?").bind(profileId, at).first<Row>();
  if (!header || parse(header).disabled) throw new Error('HISTORY_EXPIRED');
  const rows = await db
    .prepare(
      `SELECT h.* FROM profile_history h JOIN (SELECT key, MAX(recorded_at) t FROM profile_history WHERE profile_id = ? AND key != '' AND recorded_at <= ? GROUP BY key) p ON h.key = p.key AND h.recorded_at = p.t WHERE h.profile_id = ?`,
    )
    .bind(profileId, at, profileId)
    .all<Row>();
  return rows.results.map((row) => ({ key: row.key, value: row.value === null ? null : decodeValue(row.value), schemaVersion: row.schema_version }));
}
export interface HistoryWrite {
  key: string;
  value: unknown;
  schemaVersion: number;
  baseRevision: number;
}
export async function writeWithHistory(
  db: Database,
  profileId: string,
  changes: HistoryWrite[],
  restore?: { before: number; keys: string[]; requestId: string; sourceAt: number; fingerprint: string },
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = (await db.prepare('SELECT key, value, schema_version, revision, updated_at FROM profile_data WHERE profile_id = ?').bind(profileId).all<Current>()).results;
    const metadata = await historyMetadata(db, profileId);
    const headers = metadata.headers;
    if (restore) {
      const repeated = headers.find((row) => parse(row).requestId === restore.requestId);
      if (repeated) return { recordedAt: repeated.recorded_at, results: [] };
    }
    if (restore) {
      const source = await historyValues(db, profileId, restore.sourceAt);
      if ((await profileHistoryFingerprint(source)) !== restore.fingerprint) throw new Error('HISTORY_CHANGED');
    }
    const last = headers[0];
    const baselineBytes = current.reduce((sum, row) => sum + encoder.encode(row.value).byteLength, 0);
    const historyDisabled = baselineBytes > 5 * 1024 * 1024;
    if (restore && historyDisabled) throw new Error('HISTORY_CAPACITY');
    const at = Math.max(Date.now(), (last?.recorded_at ?? 0) + 1);
    const results = [];
    const accepted: Current[] = [];
    const byKey = new Map(current.map((row) => [row.key, row]));
    for (const change of changes) {
      const existing = byKey.get(change.key);
      try {
        validateProfileDataValue(change.key, change.value);
        if (!Number.isInteger(change.schemaVersion) || change.schemaVersion < 1) throw new Error('Invalid schema version');
        if (!existing && byKey.size + accepted.filter((row) => !byKey.has(row.key)).length >= 500) throw new Error('Profile key limit reached');
      } catch (error) {
        results.push({ key: change.key, status: 'REJECTED', revision: existing?.revision ?? 0, message: String(error) });
        continue;
      }
      if ((existing?.revision ?? 0) !== change.baseRevision) {
        let value: unknown = existing?.value ?? null;
        try {
          if (existing) value = JSON.parse(existing.value);
        } catch {
          /* Legacy theme values are plain text. */
        }
        results.push({
          key: change.key,
          status: 'CONFLICT',
          revision: existing?.revision ?? 0,
          serverValue: value,
          schemaVersion: existing?.schema_version ?? 1,
          updatedAt: existing?.updated_at ?? null,
        });
        continue;
      }
      const value = JSON.stringify(change.value);
      const revision = existing && JSON.stringify(decodeValue(existing.value)) === value && existing.schema_version === change.schemaVersion ? existing.revision : (existing?.revision ?? 0) + 1;
      results.push({ key: change.key, status: 'APPLIED', revision, updatedAt: Math.floor(at / 1000) });
      if (revision !== existing?.revision) accepted.push({ key: change.key, value, schema_version: change.schemaVersion, revision });
    }
    if (restore && results.some((row) => row.status !== 'APPLIED')) throw new Error('SYNC_CONFLICT');
    if (!accepted.length && !restore) return { recordedAt: last?.recorded_at ?? null, results };
    const statements = [];
    const revisions = JSON.stringify(Object.fromEntries(current.map((row) => [row.key, row.revision])));
    statements.push(
      db
        .prepare(
          `SELECT CASE WHEN (SELECT COUNT(*) FROM profile_data WHERE profile_id = ?) = ? AND NOT EXISTS (SELECT 1 FROM profile_data WHERE profile_id = ? AND revision IS NOT json_extract(?, '$.' || '"' || key || '"')) AND COALESCE((SELECT recorded_at || ':' || value FROM profile_history WHERE profile_id = ? AND key = '' ORDER BY recorded_at DESC LIMIT 1),'') = ? THEN 1 ELSE json('HISTORY_RETRY') END`,
        )
        .bind(profileId, current.length, profileId, revisions, profileId, last ? `${last.recorded_at}:${last.value}` : ''),
    );
    if (restore)
      statements.push(
        db
          .prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM profile_history WHERE profile_id = ? AND key = '' AND recorded_at = ?) THEN 1 ELSE json('HISTORY_RETRY') END")
          .bind(profileId, restore.sourceAt),
      );
    const merge = last && !parse(last).closed && !restore && at - (parse(last).startedAt ?? last.recorded_at) < 1800000;
    const startedAt = merge ? (parse(last).startedAt ?? last.recorded_at) : at;
    let addedBytes = 0;
    const insert = (time: number, rows: Array<{ key: string; value: string | null; schema_version: number }>) => {
      const normalized = rows.map((row) => ({ ...row, value: row.key && row.value !== null ? JSON.stringify(decodeValue(row.value)) : row.value }));
      for (const row of normalized) addedBytes += encoder.encode(row.value ?? '').byteLength;
      return db
        .prepare(`INSERT OR REPLACE INTO profile_history SELECT ?, ?, json_extract(value,'$.key'), json_extract(value,'$.value'), json_extract(value,'$.schema_version') FROM json_each(?)`)
        .bind(profileId, time, JSON.stringify(normalized));
    };
    if (!last || parse(last).disabled) statements.push(insert(at - 1, [...current, { key: '', value: '{"closed":true}', schema_version: 1 }]));
    if (merge) {
      const closed = headers.find((row) => parse(row).closed)?.recorded_at ?? 0;
      statements.push(
        db
          .prepare("DELETE FROM profile_history WHERE profile_id = ? AND recorded_at > ? AND (key = '' OR key IN (SELECT json_extract(value,'$.key') FROM json_each(?)))")
          .bind(profileId, closed, JSON.stringify(accepted)),
      );
    } else if (last) {
      const closed = JSON.stringify({ ...parse(last), closed: true });
      addedBytes += Math.max(0, encoder.encode(closed).byteLength - encoder.encode(last.value ?? '').byteLength);
      statements.push(db.prepare("UPDATE profile_history SET value = ? WHERE profile_id = ? AND key = '' AND recorded_at = ?").bind(closed, profileId, last.recorded_at));
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO profile_data(profile_id,key,value,schema_version,revision,updated_at) SELECT ?,json_extract(value,'$.key'),json_extract(value,'$.value'),json_extract(value,'$.schema_version'),json_extract(value,'$.revision'),? FROM json_each(?) WHERE true ON CONFLICT(profile_id,key) DO UPDATE SET value=excluded.value,schema_version=excluded.schema_version,revision=excluded.revision,updated_at=excluded.updated_at`,
        )
        .bind(profileId, Math.floor(at / 1000), JSON.stringify(accepted)),
    );
    statements.push(
      insert(at, [
        ...accepted.map((row) => ({ ...row, value: row.value === 'null' ? null : row.value })),
        { key: '', value: JSON.stringify({ closed: !!restore, startedAt, ...(restore ? { before: restore.before, keys: restore.keys, requestId: restore.requestId } : {}) }), schema_version: 1 },
      ]),
    );
    if (historyDisabled) {
      const latestWrite = statements[statements.length - 2];
      statements.splice(
        1,
        statements.length - 1,
        latestWrite,
        db.prepare('DELETE FROM profile_history WHERE profile_id = ?').bind(profileId),
        insert(at, [{ key: '', value: JSON.stringify({ closed: true, disabled: true }), schema_version: 1 }]),
      );
    }
    try {
      await db.batch(statements);
      if (!historyDisabled && (headers.length >= 100 || metadata.bytes + addedBytes > 5 * 1024 * 1024)) await pruneHistory(db, profileId);
      return { recordedAt: at, results };
    } catch (error) {
      if (!String(error).includes('malformed JSON') || attempt === 3) throw error;
    }
  }
  throw new Error('HISTORY_RETRY');
}
async function pruneHistory(db: Database, profileId: string) {
  const { headers, bytes } = await historyMetadata(db, profileId);
  let cutoff = headers[Math.min(99, headers.length - 1)]?.recorded_at;
  if (!cutoff || (headers.length <= 100 && bytes <= 5 * 1024 * 1024)) return;
  if (bytes > 5 * 1024 * 1024) cutoff = headers[0].recorded_at;
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO profile_history SELECT profile_id,?,key,value,schema_version FROM profile_history h WHERE profile_id = ? AND key != '' AND recorded_at = (SELECT MAX(recorded_at) FROM profile_history WHERE profile_id=h.profile_id AND key=h.key AND recorded_at<=?)`,
      )
      .bind(cutoff, profileId, cutoff),
    db.prepare('DELETE FROM profile_history WHERE profile_id = ? AND recorded_at < ?').bind(profileId, cutoff),
  ]);
}
