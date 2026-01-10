// app/locales/index.ts

import type { Resource } from "i18next";
import en from "./en/index";
import ko from "./ko/index";
import ja from "./ja/index";
import zh_Hant from "./zh_Hant/index";
const resources = { en, ko, ja, 'zh-Hant': zh_Hant } satisfies Resource;

export default resources;