export interface VideoStudent {
  id: number;
  name_ja: string;
  name_en: string;
  grade: string;
}

export interface VideoEntry {
  url: string;
  title: string;
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
}
