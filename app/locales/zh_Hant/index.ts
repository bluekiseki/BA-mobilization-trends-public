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
} from "./zh_Hant.json"; // import your namespaced locales
import {zh_Hant as club} from "../club.json"
import {zh_Hant as stat} from "../stat.json"
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
