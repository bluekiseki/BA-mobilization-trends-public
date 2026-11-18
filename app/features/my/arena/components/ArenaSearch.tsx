// Team lookup in one panel. The in-game opponent list shows only the nickname and defense slots 1, 5 and 6; after one battle
// the whole team is known. Any subset of the six slots (plus nickname) can be entered, on either side (opponent / mine) and
// for either battle type (my attack / my defense). Matching teams are listed with the teams they faced and my results.
import { useMemo, useState } from 'react';
import { HiOutlineXMark } from 'react-icons/hi2';
import StudentSearchDropdown from '~/components/student/StudentSearchDropdown';
import type { Student } from '~/types/plannerData';
import type { ArenaRecord, ArenaTeam } from '~/features/my/arena/types';
import {
  isEmptyQuery,
  opponentCandidates,
  rankCounters,
  seenStudents,
  summarizeMatchups,
  type ArenaQuery,
  type BattleFilter,
  type CounterSort,
  type QuerySide,
} from '~/features/my/arena/scan/records';
import { ArenaTeamRow, StudentPortrait, TeamHeader } from './ArenaTeamRow';
import { ArenaNicknameSearch } from './ArenaNicknameSearch';

export interface ArenaSearchState {
  nickname: string;
  slots: (number | null)[]; // index 0-3 = strikers (slots 1-4), 4-5 = specials (slots 5-6)
  side: QuerySide;
  battle: BattleFilter;
  // Same positions (strikers compared slot by slot) or any order.
  ordered: boolean;
}

// Default: opponents' defenses in battles where I attacked (finding a counter from the opponent list).
export const EMPTY_SEARCH: ArenaSearchState = { nickname: '', slots: [null, null, null, null, null, null], side: 'opponent', battle: 'attack', ordered: true };

const present = (ids: (number | null)[]) => ids.filter((id): id is number => id !== null);

export const toQuery = (s: ArenaSearchState): ArenaQuery => ({
  nickname: s.nickname,
  strikerSlots: s.slots.slice(0, 4),
  specials: present(s.slots.slice(4)),
  ordered: s.ordered,
  side: s.side,
  battle: s.battle,
});

// The queried team's battlefield layout: an opponent in battles I attacked is defending, and so on.
const queriedRole = (side: QuerySide, battle: BattleFilter): 'attack' | 'defense' | null => {
  if (side === 'any' || battle === 'any') return null;
  return (side === 'me') === (battle === 'attack') ? 'attack' : 'defense';
};

// Tile label: A1-A4 / D1-D4 when the layout is known (positions differ between attack and defense), else 1-6.
const slotLabel = (index: number, role: 'attack' | 'defense' | null) => (role && index < 4 ? `${role === 'attack' ? 'A' : 'D'}${index + 1}` : String(index + 1));

const POSITION_OPTIONS: { value: 'same' | 'any'; label: string }[] = [
  { value: 'same', label: 'Same' },
  { value: 'any', label: 'Any order' },
];

// Six tile values from a known team (strikers in report order, then specials).
export function slotsFromTeam(team: ArenaTeam): (number | null)[] {
  const pad = (ids: number[], n: number) => [...ids, ...Array<null>(n).fill(null)].slice(0, n);
  return [
    ...pad(
      team.m.map((s) => s.id),
      4,
    ),
    ...pad(
      team.s.map((s) => s.id),
      2,
    ),
  ];
}

// Labels for the queried team and the teams it faced, e.g. opponent + my attack → "Opponent defenses" vs "My attacks".
const SIDE_TEAM: Record<'opponent' | 'me', Record<BattleFilter, string>> = {
  opponent: { attack: 'Opponent defenses', defense: 'Opponent attacks', any: 'Opponent teams' },
  me: { attack: 'My attacks', defense: 'My defenses', any: 'My teams' },
};
const teamLabels = (side: QuerySide, battle: BattleFilter) =>
  side === 'any' ? { team: 'Matching teams', counter: 'Teams they faced' } : { team: SIDE_TEAM[side][battle], counter: SIDE_TEAM[side === 'opponent' ? 'me' : 'opponent'][battle] };

const SIDE_OPTIONS: { value: QuerySide; label: string }[] = [
  { value: 'opponent', label: 'Opponent' },
  { value: 'me', label: 'Mine' },
  { value: 'any', label: 'Any' },
];
const BATTLE_OPTIONS: { value: BattleFilter; label: string }[] = [
  { value: 'attack', label: 'Attack' },
  { value: 'defense', label: 'Defense' },
  { value: 'any', label: 'Any' },
];

export function Segmented<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
      <span className="mr-0.5">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`border px-1.5 py-0.5 ${
            value === o.value ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-neutral-300 hover:border-neutral-500 dark:border-neutral-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// StudentSearchDropdown's fixed input id; this panel is its only instance on the page.
const SLOT_INPUT_ID = 'student-search';

// Slots visible in the opponent list are filled first, then the rest known after a battle.
const FILL_ORDER = [0, 4, 5, 1, 2, 3];
const VISIBLE_IN_LIST = new Set([0, 4, 5]);

const bySquad = (students: Record<string, Student>, squad: 'Main' | 'Support') =>
  Object.fromEntries(Object.entries(students).filter(([id, s]) => (s.SquadType || (Number(id) < 20000 ? 'Main' : 'Support')) === squad));

interface Props {
  records: ArenaRecord[];
  search: ArenaSearchState;
  onSearchChange: (search: ArenaSearchState) => void;
  students: Record<string, Student>;
  locale: string;
}

// "75% · I won 6/8": always my result; rate first for comparison, raw counts so small samples are visible.
export function WinRate({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  const rate = total ? Math.round((wins / total) * 100) : 0;
  return (
    <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
      <span className="font-semibold text-neutral-900 dark:text-neutral-100">{rate}%</span> · I won {wins}/{total}
    </span>
  );
}

const SORT_OPTIONS: { value: CounterSort; label: string }[] = [
  { value: 'winRate', label: 'Win rate' },
  { value: 'wins', label: 'Wins' },
  { value: 'battles', label: 'Battles' },
  { value: 'recent', label: 'Recent' },
];

export function ArenaSearch({ records, search, onSearchChange, students, locale }: Props) {
  const [active, setActive] = useState(0);
  // How many queried students may be missing from a defense for it to count as matching (0 = exact).
  const [maxMissing, setMaxMissing] = useState(0);
  const [sort, setSort] = useState<CounterSort>('winRate');
  const strikers = useMemo(() => bySquad(students, 'Main'), [students]);
  const specials = useMemo(() => bySquad(students, 'Support'), [students]);
  const seen = useMemo(() => seenStudents(records, search.side, search.battle), [records, search.side, search.battle]);
  const nicknames = useMemo(() => opponentCandidates(records), [records]);
  const query = useMemo(() => toQuery(search), [search]);
  const matchups = useMemo(() => (isEmptyQuery(query) ? [] : summarizeMatchups(records, query, maxMissing)), [records, query, maxMissing]);
  // The faced-teams column counts exactly the teams listed as matching.
  const counters = useMemo(() => rankCounters(matchups, sort, search.ordered), [matchups, sort, search.ordered]);
  const layout = queriedRole(search.side, search.battle);
  const labels = teamLabels(search.side, search.battle);
  const formatDate = (ms: number) => new Date(ms).toLocaleDateString(locale);
  const queriedCount = present(query.strikerSlots).length + query.specials.length;

  const isStrikerSlot = active < 4;
  // A student can appear only once per team, so students already placed in other slots are not offered again.
  const taken = new Set(present(search.slots.filter((_, i) => i !== active)));
  const options = Object.fromEntries(Object.entries(isStrikerSlot ? strikers : specials).filter(([id]) => !taken.has(Number(id))));
  const priority = isStrikerSlot ? seen.strikerSlots[active] : seen.specials;

  const setSlot = (index: number, id: number | null) => onSearchChange({ ...search, slots: search.slots.map((v, i) => (i === index ? id : v)) });

  const pick = (id: number) => {
    const slots = search.slots.map((v, i) => (i === active ? id : v));
    onSearchChange({ ...search, slots });
    // Advance to the next empty slot so several picks can be typed back to back.
    const pos = FILL_ORDER.indexOf(active);
    const next = [...FILL_ORDER.slice(pos + 1), ...FILL_ORDER.slice(0, pos)].find((i) => slots[i] === null);
    if (next !== undefined) {
      setActive(next);
      // The dropdown remounts for the new slot; focus it so the next name can be typed right away.
      requestAnimationFrame(() => document.getElementById(SLOT_INPUT_ID)?.focus());
    }
  };

  // Search with one listed team: Team becomes its side, Battles my role in its battles (an opponent's attack = my defense).
  const searchTeam = (team: ArenaTeam, side: 'me' | 'opponent', role: 'attack' | 'defense') => {
    const battle = side === 'me' ? role : role === 'attack' ? 'defense' : 'attack';
    onSearchChange({ ...search, nickname: '', slots: slotsFromTeam(team), side, battle });
    setActive(0);
  };

  const tile = (index: number) => {
    const id = search.slots[index];
    const isActive = active === index;
    return (
      <div key={index} className="relative min-w-0 max-w-20 flex-1">
        <button
          type="button"
          onClick={() => setActive(index)}
          aria-pressed={isActive}
          aria-label={`Slot ${slotLabel(index, layout)}`}
          className={`flex aspect-square w-full items-center justify-center overflow-hidden border-2 ${isActive ? 'border-blue-500' : 'border-neutral-300 dark:border-neutral-700'} ${
            id === null ? `border-dashed text-xl font-bold ${VISIBLE_IN_LIST.has(index) ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-300 dark:text-neutral-700'}` : ''
          }`}
        >
          {id === null ? slotLabel(index, layout) : <StudentPortrait id={id} name={students[String(id)]?.Name} />}
        </button>
        {id !== null && (
          <button
            type="button"
            onClick={() => {
              setSlot(index, null);
              setActive(index);
            }}
            aria-label={`Clear slot ${slotLabel(index, layout)}`}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-600 text-white hover:bg-red-600 dark:bg-neutral-500"
          >
            <HiOutlineXMark className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">Search battles</h2>
        {!isEmptyQuery(query) && (
          <button
            type="button"
            onClick={() => {
              onSearchChange({ ...EMPTY_SEARCH, side: search.side, battle: search.battle, ordered: search.ordered });
              setActive(0);
            }}
            className="ml-auto text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
        <Segmented label="Team" options={SIDE_OPTIONS} value={search.side} onChange={(side) => onSearchChange({ ...search, side })} />
        <Segmented label="Battles" options={BATTLE_OPTIONS} value={search.battle} onChange={(battle) => onSearchChange({ ...search, battle })} />
        {/* Strikers 1-4 are battlefield lanes, so by default a queried striker must be in the same slot. */}
        <Segmented label="Positions" options={POSITION_OPTIONS} value={search.ordered ? 'same' : 'any'} onChange={(v) => onSearchChange({ ...search, ordered: v === 'same' })} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex w-full items-end gap-1.5 sm:gap-2 lg:w-auto lg:min-w-[30rem]">
          {[0, 1, 2, 3].map(tile)}
          <div className="w-1 shrink-0" />
          {[4, 5].map(tile)}
        </div>
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <label className="min-w-0">
            <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">
              Slot {slotLabel(active, layout)} {isStrikerSlot ? 'striker' : 'special'}
            </span>
            {/* Keyed by slot: a fresh dropdown per slot clears the previous slot's typed text and open list. */}
            <StudentSearchDropdown key={active} students={options} selectedStudentId={search.slots[active]} setSelectedStudentId={pick} priorityStudentIds={priority} hideLavel />
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-xs text-neutral-500 dark:text-neutral-400">Opponent nickname</span>
            <ArenaNicknameSearch value={search.nickname} onChange={(nickname) => onSearchChange({ ...search, nickname })} candidates={nicknames} students={students} locale={locale} />
          </label>
        </div>
      </div>

      {!isEmptyQuery(query) && (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                {labels.counter} ({counters.length})
              </h3>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">against the {matchups.length} listed</span>
              <label className="ml-auto flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                Sort
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as CounterSort)}
                  className="border border-neutral-300 bg-transparent px-1 py-0.5 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {counters.length === 0 && <p className="border-t border-neutral-200 py-4 text-sm text-neutral-500 dark:border-neutral-800">No battles yet</p>}
            {counters.map((a, i) => (
              <div key={i} className="border-t border-neutral-200 py-2 dark:border-neutral-800">
                <TeamHeader role={a.role} side={a.side} onSearch={() => searchTeam(a.team, a.side, a.role)}>
                  <WinRate wins={a.wins} losses={a.losses} />
                </TeamHeader>
                <ArenaTeamRow team={a.team} students={students} hideDamage />
              </div>
            ))}
          </div>

          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                {labels.team} ({matchups.length})
              </h3>
              {queriedCount > 1 && (
                <div className="ml-auto flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                  <span>Missing allowed</span>
                  {/* Allowing every queried student to be missing would match unrelated teams, so cap at queried - 1. */}
                  {Array.from({ length: Math.min(4, queriedCount) }, (_, n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMaxMissing(n)}
                      aria-pressed={Math.min(maxMissing, queriedCount - 1) === n}
                      className={`min-w-7 border px-1.5 py-0.5 tabular-nums ${
                        Math.min(maxMissing, queriedCount - 1) === n
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'border-neutral-300 hover:border-neutral-500 dark:border-neutral-700'
                      }`}
                    >
                      {n === 0 ? 'Exact' : n}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {matchups.length === 0 && <p className="border-t border-neutral-200 py-4 text-sm text-neutral-500 dark:border-neutral-800">No matching team</p>}
            {matchups.map((m, i) => (
              <div key={i} className="border-t border-neutral-200 py-2 dark:border-neutral-800">
                <TeamHeader role={m.role} side={m.side} onSearch={() => searchTeam(m.team, m.side, m.role)}>
                  {queriedCount > 0 && m.similarity < 1 && (
                    <span className="font-semibold text-amber-600 dark:text-amber-400" title="Queried students present in this team">
                      {m.matched}/{queriedCount} match
                    </span>
                  )}
                  <span className="min-w-0 truncate" title={m.nicknames.join(', ')}>
                    {formatDate(m.lastAt)}
                    {m.nicknames.length > 0 && ` · ${m.nicknames.join(', ')}`}
                  </span>
                  <span className="shrink-0" title="All my battles against this team">
                    <WinRate wins={m.counters.reduce((n, a) => n + a.wins, 0)} losses={m.counters.reduce((n, a) => n + a.losses, 0)} />
                  </span>
                </TeamHeader>
                <ArenaTeamRow team={m.team} students={students} hideDamage />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
