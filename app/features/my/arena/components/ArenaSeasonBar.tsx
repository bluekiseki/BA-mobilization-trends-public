import { useArenaHistoryStore } from '~/features/my/arena/useArenaHistoryStore';
import { ARENA_SERVERS, currentSeasonKey, seasonLabel } from '~/features/my/arena/scan/seasons';
import { Segmented } from './ArenaSearch';

// Server, then season, for the whole page: search, records and stats all use the selected season only (a new season resets
// the meta, so older battles are kept apart rather than mixed in). Without a profile, the server can be switched here; with one it is shown read-only.
export function ArenaSeasonBar({ serverLocked }: { serverLocked: boolean }) {
  const server = useArenaHistoryStore((s) => s.server);
  const seasonKey = useArenaHistoryStore((s) => s.seasonKey);
  const seasonKeys = useArenaHistoryStore((s) => s.seasonKeys);
  const selectSeason = useArenaHistoryStore((s) => s.selectSeason);
  const setServer = useArenaHistoryStore((s) => s.setServer);
  if (!server) return null;
  const current = currentSeasonKey(server);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      {serverLocked ? (
        // A profile's data belongs to its server, so the server changes only by switching profiles.
        <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          Server
          <span className="text-sm text-neutral-800 dark:text-neutral-200">{ARENA_SERVERS.find((o) => o.value === server)?.label}</span>
        </span>
      ) : (
        <Segmented label="Server" options={ARENA_SERVERS} value={server} onChange={(v) => void setServer(v, true)} />
      )}
      <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        Season
        <select
          value={seasonKey}
          onChange={(e) => void selectSeason(e.target.value)}
          className="border border-neutral-300 bg-transparent px-1 py-0.5 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          {seasonKeys.map((key) => (
            <option key={key} value={key}>
              {seasonLabel(key)}
              {key === current ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
