export const STUDENT_TABS = ['info', 'stats', 'growth', 'story'] as const;
export type StudentTab = (typeof STUDENT_TABS)[number];

export const STUDENT_TAB_STORAGE_KEY = 'students.lastTab';

export const parseStudentTab = (value: string | null): StudentTab => STUDENT_TABS.find((tab) => tab === value) ?? 'info';

/** Path of a student's page; the first tab is the default, so it needs no query. */
export const studentPath = (studentId: number | string, tab: StudentTab = 'info') => `/students/${studentId}${tab === 'info' ? '' : `?tab=${tab}`}`;

/** The tab the reader opened last, so that links into a student's page can open the same one. */
export function readStudentTab(): StudentTab {
  try {
    return parseStudentTab(localStorage.getItem(STUDENT_TAB_STORAGE_KEY));
  } catch {
    return 'info';
  }
}

export function rememberStudentTab(tab: StudentTab) {
  try {
    localStorage.setItem(STUDENT_TAB_STORAGE_KEY, tab);
    // The storage event only reaches other tabs, so links in this one are told directly
    window.dispatchEvent(new Event(STUDENT_TAB_EVENT));
  } catch {
    // Storage can be blocked; links keep their current tab
  }
}

export const STUDENT_TAB_EVENT = 'students:lastTab';
