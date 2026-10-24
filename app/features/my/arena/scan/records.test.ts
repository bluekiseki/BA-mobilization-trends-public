import { describe, expect, it } from 'vitest';
import type { ArenaRecord, ArenaTeam } from '~/features/my/arena/types';
import { compositionKey, EMPTY_QUERY, matchesQuery, opponentCandidates, rankCounters, recordSignature, seenStudents, summarizeMatchups, type ArenaQuery } from './records';

const team = (ids: number[], specials: number[]): ArenaTeam => ({ m: ids.map((id) => ({ id, damage: 1 })), s: specials.map((id) => ({ id, damage: 1 })) });

let seq = 0;
const record = ({ myRole, won }: { myRole: 'attack' | 'defense'; won: boolean }, me: ArenaTeam, opp: ArenaTeam, nickname = 'NaCl'): ArenaRecord => ({
  id: String((seq += 1)),
  savedAt: seq,
  capturedAt: seq,
  role: myRole,
  won,
  me: { nickname: 'me', avatarId: null, ...me },
  opponent: { nickname, avatarId: null, ...opp },
});

describe('compositionKey', () => {
  it('ignores slot order within each role', () => {
    expect(compositionKey(team([3, 1, 2, 4], [20, 10]))).toBe(compositionKey(team([1, 2, 3, 4], [10, 20])));
    expect(compositionKey(team([1, 2, 3, 4], [10, 20]))).not.toBe(compositionKey(team([1, 2, 3, 10], [4, 20])));
  });
});

describe('recordSignature', () => {
  it('matches the same battle and differs when damage differs', () => {
    const a = record({ myRole: 'attack', won: true }, team([1], [2]), team([3], [4]));
    const b = { ...a, id: 'x', capturedAt: 999 };
    expect(recordSignature(a)).toBe(recordSignature(b));
    const c = { ...a, me: { ...a.me, m: [{ id: 1, damage: 2 }] } };
    expect(recordSignature(a)).not.toBe(recordSignature(c));
  });
});

// Test shorthand: `strikers` fills slots 1..n in order; `slot1` overrides slot 1. Any-order unless `ordered` is given.
const q = ({ strikers = [], slot1, ...rest }: Partial<ArenaQuery> & { strikers?: number[]; slot1?: number }): ArenaQuery => {
  const strikerSlots = [0, 1, 2, 3].map((i) => strikers[i] ?? null);
  if (slot1 !== undefined) strikerSlots[0] = slot1;
  return { ...EMPTY_QUERY, ordered: false, ...rest, strikerSlots };
};

describe('summarizeMatchups', () => {
  const def = team([1, 2, 3, 4], [5, 6]);
  const atkA = team([11, 12, 13, 14], [15, 16]);
  const atkB = team([21, 22, 23, 24], [25, 26]);
  const records = [
    record({ myRole: 'attack', won: false }, atkB, def),
    record({ myRole: 'attack', won: true }, atkA, def),
    record({ myRole: 'attack', won: true }, atkA, team([1, 3, 2, 4], [6, 5])),
    record({ myRole: 'defense', won: true }, atkA, def),
    record({ myRole: 'attack', won: true }, atkB, def, 'Other'),
    // Same opponent later switched defense.
    record({ myRole: 'attack', won: true }, atkA, team([7, 2, 3, 4], [8, 9])),
  ];

  it('nickname only: every defense of that opponent, newest first, attacks ranked by wins then losses', () => {
    const result = summarizeMatchups(records, q({ nickname: 'nacl' }));
    expect(result.map((m) => m.team.m[0].id)).toEqual([7, 1]);
    expect(result[1].counters.map((a) => [a.team.m[0].id, a.wins, a.losses])).toEqual([
      [11, 2, 0],
      [21, 0, 1],
    ]);
    expect(result[1].nicknames).toEqual(['NaCl']);
  });

  it('opponent-list view (slot 1 + specials) finds the defense without a nickname', () => {
    const result = summarizeMatchups(records, q({ strikers: [1], slot1: 1, specials: [6] }));
    expect(result).toHaveLength(1);
    expect(result[0].similarity).toBe(1);
    expect(result[0].nicknames.sort()).toEqual(['NaCl', 'Other']);
  });

  it('full defense: exact only by default, similar defenses when missing students are allowed', () => {
    const query = q({ strikers: [1, 2, 3, 4], specials: [5, 6] });
    expect(summarizeMatchups(records, query).map((m) => m.team.m[0].id)).toEqual([1]);
    expect(summarizeMatchups(records, query, 3).map((m) => [m.team.m[0].id, m.matched])).toEqual([
      [1, 6],
      [7, 3],
    ]);
    expect(summarizeMatchups(records, query, 2)).toHaveLength(1);
  });

  it('ranks a defense with the queried slot 1 in place above one that has it elsewhere', () => {
    const rs = [
      { ...record({ myRole: 'attack', won: true }, atkA, team([2, 1, 3, 4], [5, 6])), capturedAt: 100 },
      { ...record({ myRole: 'attack', won: true }, atkA, team([1, 9, 3, 4], [5, 6])), capturedAt: 1 },
    ];
    expect(summarizeMatchups(rs, q({ strikers: [1], slot1: 1 })).map((m) => m.team.m[0].id)).toEqual([1, 2]);
  });
});

describe('rankCounters', () => {
  const atkA = team([11, 12, 13, 14], [15, 16]);
  const atkB = team([21, 22, 23, 24], [25, 26]);
  const atkC = team([31, 32, 33, 34], [35, 36]);
  const def = team([1, 2, 3, 4], [5, 6]);
  const records = [
    // atkA 1/1, atkB 3/4, atkC 0/2
    { ...record({ myRole: 'attack', won: true }, atkA, def), capturedAt: 1 },
    ...[true, true, true, false].map((won, i) => ({ ...record({ myRole: 'attack', won }, atkB, def), capturedAt: 10 + i })),
    { ...record({ myRole: 'attack', won: false }, atkC, def), capturedAt: 100 },
    { ...record({ myRole: 'attack', won: false }, atkC, def), capturedAt: 101 },
    // Similar defense only: excluded unless the matching range includes it.
    record({ myRole: 'attack', won: true }, atkC, team([1, 2, 3, 40], [50, 60])),
  ];
  const ids = (sort: Parameters<typeof rankCounters>[1], maxMissing = 0) =>
    rankCounters(summarizeMatchups(records, q({ strikers: [1, 2, 3, 4], specials: [5, 6] }), maxMissing), sort).map((r) => [r.team.m[0].id, r.wins, r.losses]);

  it('counts only the shown (matching) defenses', () => {
    expect(ids('wins')).toEqual([
      [21, 3, 1],
      [11, 1, 0],
      [31, 0, 2],
    ]);
    expect(ids('wins', 3)).toContainEqual([31, 1, 2]);
  });

  it('sorts by win rate, battles or recency', () => {
    expect(ids('winRate').map((r) => r[0])).toEqual([11, 21, 31]);
    expect(ids('battles').map((r) => r[0])).toEqual([21, 31, 11]);
    expect(ids('recent').map((r) => r[0])).toEqual([31, 21, 11]);
  });
});

describe('matchesQuery', () => {
  it('requires every queried student in the right role', () => {
    const r = record({ myRole: 'attack', won: true }, team([11], [12]), team([1, 2, 3, 4], [5, 6]));
    expect(matchesQuery(r, q({ strikers: [1, 3], specials: [6, 5] }))).toBe(true);
    expect(matchesQuery(r, q({ strikers: [5] }))).toBe(false);
    expect(matchesQuery(r, q({ specials: [7] }))).toBe(false);
  });
});

describe('seenDefenseStudents', () => {
  it('collects ids from defenses I attacked', () => {
    const seen = seenStudents(
      [record({ myRole: 'attack', won: true }, team([11], [12]), team([1, 2], [5, 6])), record({ myRole: 'defense', won: true }, team([11], [12]), team([9, 2], [8]))],
      'opponent',
      'attack',
    );
    expect([...seen.strikerSlots[0]]).toEqual([1]);
    // Slot 2 only from teams whose positions are known (four strikers); this team has two.
    expect([...seen.strikerSlots[1]]).toEqual([]);
    expect([...seen.specials].sort()).toEqual([5, 6]);
  });
});

describe('opponentCandidates', () => {
  it('merges nicknames case-insensitively, keeps the latest avatar, skips empty', () => {
    const t = team([1], [2]);
    const rs = [
      { ...record({ myRole: 'attack', won: true }, t, t, 'NaCl'), capturedAt: 10 },
      { ...record({ myRole: 'defense', won: false }, t, t, 'Oxter'), capturedAt: 20 },
      { ...record({ myRole: 'attack', won: false }, t, t, 'nacl'), capturedAt: 30 },
      { ...record({ myRole: 'attack', won: false }, t, t, ''), capturedAt: 40 },
    ];
    rs[2].opponent.avatarId = 13003;
    rs.push({ ...record({ myRole: 'attack', won: false }, t, t, 'Late'), capturedAt: 50 });
    // Most battles first, then most recent.
    expect(opponentCandidates(rs)).toEqual([
      { nickname: 'nacl', avatarId: 13003, lastAt: 30, battles: 2 },
      { nickname: 'Late', avatarId: null, lastAt: 50, battles: 1 },
      { nickname: 'Oxter', avatarId: null, lastAt: 20, battles: 1 },
    ]);
  });
});

describe('side and battle filters', () => {
  const myDef = team([1, 2, 3, 4], [5, 6]);
  const theirAtkA = team([11, 12, 13, 14], [15, 16]);
  const theirAtkB = team([21, 22, 23, 24], [25, 26]);
  const records = [
    // Opponents attacking my defense: A beat it twice, B lost once.
    record({ myRole: 'defense', won: false }, myDef, theirAtkA),
    record({ myRole: 'defense', won: false }, myDef, theirAtkA),
    record({ myRole: 'defense', won: true }, myDef, theirAtkB),
    // My attack with a team that happens to share students with my defense.
    record({ myRole: 'attack', won: true }, team([1, 2, 3, 4], [5, 6]), team([31, 32, 33, 34], [35, 36])),
  ];

  it('my side + my defense: which opponent attacks beat my defense', () => {
    const m = summarizeMatchups(records, q({ strikers: [1, 2, 3, 4], specials: [5, 6], side: 'me', battle: 'defense' }));
    expect(m).toHaveLength(1);
    expect(m[0].counters.map((c) => [c.team.m[0].id, c.wins, c.losses])).toEqual([
      [21, 1, 0],
      [11, 0, 2],
    ]);
  });

  it('opponent side + my defense: how an opponent attack team did against me', () => {
    const m = summarizeMatchups(records, q({ strikers: [11], side: 'opponent', battle: 'defense' }));
    expect(m.map((x) => [x.team.m[0].id, x.counters[0].wins, x.counters[0].losses])).toEqual([[11, 0, 2]]);
  });

  it('any battle keeps attack and defense layouts apart', () => {
    const m = summarizeMatchups(records, q({ strikers: [1], side: 'me', battle: 'any' }));
    expect(m.map((x) => [x.role, x.counters.length]).sort()).toEqual([
      ['attack', 1],
      ['defense', 2],
    ]);
    // Faced teams take the opposite role: two opponent attacks against my defense, one opponent defense against my attack.
    expect(
      rankCounters(m)
        .map((c) => c.role)
        .sort(),
    ).toEqual(['attack', 'attack', 'defense']);
    // Side 'any' picks whichever team holds the queried students.
    expect(summarizeMatchups(records, q({ strikers: [11], side: 'any', battle: 'any' }))[0].team.m[0].id).toBe(11);
    expect(summarizeMatchups(records, q({ strikers: [1], side: 'any', battle: 'any' }))[0].team.m[0].id).toBe(1);
  });

  it('record list filter follows side and battle', () => {
    expect(records.filter((r) => matchesQuery(r, q({ strikers: [1], side: 'me', battle: 'attack' })))).toHaveLength(1);
    expect(records.filter((r) => matchesQuery(r, q({ strikers: [1], side: 'opponent', battle: 'any' })))).toHaveLength(0);
  });
});

describe('same positions', () => {
  const atk = team([11, 12, 13, 14], [15, 16]);
  const records = [
    { ...record({ myRole: 'attack', won: true }, atk, team([1, 2, 3, 4], [5, 6])), capturedAt: 1 },
    // Same members, strikers in a different order: a different formation.
    { ...record({ myRole: 'attack', won: false }, atk, team([2, 1, 3, 4], [6, 5])), capturedAt: 2 },
    // Only three strikers: positions unknown, matched by membership.
    { ...record({ myRole: 'attack', won: true }, atk, team([1, 2, 3], [5, 6])), capturedAt: 3 },
  ];

  it('matches a queried striker only in its own slot', () => {
    const m = summarizeMatchups(records, q({ slot1: 1, ordered: true }));
    expect(m.map((x) => x.team.m.slice(0, 2).map((s) => s.id))).toEqual([
      [1, 2],
      [1, 2],
    ]);
    // Slot 1 = 2: the 2-1-3-4 team by position, plus the three-striker team by membership (positions unknown).
    expect(summarizeMatchups(records, q({ strikers: [2], ordered: true })).map((x) => x.team.m[0].id)).toEqual([2, 1]);
  });

  it('keeps different striker orders as separate teams, merges them in any-order mode', () => {
    const query = { strikers: [1, 2, 3, 4], specials: [5, 6] };
    expect(summarizeMatchups(records, q({ ...query, ordered: true }))).toHaveLength(1);
    expect(summarizeMatchups(records, q({ ...query, ordered: true }), 2)).toHaveLength(3);
    const loose = summarizeMatchups(records, q(query));
    expect(loose.map((m) => [m.matched, m.counters[0].wins + m.counters[0].losses])).toEqual([[6, 2]]);
  });

  it('counts a striker in the wrong slot as missing', () => {
    // Query 1-2-3-4: the 2-1-3-4 defense has slots 3, 4 and both specials right → 4/6.
    const m = summarizeMatchups(records, q({ strikers: [1, 2, 3, 4], specials: [5, 6], ordered: true }), 2);
    expect(m.find((x) => x.team.m[0].id === 2)?.matched).toBe(4);
  });
});

describe('compositionKey ordering', () => {
  it('keeps striker order only for known positions', () => {
    expect(compositionKey(team([2, 1, 3, 4], [5, 6]), true)).not.toBe(compositionKey(team([1, 2, 3, 4], [6, 5]), true));
    expect(compositionKey(team([2, 1, 3], [5, 6]), true)).toBe(compositionKey(team([1, 2, 3], [6, 5]), true));
    expect(compositionKey(team([2, 1, 3, 4], [5, 6]))).toBe(compositionKey(team([1, 2, 3, 4], [6, 5])));
  });
});
