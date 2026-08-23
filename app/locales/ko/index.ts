// app/locales/ko/index.ts
import type { ResourceLanguage } from 'i18next';
import { common, charts, raidInfo, dashboard, dashboardIndex, liveDashboard, emblemCounter, calendar } from './ko.json'; // import your namespaced locales
import auth from './auth.json';
import club from './club.json';
import stat from './stat.json';
import planner from './planner.json';
import game from './game.json';
import jukebox from './jukebox.json';
import help from './help.json';
import notices from './notices.json';
import network from './network.json';
import resources from './resources.json';
import mypage from './mypage.json';
import ui from './ui.json';

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
  network,
  club,
  stat,
  game,
  jukebox,
  help,
  notices,
  resources,
  mypage,
  ui,
} satisfies ResourceLanguage;
