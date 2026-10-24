// Tactical Challenge combat records parsed from "Combat Report" screenshots. The left side of the report is always the player.
// Full key names except the team lists (m/s, same as raid history); a season that outgrows one sync row continues in the
// next chunk (see ~/scanner-arena/storage).
export type ArenaSlotRole = 'striker' | 'special';

export interface ArenaSlot {
  id: number;
  damage: number | null;
}

// Strikers in formation-slot order (empty slots compacted to the front, as in the report), then specials (order never matters).
export interface ArenaTeam {
  m: ArenaSlot[];
  s: ArenaSlot[];
}

export interface ArenaSide extends ArenaTeam {
  nickname: string;
  // Avatar student id
  avatarId: number | null;
}

export type ArenaRole = 'attack' | 'defense';

export interface ArenaRecord {
  id: string;
  // Screenshot file time; the report itself shows no date. Decides the season.
  capturedAt: number;
  savedAt: number;
  // My role in this battle
  role: ArenaRole;
  // I won
  won: boolean;
  me: ArenaSide;
  opponent: ArenaSide;
}
