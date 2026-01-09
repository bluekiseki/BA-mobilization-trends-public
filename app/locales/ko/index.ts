// app/locales/ko/index.ts
import type { ResourceLanguage } from "i18next";
import {
    currentLocale,
    common,
    home,
    navigation,
    LocaleSwitcher,
    charts,
    raidInfo,
    dashboard,
    dashboardIndex,
    liveDashboard,
    emblemCounter,
    language_banner,
    calendar
} from "./ko.json"; // import your namespaced locales
import {ko as club} from "../club.json"
import {ko as stat} from "../stat.json"
import planner from "./planner.json"
import jukebox from "./jukebox.json"

export default {
    // translation: {},
    currentLocale,
    common,
    home,
    navigation,
    LocaleSwitcher,
    charts,
    raidInfo,
    dashboard,
    dashboardIndex,
    liveDashboard,
    planner,
    emblemCounter,
    language_banner,
    calendar,
    club,
    stat,
    jukebox
} satisfies ResourceLanguage;
