import type { ResourceLanguage } from 'i18next';
import { common, charts, raidInfo, dashboard, dashboardIndex, liveDashboard, emblemCounter, calendar } from './ja.json'; // import your namespaced locales
import auth from './auth.json';
import club from './club.json';
import stat from './stat.json';
import planner from './planner.json';
import jukebox from './jukebox.json';
import help from './help.json';
import notices from './notices.json';

export default {
  // translation: {},
  common,
  // home,
  auth,
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
  help,
  notices,
} satisfies ResourceLanguage;
