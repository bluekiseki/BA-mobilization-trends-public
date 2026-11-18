// Single source of truth for the public plain-text feeds.
// Used by scripts/generate-text-feeds.mjs (llms.txt + per-feed headers), workers/textFeedGuard.ts
// (rate limits) and the /developers page, so docs and the actual feeds cannot drift apart.

export const TEXT_FEED_FORMAT_VERSION = 'v1';

export const TEXT_FEED_LANGS = ['en', 'ko', 'ja', 'zh-Hant'] as const;
export type TextFeedLang = (typeof TEXT_FEED_LANGS)[number];

// Static feeds are plain files served by the edge (no Worker invocation, no limit needed).
// Only the dynamic notices feed is rate limited; keep in sync with wrangler.jsonc ratelimits.
// The site's "kr" data is the Global server (KR merged into Global); feeds expose it as "gl".
export const feedServerName = (server: 'jp' | 'kr'): 'jp' | 'gl' => (server === 'kr' ? 'gl' : 'jp');

// Static feed URLs for linking from pages (kept here so pages don't import the formatters).
export const textFeedUrl = {
  schedule: (lang: TextFeedLang, server: 'jp' | 'kr') => `/txt/${lang}/schedule/${feedServerName(server)}.txt`,
  events: (lang: TextFeedLang) => `/txt/${lang}/events.txt`,
  raids: (server: 'jp' | 'kr') => `/txt/raids/${feedServerName(server)}.txt`,
};

export const TEXT_FEED_RATE_LIMIT = { notices: 5, periodSeconds: 60 } as const;

export interface TextFeedColumn {
  name: string;
  desc: string;
}

export interface TextFeedMeta {
  id: string;
  path: string; // URL pattern; {var} marks a path variable ({lang} = TEXT_FEED_LANGS)
  example: string;
  title: string;
  desc: string;
  format: 'tsv' | 'sections';
  lang: boolean; // path contains {lang}
  update: string;
  source?: string; // upstream data source credited in the feed header
  columns?: TextFeedColumn[];
  sections?: string[];
}

export const TEXT_FEEDS: TextFeedMeta[] = [
  {
    id: 'students',
    path: '/txt/{lang}/students.txt',
    example: '/txt/en/students.txt',
    title: 'Students',
    desc: 'All students, one per line. Use the Id to open the detail feed.',
    format: 'tsv',
    lang: true,
    update: 'on deploy',
    source: 'SchaleDB (https://schaledb.com)',
    columns: [
      { name: 'Id', desc: 'Student id (SchaleDB id)' },
      { name: 'Name', desc: 'Localized name' },
      { name: 'School', desc: 'School code (e.g. Millennium)' },
      { name: 'StarGrade', desc: 'Initial star grade (1-3)' },
      { name: 'SquadType', desc: 'Main (Striker) | Support (Special)' },
      { name: 'TacticRole', desc: 'DamageDealer | Tanker | Healer | Supporter | Vehicle' },
      { name: 'BulletType', desc: 'Explosion | Pierce | Mystic | Sonic | Chemical' },
      { name: 'ArmorType', desc: 'LightArmor | HeavyArmor | Unarmed | ElasticArmor | CompositeArmor' },
      { name: 'Recruit', desc: 'JP recruitment type: Permanent | Limited | Event (welfare/event reward) | Fes | Archive' },
      { name: 'Detail', desc: 'Detail feed path' },
    ],
  },
  {
    id: 'student',
    path: '/txt/{lang}/students/{id}.txt',
    example: '/txt/en/students/10001.txt',
    title: 'Student detail',
    desc: 'Profile, combat attributes, skills (max level), preferred gifts, relationship rank bonuses, relationship stories and recent JP raid usage of one student.',
    format: 'sections',
    lang: true,
    update: 'on deploy',
    source: 'SchaleDB (https://schaledb.com); raid usage: per season, see the Raid Usage section and /source',
    sections: ['Profile', 'Combat', 'Skills', 'Gifts', 'Relationship Rank', 'Relationship Stories', 'Raid Usage'],
  },
  {
    id: 'events',
    path: '/txt/{lang}/events.txt',
    example: '/txt/en/events.txt',
    title: 'Events',
    desc: 'All events that have an event planner page, newest first.',
    format: 'tsv',
    lang: true,
    update: 'on deploy',
    columns: [
      { name: 'EventId', desc: 'Event id (same as /planner/event/{id})' },
      { name: 'Name', desc: 'Localized name' },
      { name: 'Rerun', desc: 'yes | no' },
      { name: 'JpStart', desc: 'JP start (ISO 8601, UTC)' },
      { name: 'JpEnd', desc: 'JP end (ISO 8601, UTC)' },
      { name: 'GlStart', desc: 'Global start (ISO 8601, UTC); empty if not scheduled' },
      { name: 'GlEnd', desc: 'Global end (ISO 8601, UTC)' },
      { name: 'GlPrediction', desc: 'yes = Global dates are a prediction, not announced; empty if not scheduled' },
      { name: 'Detail', desc: 'Detail feed path' },
    ],
  },
  {
    id: 'event',
    path: '/txt/{lang}/events/{id}.txt',
    example: '/txt/en/events/10849.txt',
    title: 'Event detail',
    desc: 'Overview, event currencies, bonus students, stages (with challenge hints), shops, missions and minigame rewards (items, amounts, probabilities, costs) of one event.',
    format: 'sections',
    lang: true,
    update: 'on deploy',
    sections: ['Overview', 'Currencies', 'Bonus Students', 'Stages', 'Shop', 'Missions', 'Point Rewards', 'Minigame: <name>', 'Minigame Missions', 'Random Boxes'],
  },
  {
    id: 'schedule',
    path: '/txt/{lang}/schedule/{server}.txt',
    example: '/txt/en/schedule/gl.txt',
    title: 'Schedule',
    desc: 'Full calendar history (raids, events, pickups, campaigns, stories, ...) including predicted future items, sorted by start. There is no ongoing/upcoming label: filter by start/end against the current time yourself. server = jp | gl (Global).',
    format: 'tsv',
    lang: true,
    update: 'on deploy',
    columns: [
      { name: 'Track', desc: 'raid | eraid | jointFiringDrill | tacticalRelay | multifloor | event | pickup | campaign | mainstory | ministory | patch | maintenance | ...' },
      { name: 'Title', desc: 'Localized title' },
      { name: 'Start', desc: 'ISO 8601, UTC' },
      { name: 'End', desc: 'ISO 8601, UTC' },
      { name: 'Prediction', desc: 'yes = predicted, not announced yet' },
      { name: 'Details', desc: 'Extra key=value pairs separated by "; " (armor, terrain, difficulty, rerun, students, ...)' },
    ],
  },
  {
    id: 'raids',
    path: '/txt/raids/{server}.txt',
    example: '/txt/raids/jp.txt',
    title: 'Raid seasons',
    desc: 'Total Assault (R*) and Grand Assault (E*) season summary with participant counts and cutoffs. server = jp | gl (Global). Language independent.',
    format: 'tsv',
    lang: false,
    update: 'on deploy',
    columns: [
      { name: 'Id', desc: 'Season id (R = Total Assault, E = Grand Assault)' },
      { name: 'Boss', desc: 'Boss name (English)' },
      { name: 'Armor', desc: 'Armor type (Grand Assault only)' },
      { name: 'Location', desc: 'Terrain' },
      { name: 'Date', desc: 'Start date (YYYY-MM-DD)' },
      { name: 'MaxLv', desc: 'Student level cap' },
      { name: 'Participants', desc: 'Total ranked participants' },
      { name: 'Clears', desc: 'Clears per difficulty (Difficulty=count, ...)' },
      { name: 'Tiers', desc: 'Players per trophy tier (Platinum, Gold, Silver, Bronze)' },
      { name: 'PlatinumCutoff', desc: 'Score of the last Platinum rank' },
      { name: 'Dashboard', desc: 'Dashboard page URL' },
    ],
  },
  {
    id: 'notices',
    path: '/api/text/notices',
    example: '/api/text/notices?region=JP',
    title: 'Notices',
    desc: 'Latest 20 official notices. region = ALL | KR | Global | JP | TW (default ALL).',
    format: 'tsv',
    lang: false,
    update: 'every few minutes',
    columns: [
      { name: 'Date', desc: 'Created (ISO 8601, UTC)' },
      { name: 'Region', desc: 'KR | Global | JP | TW' },
      { name: 'Type', desc: 'Notice type' },
      { name: 'Title', desc: 'Title' },
      { name: 'Url', desc: 'Original notice URL' },
    ],
  },
];

export const findTextFeed = (id: string): TextFeedMeta => {
  const feed = TEXT_FEEDS.find((f) => f.id === id);
  if (!feed) throw new Error(`Unknown text feed: ${id}`);
  return feed;
};
