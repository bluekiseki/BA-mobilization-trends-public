'use server';

import { cookies, headers } from "next/headers";
import { COOKIE_NAME, defaultLocale, Locale, suportedLocales } from "./config";

export async function getUserLocale() {
  return (await cookies()).get(COOKIE_NAME)?.value || null;
}

// Set the user's locale in the cookies
export async function setUserLocale(locale: Locale) {
  (await cookies()).set(COOKIE_NAME, locale, { path: '/' });
}

export async function getLocaleFromHeaders() {
  const locale = await getUserLocale()
  if (locale) return locale

  
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language');
  if (!acceptLanguage) return defaultLocale

  const headerLocale = acceptLanguage.split('-')[0].toLocaleLowerCase()
  if (suportedLocales.includes(headerLocale)) return headerLocale
  
  return defaultLocale
}
