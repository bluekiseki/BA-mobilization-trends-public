import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { HiOutlineArrowDownTray, HiOutlineArrowUpTray, HiOutlineTrash } from 'react-icons/hi2';
import { downloadFile } from '~/utils/downloadFile';
import { ARENA_HISTORY_EXPORT_VERSION } from '~/features/my/common/historyJsonExchange';
import { arenaSeasonImportSchema } from '~/features/my/arena/scan/schema';
import type { Student } from '~/types/plannerData';
import type { ArenaRecord, ArenaRole, ArenaTeam } from '~/features/my/arena/types';
import { isEmptyQuery, matchesQuery, type ArenaQuery } from '~/features/my/arena/scan/records';
import { useArenaHistoryStore } from '~/features/my/arena/useArenaHistoryStore';
import { ArenaTeamRow, RoleIcon, StudentPortrait, TeamHeader, wonRowTint } from './ArenaTeamRow';

interface Props {
  query: ArenaQuery;
  students: Record<string, Student>;
  locale: string;
  // Search with one team of a battle: which side it was on and my role in that battle.
  onUseTeam: (team: ArenaTeam, side: 'me' | 'opponent', battle: ArenaRole) => void;
}

const BUTTON = 'inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm font-semibold transition-colors';
const BUTTON_IDLE = 'border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800';

// Saved battles of the selected season, newest first, narrowed by the same query as the opponent search.
export function ArenaHistory({ query, students, locale, onUseTeam }: Props) {
  const records = useArenaHistoryStore((s) => s.records);
  const seasonKey = useArenaHistoryStore((s) => s.seasonKey);
  const deleteRecord = useArenaHistoryStore((s) => s.deleteRecord);
  const replaceRecords = useArenaHistoryStore((s) => s.replaceRecords);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [importMessage, setImportMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Same JSON exchange as the other My pages (raids, gacha): versioned export, schema-validated import. Both work on the
  // selected season: export writes its bucket, import replaces it.
  const exportJson = () => {
    const exportData = { season: seasonKey, records, timestamp: new Date().toISOString(), version: ARENA_HISTORY_EXPORT_VERSION };
    downloadFile(JSON.stringify(exportData, null, 2), `BA_TacticalChallenge_${seasonKey}_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const importJsonFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const validated = arenaSeasonImportSchema.safeParse(Array.isArray(parsed) ? { records: parsed } : parsed);
      if (!validated.success) {
        const issue = validated.error.issues[0];
        throw new Error(`Invalid file format${issue?.path.length ? ` (${issue.path.join('.')})` : ''}`);
      }
      await replaceRecords(validated.data.records);
      setImportMessage({ text: `Imported ${validated.data.records.length} records`, error: false });
    } catch (error) {
      setImportMessage({ text: error instanceof Error ? error.message : 'Import failed', error: true });
    }
  };

  const handleImportInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    // Keep the element: React clears event.currentTarget once the handler awaits.
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    await importJsonFile(file);
    // Reset so picking the same file again fires onChange.
    input.value = '';
  };
  // Per-column filters (whose team, won or lost) on top of the search panel query.
  const [columnFilter, setColumnFilter] = useState<{ attack: ColumnFilterState; defense: ColumnFilterState }>({ attack: ANY_COLUMN, defense: ANY_COLUMN });
  const [period, setPeriod] = useState<Period>('all');
  const filtered = useMemo(() => {
    const since = period === 'all' ? 0 : Date.now() - PERIOD_DAYS[period] * DAY_MS;
    return records
      .filter((r) => {
        if (r.capturedAt < since) return false;
        // The panel's Battles setting narrows records only together with a nickname/student query; otherwise the column filters decide.
        if (!isEmptyQuery(query) && !matchesQuery(r, query)) return false;
        const sides = battleSides(r);
        return columnMatches(sides.attack, columnFilter.attack) && columnMatches(sides.defense, columnFilter.defense);
      })
      .sort((a, b) => b.capturedAt - a.capturedAt);
  }, [records, query, columnFilter, period]);
  // Win/loss of the listed records, overall and by my role.
  const stats = useMemo(() => {
    const tally = { attack: { won: 0, lost: 0 }, defense: { won: 0, lost: 0 } };
    for (const r of filtered) tally[r.role][r.won ? 'won' : 'lost'] += 1;
    const won = tally.attack.won + tally.defense.won;
    return { ...tally, won, lost: filtered.length - won };
  }, [filtered]);
  // With a query fixed to one battle role, each column's team side is fixed too (see battleSides).
  const lockedSide = (role: 'attack' | 'defense'): ColumnFilterState['side'] => (isEmptyQuery(query) || query.battle === 'any' ? 'any' : query.battle === role ? 'me' : 'opponent');
  const isAny = (f: ColumnFilterState) => f.side === 'any' && f.result === 'any';
  const filtering = period !== 'all' || !isEmptyQuery(query) || !isAny(columnFilter.attack) || !isAny(columnFilter.defense);
  const formatDate = (ms: number) => new Date(ms).toLocaleDateString(locale);

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">Records</h2>
        <span className="text-sm text-neutral-500">{filtering ? `${filtered.length} / ${records.length}` : records.length}</span>
        <div className="ml-auto flex gap-2">
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={(event) => void handleImportInputChange(event)} className="hidden" />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void importJsonFile(file);
            }}
            className={`${BUTTON} ${isDragActive ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-300' : BUTTON_IDLE}`}
            aria-label="Import JSON"
            title="Import JSON (replaces this season's records)"
          >
            <HiOutlineArrowUpTray className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <button type="button" onClick={exportJson} className={`${BUTTON} ${BUTTON_IDLE}`} aria-label="Export JSON" title="Export JSON">
            <HiOutlineArrowDownTray className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-1.5" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={chipClass(period === p)}>
              {p === 'all' ? 'All' : `${PERIOD_DAYS[p]}d`}
            </button>
          ))}
        </div>
        {filtered.length > 0 && (
          <p className="text-sm text-neutral-700 dark:text-neutral-200">
            <span className="font-semibold">
              {stats.won}W {stats.lost}L
            </span>
            <span className="text-neutral-500"> ({Math.round((stats.won / filtered.length) * 100)}%)</span>
            <span className="text-neutral-500">
              {' '}
              · Attack {stats.attack.won}-{stats.attack.lost} · Defense {stats.defense.won}-{stats.defense.lost}
            </span>
          </p>
        )}
      </div>
      {importMessage && <p className={`mb-2 text-xs ${importMessage.error ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{importMessage.text}</p>}
      <div className="grid gap-2 pb-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-6">
        {(['attack', 'defense'] as const).map((role) => (
          <ColumnFilter key={role} role={role} value={columnFilter[role]} lockedSide={lockedSide(role)} onChange={(v) => setColumnFilter((prev) => ({ ...prev, [role]: v }))} />
        ))}
        <span className="hidden w-16 sm:block" />
      </div>
      {filtered.length === 0 ? (
        <p className="border-t border-neutral-200 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">No saved records</p>
      ) : (
        filtered.map((r) => (
          <RecordRow
            key={r.id}
            record={r}
            students={students}
            date={formatDate(r.capturedAt)}
            onDelete={() => void deleteRecord(r.id)}
            onUseTeam={(side) => onUseTeam(side === 'me' ? r.me : r.opponent, side, r.role)}
          />
        ))
      )}
    </section>
  );
}

export interface ColumnFilterState {
  side: 'any' | 'me' | 'opponent';
  result: 'any' | 'win' | 'lose';
}

const ANY_COLUMN: ColumnFilterState = { side: 'any', result: 'any' };

type Period = 'all' | '7d' | '30d';
const PERIODS: Period[] = ['all', '7d', '30d'];
const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = { '7d': 7, '30d': 30 };
const DAY_MS = 24 * 60 * 60 * 1000;

const chipClass = (active: boolean) =>
  `border px-1.5 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-neutral-300 text-neutral-500 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-400'}`;

// Column caption with its own filters on that column's team: whose team it is and whether it won.
function ColumnFilter({
  role,
  value,
  lockedSide,
  onChange,
}: {
  role: 'attack' | 'defense';
  value: ColumnFilterState;
  lockedSide: ColumnFilterState['side'];
  onChange: (v: ColumnFilterState) => void;
}) {
  const chip = chipClass;
  // A side that cannot match the search panel's battle role; an already active chip stays clickable so it can be cleared.
  const sideBlocked = (side: 'me' | 'opponent') => lockedSide !== 'any' && lockedSide !== side && value.side !== side;
  // Clicking the active chip again clears it back to "any".
  const toggle = <K extends keyof ColumnFilterState>(key: K, v: ColumnFilterState[K]) => onChange({ ...value, [key]: value[key] === v ? 'any' : v });
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="mr-1 flex items-center gap-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        <RoleIcon role={role} /> {role === 'attack' ? 'Attack' : 'Defense'}
      </span>
      <button type="button" aria-pressed={value.side === 'me'} disabled={sideBlocked('me')} onClick={() => toggle('side', 'me')} className={chip(value.side === 'me')}>
        ME
      </button>
      <button type="button" aria-pressed={value.side === 'opponent'} disabled={sideBlocked('opponent')} onClick={() => toggle('side', 'opponent')} className={chip(value.side === 'opponent')}>
        Opponent
      </button>
      <span className="mx-0.5 h-4 w-px bg-neutral-300 dark:bg-neutral-700" />
      <button type="button" aria-pressed={value.result === 'win'} onClick={() => toggle('result', 'win')} className={chip(value.result === 'win')}>
        WIN
      </button>
      <button type="button" aria-pressed={value.result === 'lose'} onClick={() => toggle('result', 'lose')} className={chip(value.result === 'lose')}>
        LOSE
      </button>
    </div>
  );
}

const columnMatches = (t: { side: 'me' | 'opponent'; won: boolean }, f: ColumnFilterState) => (f.side === 'any' || f.side === t.side) && (f.result === 'any' || (f.result === 'win') === t.won);

// Columns are fixed to attack | defense (each role has its own battlefield layout, so positions stay comparable down the list).
// Who won and which team is mine are marked on each team instead of on the row.
export function battleSides(record: ArenaRecord) {
  const iAttacked = record.role === 'attack';
  const mine = { side: 'me' as const, team: record.me, won: record.won };
  const theirs = { side: 'opponent' as const, team: record.opponent, won: !record.won };
  return iAttacked ? { attack: mine, defense: theirs } : { attack: theirs, defense: mine };
}

export function OpponentName({ record, students }: { record: ArenaRecord; students: Record<string, Student> }) {
  const avatarId = record.opponent.avatarId;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {avatarId !== null && (
        <span className="w-5 shrink-0">
          <StudentPortrait id={avatarId} name={students[String(avatarId)]?.Name} />
        </span>
      )}
      {record.opponent.nickname && (
        <span className="truncate text-neutral-900 dark:text-neutral-100" title={record.opponent.nickname}>
          {record.opponent.nickname}
        </span>
      )}
    </span>
  );
}

function RecordRow({
  record,
  students,
  date,
  onDelete,
  onUseTeam,
}: {
  record: ArenaRecord;
  students: Record<string, Student>;
  date: string;
  onDelete: () => void;
  onUseTeam: (side: 'me' | 'opponent') => void;
}) {
  const sides = battleSides(record);
  return (
    <div className={`border-t border-neutral-200 py-2 dark:border-neutral-800 ${wonRowTint(record.won)}`}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:gap-6">
        {(['attack', 'defense'] as const).map((role) => {
          const t = sides[role];
          return (
            <div key={role} className="min-w-0">
              <TeamHeader role={role} won={t.side === 'me' ? t.won : undefined} side={t.side} name={<OpponentName record={record} students={students} />} onSearch={() => onUseTeam(t.side)} />
              <ArenaTeamRow team={t.team} students={students} />
            </div>
          );
        })}
        <div className="flex items-start justify-between gap-2 sm:flex-col sm:items-end">
          <span className="text-xs tabular-nums text-neutral-500">{date}</span>
          <button type="button" onClick={onDelete} aria-label="Delete" className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400">
            <HiOutlineTrash className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
