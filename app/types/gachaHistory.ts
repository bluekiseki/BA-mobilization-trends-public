// 'GL' covers the Global/KR schedule (identical), 'JP' the Japan schedule.
export type GachaHistoryServer = 'GL' | 'JP';

export type GachaResultSource = 'normal' | 'half_pity' | 'hard_pity' | 'point_exchange';

export interface GachaHistoryResult {
  id: string;
  studentId: number;
  isFirstAcquisition: boolean;
  isPickup: boolean;
  countTowardGoal: boolean;
  source: GachaResultSource;
}

export interface GachaHistoryEntry {
  id: string;
  bannerId: string;
  server: GachaHistoryServer;
  date: string;
  pullCount: number;
  /** Pull at which the goal was first met; later pulls (e.g. toward a deliberate pity) are excluded. Omitted = the goal was met on the last pull. */
  goalPullCount?: number;
  /**
   * Starting "recruit charge" for this banner. On a single-type banner it is that banner's counter
   * (normal, or limited when the banner has no normal-recruitment pickup). On a banner that runs a
   * normal and a limited pickup concurrently, this is the normal-recruitment counter and
   * `initialChargeLimited` holds the limited one.
   */
  initialCharge?: number;
  /** Starting limited-recruitment "recruit charge" — only set on banners with both pickup types. */
  initialChargeLimited?: number;
  results: GachaHistoryResult[];
  notes?: string;
}

export interface GachaHistoryData {
  entries: GachaHistoryEntry[];
  simulationCount?: number;
}
