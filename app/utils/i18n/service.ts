// import { createInstance } from "i18next";
import { DEFAULT_LOCALE, SUPORTED_LOCALES, type Locale } from './config';
// import { initReactI18next } from "react-i18next";
// import { i18nConfig } from "~/i18n";

export function getLocaleFromHeaders(request: Request): Locale {
  // Cookie
  const cookie = request.headers.get('Cookie');
  if (cookie) {
    const match = cookie.match(/i18next=([a-zA-Z-]+)/);
    if (match && match[1]) {
      const locale = match[1];
      if (SUPORTED_LOCALES.includes(locale as Locale)) return locale as Locale;
    }
  }

  // Accept-Language header
  const acceptLanguage = request.headers.get('Accept-Language') || '';
  for (const language of acceptLanguage?.split(',')) {
    for (const locale of SUPORTED_LOCALES) {
      if (language.startsWith(locale)) return locale;
    }
  }

  return DEFAULT_LOCALE;
}

/*
export async function createI18nextServerInstance(locale: Locale) {
  const i18nextInstance = createInstance();
  await i18nextInstance
    .use(initReactI18next)
    // .use(Backend)
    .init(i18nConfig);

  await i18nextInstance.changeLanguage(locale);
  return i18nextInstance

}
  */
