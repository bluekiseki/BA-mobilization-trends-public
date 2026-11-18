export const STORY_LANGS = ['ko', 'ja', 'en', 'zh-Hant'] as const;
export type StoryLang = (typeof STORY_LANGS)[number];
export type LocalizedText = Partial<Record<StoryLang, string>>;

export interface IndexPart {
  t: LocalizedText;
  m: LocalizedText | null;
}

export interface IndexBgm {
  t: string; // title
  c?: string; // composer
  v?: string; // variant
  y?: string; // YouTube link
}

export interface IndexStory {
  s: string; // series id
  o: number; // order in the series
  t: LocalizedText;
  l?: LocalizedText; // label shown before the title, such as "Episode 3" or "Afterword"
  m?: LocalizedText; // summary
  p?: IndexPart[]; // parts, only when a story has more than one
  b?: string[]; // BGM (keys of StoryIndex.bgm)
  c?: string[]; // characters (keys of StoryIndex.chars), most lines first
  v?: Record<string, string[]>; // speaker names per character when outfit variants speak (plain name included if it speaks too)
}

export interface IndexSeries {
  c: string; // category
  name: LocalizedText | null;
  m?: LocalizedText; // series summary
  d?: string; // JP start of an event missing from the schedule CSVs
  i?: string[]; // announcement images (official server URLs), one per release step that has one
  a?: string[]; // series to read before this one
  r?: [string, string]; // key to find the release in the schedule CSVs
  stories: string[];
}

export interface StoryIndex {
  series: Record<string, IndexSeries>;
  stories: Record<string, IndexStory>;
  chars: Record<string, LocalizedText>;
  cs: Record<string, string>; // student id of the characters that are students (for portraits)
  vs?: Record<string, string>; // student id of the outfit variant speaker names that are outfit students of their own
  bgm: Record<string, IndexBgm>;
}
