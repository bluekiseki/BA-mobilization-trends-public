import { useCallback, useSyncExternalStore } from 'react';
import type { Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import { readStudentTab, STUDENT_TAB_EVENT, studentPath, type StudentTab } from './studentTab';

const subscribe = (notify: () => void) => {
  window.addEventListener(STUDENT_TAB_EVENT, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(STUDENT_TAB_EVENT, notify);
    window.removeEventListener('storage', notify);
  };
};

const serverTab = (): StudentTab => 'info';

/** Builds links to a student's page that open on the tab the reader used last (the first tab on the server and before hydration). */
export function useStudentLink(locale: Locale) {
  const tab = useSyncExternalStore(subscribe, readStudentTab, serverTab);
  return useCallback((studentId: number | string) => localeLink(locale, studentPath(studentId, tab)), [locale, tab]);
}
