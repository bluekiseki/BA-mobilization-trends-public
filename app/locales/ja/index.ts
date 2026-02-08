import type { ResourceLanguage } from 'i18next';
import { common, charts, raidInfo, dashboard, dashboardIndex, liveDashboard, emblemCounter, calendar } from './ja.json'; // import your namespaced locales
import club from './club.json';
import stat from './stat.json';
import planner from './planner.json';
import jukebox from './jukebox.json';

export default {
  // translation: {},
  common,
  // home,
  charts,
  raidInfo,
  dashboard,
  dashboardIndex,
  liveDashboard,
  planner,
  emblemCounter,
  calendar,
  club,
  stat,
  jukebox,
} satisfies ResourceLanguage;
