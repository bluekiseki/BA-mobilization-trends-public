import students from './students.json';
import type { ResourceLanguage } from 'i18next';
import { common, charts, raidInfo, dashboard, dashboardIndex, liveDashboard, emblemCounter, calendar } from './ja.json';
import auth from './auth.json';
import club from './club.json';
import stat from './stat.json';
import planner from './planner.json';
import gachaGuide from './gachaGuide.json';
import game from './game.json';
import jukebox from './jukebox.json';
import notices from './notices.json';
import network from './network.json';
import resources from './resources.json';
import mypage from './mypage.json';
import ui from './ui.json';

export default {
  students,
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
  gachaGuide,
  emblemCounter,
  calendar,
  network,
  club,
  stat,
  game,
  jukebox,
  notices,
  resources,
  mypage,
  ui,
} satisfies ResourceLanguage;
