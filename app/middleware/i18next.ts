import { initReactI18next } from 'react-i18next';
import { createCookie } from 'react-router';
import { createI18nextMiddleware } from 'remix-i18next/middleware';
import resources from '~/locales'; // Import your locales
import 'i18next';
import { DEFAULT_LOCALE, SUPORTED_LOCALES } from '~/utils/i18n/config';

// This cookie will be used to store the user locale preference
export const localeCookie = createCookie('lng', {
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
});

export const [i18nextMiddleware, getLocale, getInstance] = createI18nextMiddleware({
  detection: {
    supportedLanguages: SUPORTED_LOCALES, // Your supported languages, the fallback should be last
    fallbackLanguage: DEFAULT_LOCALE, // Your fallback language
    async findLocale(request) {
      const url = new URL(request.url);
      let locale = url.searchParams.get('lang') || url.pathname.split('/').at(1);

      if (!locale) return DEFAULT_LOCALE;
      return SUPORTED_LOCALES.includes(locale as any) ? locale : DEFAULT_LOCALE;
    },
    cookie: localeCookie, // The cookie to store the user preference
  },
  i18next: { resources, showSupportNotice: false }, // Your locales
  plugins: [initReactI18next], // Plugins you may need, like react-i18next
});

// This adds type-safety to the `t` function
declare module 'i18next' {
  interface CustomTypeOptions {
    // defaultNS: "translation";
    // defaultNS: "common";
    resources: typeof resources.en; // Use `en` as source of truth for the types
  }
}
