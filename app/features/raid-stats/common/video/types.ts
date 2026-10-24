export interface VideoStudent {
  id: number;
  name_ja: string;
  name_en: string;
  grade: string;
}

export interface VideoEntry {
  url: string;
  title: string;
  description?: string | null;
  score?: number;
  difficulty: string;
  has_tl: boolean;
  boss_types: string[];
  is_target_type: boolean;
  num_parties: number;
  parties: VideoStudent[][];
  channel_name: string;
  channel_id: string;
  timestamp?: number;
  extraction_method?: string;
  /** Set by the merge loader; absent on legacy per-raid files. */
  videoId?: string;
  /** Season the video was originally collected for. Differs from the viewed raid for JP reference videos. */
  origin?: VideoOrigin;
  isReference?: boolean;
  /** True when only the remote dump knows this video (server/season match is not proven). */
  remoteCandidate?: boolean;
  /** True when score/difficulty come from remote title analysis rather than local parsing. */
  basicAnalysis?: boolean;
}

export interface VideoOrigin {
  server: 'jp' | 'kr';
  raidId: string;
}
