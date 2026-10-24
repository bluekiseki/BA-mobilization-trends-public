import { type ArenaRecord, type ArenaRole, type ArenaSide, type ArenaSlot, type ArenaSlotRole, type ArenaTeam } from '~/features/my/arena/types';
import type { ParsedReport, ParsedSide, ParsedSlot } from './combatReport';

export type ArenaDraft = Omit<ArenaRecord, 'id' | 'savedAt'>;

// One slot of a team in display order (strikers, then specials), e.g. for rendering a row or editing by flat index.
export interface FlatSlot extends ArenaSlot {
  role: ArenaSlotRole;
}

export const teamSlots = (team: ArenaTeam): FlatSlot[] => [...team.m.map((slot) => ({ ...slot, role: 'striker' as const })), ...team.s.map((slot) => ({ ...slot, role: 'special' as const }))];

// Replace one slot addressed by its flat index (see teamSlots).
export function updateTeamSlot<T extends ArenaTeam>(team: T, index: number, patch: Partial<ArenaSlot>): T {
  if (index < team.m.length) return { ...team, m: team.m.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)) };
  const special = index - team.m.length;
  return { ...team, s: team.s.map((slot, i) => (i === special ? { ...slot, ...patch } : slot)) };
}

// Report slots in the same flat order as teamSlots, so per-slot recognition scores line up with the saved team.
export const orderedReportSlots = (slots: ParsedSlot[]): ParsedSlot[] => [...slots.filter((s) => s.role === 'striker'), ...slots.filter((s) => s.role === 'special')];

const toSlot = (slot: ParsedSlot): ArenaSlot => ({ id: slot.sid, damage: slot.damage });

const toSide = (side: ParsedSide): ArenaSide => ({
  nickname: side.nickname,
  avatarId: side.avatar.sid || null,
  m: side.slots.filter((s) => s.role === 'striker').map(toSlot),
  s: side.slots.filter((s) => s.role === 'special').map(toSlot),
});

// The left side of a combat report is always the player.
export function draftFromReport(report: ParsedReport, capturedAt: number): ArenaDraft {
  return { capturedAt, role: report.left.defending ? 'defense' : 'attack', won: report.left.won, me: toSide(report.left), opponent: toSide(report.right) };
}

const slotKey = (team: ArenaTeam) =>
  teamSlots(team)
    .map((s) => `${s.id}:${s.damage ?? ''}`)
    .join(',');

// Same battle uploaded twice: identical roles, result, teams and per-student damage.
export function recordSignature(r: Pick<ArenaRecord, 'role' | 'won' | 'me' | 'opponent'>): string {
  return `${r.role}|${r.won ? 1 : 0}|${slotKey(r.me)}|${slotKey(r.opponent)}`;
}

// Combat reports list strikers in formation-slot order, but compact empty slots to the front, so slot positions are only
// known when all four strikers are present.
export const STRIKER_SLOTS = 4;
const strikerIds = (team: ArenaTeam) => team.m.map((s) => s.id);
const specialIds = (team: ArenaTeam) => team.s.map((s) => s.id);
export const hasKnownPositions = (team: ArenaTeam) => team.m.length === STRIKER_SLOTS;

// Team composition key. Specials never depend on order. Strikers keep their slot order when `ordered` and positions are
// known (slots 1-4 map to battlefield lanes, so the same members in another order play differently); otherwise sorted.
export function compositionKey(team: ArenaTeam, ordered = false): string {
  const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);
  const strikers = ordered && hasKnownPositions(team) ? strikerIds(team) : sorted(strikerIds(team));
  return `${strikers.join('.')}|${sorted(specialIds(team)).join('.')}`;
}

export type TeamRole = ArenaRole;

// Win/loss of one team composition, always counted from my side ("won" = I won).
export interface TeamRecord {
  team: ArenaTeam;
  // Attack and defense use different battlefield layouts, so the same members in each role are different teams.
  role: TeamRole;
  side: 'me' | 'opponent';
  wins: number;
  losses: number;
  lastAt: number;
}

// A queried team composition and the teams it faced (which sit on the other side).
export interface TeamMatchup {
  team: ArenaTeam;
  side: 'me' | 'opponent';
  role: TeamRole;
  counters: TeamRecord[];
  lastAt: number;
  nicknames: string[];
  // Share of the queried students present in this team (1 = every queried student is there).
  similarity: number;
  matched: number;
}

export type CounterSort = 'winRate' | 'wins' | 'battles' | 'recent';
// Which side's team the queried students are looked up in.
export type QuerySide = 'opponent' | 'me' | 'any';
// Which battles to look at, by my role in them.
export type BattleFilter = 'attack' | 'defense' | 'any';

// A (partial) team: in-game the opponent list shows only slot 1 and the specials (slots 5/6);
// after one battle the whole team is known from the combat report.
export interface ArenaQuery {
  nickname: string;
  strikerSlots: (number | null)[]; // slots 1-4 by position, any subset
  specials: number[]; // slots 5-6, any subset (order never matters)
  // Same positions: a queried striker must sit in the same slot. Any order: membership only.
  ordered: boolean;
  side: QuerySide;
  battle: BattleFilter;
}

// Default: opponents' defenses in battles where I attacked (finding a counter in the opponent list).
export const EMPTY_QUERY: ArenaQuery = { nickname: '', strikerSlots: [null, null, null, null], specials: [], ordered: true, side: 'opponent', battle: 'attack' };

const queriedStrikers = (q: ArenaQuery) => q.strikerSlots.filter((id): id is number => id !== null);
const queriedIds = (q: ArenaQuery) => [...queriedStrikers(q), ...q.specials];

export const isEmptyQuery = (q: ArenaQuery) => q.nickname.trim() === '' && queriedIds(q).length === 0;

const nicknameMatches = (record: ArenaRecord, nickname: string) => {
  const nick = nickname.trim().toLowerCase();
  return !nick || record.opponent.nickname.toLowerCase().includes(nick);
};

const battleMatches = (record: ArenaRecord, battle: BattleFilter) => battle === 'any' || record.role === battle;

// How many queried students the team has, role-aware (a queried special must be a special in the team). With `ordered`,
// a queried striker counts only in its own slot, unless the team's positions are unknown (fewer than four strikers).
function matchedCount(team: ArenaTeam, q: ArenaQuery): number {
  const strikers = strikerIds(team);
  const specials = new Set(specialIds(team));
  const byPosition = q.ordered && hasKnownPositions(team);
  const strikerHits = q.strikerSlots.filter((id, slot) => id !== null && (byPosition ? strikers[slot] === id : strikers.includes(id))).length;
  return strikerHits + q.specials.filter((id) => specials.has(id)).length;
}

// The record's team the query is about and the team it faced. With side 'any', the side matching more queried students wins (ties: opponent).
const otherRole = (role: TeamRole): TeamRole => (role === 'attack' ? 'defense' : 'attack');

// Teams are copied without the nickname/avatar so grouped results only carry the composition.
const teamOf = (side: ArenaSide): ArenaTeam => ({ m: side.m, s: side.s });

function pickTeams(record: ArenaRecord, q: ArenaQuery): { team: ArenaTeam; counter: ArenaTeam; matched: number; side: 'me' | 'opponent'; role: TeamRole } {
  const { role } = record;
  const opp = { team: teamOf(record.opponent), counter: teamOf(record.me), matched: matchedCount(record.opponent, q), side: 'opponent' as const, role: otherRole(role) };
  const mine = { team: teamOf(record.me), counter: teamOf(record.opponent), matched: matchedCount(record.me, q), side: 'me' as const, role };
  if (q.side === 'opponent') return opp;
  if (q.side === 'me') return mine;
  return mine.matched > opp.matched ? mine : opp;
}

// Strict filter used by the record list: nickname, battle type, and every queried student present on the chosen side.
export function matchesQuery(record: ArenaRecord, q: ArenaQuery): boolean {
  return nicknameMatches(record, q.nickname) && battleMatches(record, q.battle) && pickTeams(record, q).matched === queriedIds(q).length;
}

// Students seen on the queried side in the queried battles, for ranking dropdown options first: per striker slot
// (from teams with known positions) and for the specials.
export function seenStudents(records: ArenaRecord[], side: QuerySide, battle: BattleFilter): { strikerSlots: Set<number>[]; specials: Set<number> } {
  const strikerSlots = Array.from({ length: STRIKER_SLOTS }, () => new Set<number>());
  const specials = new Set<number>();
  for (const r of records) {
    if (!battleMatches(r, battle)) continue;
    const teams = side === 'opponent' ? [r.opponent] : side === 'me' ? [r.me] : [r.opponent, r.me];
    for (const team of teams) {
      const ids = strikerIds(team);
      // Slot 1 is shown even for compacted teams' first striker; later slots only when positions are known.
      ids.forEach((id, slot) => (slot === 0 || hasKnownPositions(team)) && strikerSlots[slot].add(id));
      for (const id of specialIds(team)) specials.add(id);
    }
  }
  return { strikerSlots, specials };
}

// Team compositions containing the queried students, allowing up to `maxMissing` of them to be absent (0 = exact).
// Exact first, then by share matched, then slot-1 position, newest first. Each lists the teams it faced with my results.
export function summarizeMatchups(records: ArenaRecord[], q: ArenaQuery, maxMissing = 0): TeamMatchup[] {
  const total = queriedIds(q).length;
  const groups = new Map<string, Omit<TeamMatchup, 'counters' | 'nicknames'> & { nicknames: Set<string>; counters: Map<string, TeamRecord> }>();
  for (const r of records) {
    if (!battleMatches(r, q.battle) || !nicknameMatches(r, q.nickname)) continue;
    const { team, counter, matched, side, role } = pickTeams(r, q);
    const similarity = total === 0 ? 1 : matched / total;
    if (total - matched > maxMissing || (total > 0 && matched === 0)) continue;
    // Side and role are part of the key: with 'any' filters the same members can be mine or an opponent's, attacking or defending.
    const key = `${side}:${role}:${compositionKey(team, q.ordered)}`;
    const group = groups.get(key) ?? { team, side, role, lastAt: 0, similarity, matched, nicknames: new Set<string>(), counters: new Map<string, TeamRecord>() };
    if (r.capturedAt >= group.lastAt) {
      group.lastAt = r.capturedAt;
      group.team = team;
    }
    if (r.opponent.nickname) group.nicknames.add(r.opponent.nickname);
    const counterKey = compositionKey(counter, q.ordered);
    const rec = group.counters.get(counterKey) ?? { team: counter, role: otherRole(role), side: side === 'me' ? 'opponent' : 'me', wins: 0, losses: 0, lastAt: 0 };
    if (r.won) rec.wins += 1;
    else rec.losses += 1;
    if (r.capturedAt >= rec.lastAt) {
      rec.lastAt = r.capturedAt;
      rec.team = counter;
    }
    group.counters.set(counterKey, rec);
    groups.set(key, group);
  }
  // In any-order mode, still prefer teams with the queried slot-1 student in place (the opponent list shows slot 1).
  const slot1Bonus = (t: ArenaTeam) => (q.strikerSlots[0] !== null && strikerIds(t)[0] === q.strikerSlots[0] ? 1 : 0);
  return [...groups.values()]
    .map((g) => ({
      team: g.team,
      side: g.side,
      role: g.role,
      lastAt: g.lastAt,
      similarity: g.similarity,
      matched: g.matched,
      nicknames: [...g.nicknames],
      counters: [...g.counters.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.lastAt - a.lastAt),
    }))
    .sort((a, b) => b.similarity - a.similarity || slot1Bonus(b.team) - slot1Bonus(a.team) || b.lastAt - a.lastAt);
}

const winRate = (a: TeamRecord) => a.wins / Math.max(1, a.wins + a.losses);

const COUNTER_SORTS: Record<CounterSort, (a: TeamRecord, b: TeamRecord) => number> = {
  winRate: (a, b) => winRate(b) - winRate(a) || b.wins + b.losses - (a.wins + a.losses),
  wins: (a, b) => b.wins - a.wins || a.losses - b.losses,
  battles: (a, b) => b.wins + b.losses - (a.wins + a.losses) || b.wins - a.wins,
  recent: () => 0,
};

// The teams faced by exactly the given matchups (the ones shown as matching), merged by composition with my win/loss.
// `ordered` must match the query so faced teams merge the same way their matchups were grouped.
export function rankCounters(matchups: TeamMatchup[], sort: CounterSort = 'winRate', ordered = true): TeamRecord[] {
  const byTeam = new Map<string, TeamRecord>();
  for (const m of matchups)
    for (const c of m.counters) {
      const key = `${c.side}:${c.role}:${compositionKey(c.team, ordered)}`;
      const cur = byTeam.get(key) ?? { team: c.team, role: c.role, side: c.side, wins: 0, losses: 0, lastAt: 0 };
      cur.wins += c.wins;
      cur.losses += c.losses;
      if (c.lastAt >= cur.lastAt) {
        cur.lastAt = c.lastAt;
        cur.team = c.team;
      }
      byTeam.set(key, cur);
    }
  return [...byTeam.values()].sort((a, b) => COUNTER_SORTS[sort](a, b) || b.lastAt - a.lastAt);
}

export interface OpponentCandidate {
  nickname: string;
  avatarId: number | null;
  lastAt: number;
  battles: number;
}

// Distinct opponent nicknames (case-insensitive) for the nickname suggestions: most battles first, then most recent.
// The avatar is the one from the latest battle, since players change it.
export function opponentCandidates(records: ArenaRecord[]): OpponentCandidate[] {
  const byName = new Map<string, OpponentCandidate>();
  for (const r of records) {
    const nickname = r.opponent.nickname.trim();
    if (!nickname) continue;
    const key = nickname.toLowerCase();
    const current = byName.get(key);
    if (!current) {
      byName.set(key, { nickname, avatarId: r.opponent.avatarId, lastAt: r.capturedAt, battles: 1 });
      continue;
    }
    current.battles += 1;
    if (r.capturedAt >= current.lastAt) Object.assign(current, { nickname, avatarId: r.opponent.avatarId, lastAt: r.capturedAt });
  }
  return [...byName.values()].sort((a, b) => b.battles - a.battles || b.lastAt - a.lastAt);
}
