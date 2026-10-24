import { useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import birthdays from '~/data/birthdays.json';
import { cdn } from '~/utils/cdn';
import type { Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import { loadBirthdayPortraits, updateBirthdayDates } from './birthdayStyles.js';
import birthdayScript from './birthdayStyles.js?raw';

const portraitUrl = cdn('/w/students_portrait.json');
// Use the source text so SSR and the obfuscated client bundle emit identical scripts.
const bootstrap = `(()=>{${birthdayScript.replace(/^export /gm, '')}\nupdateBirthdayDates();loadBirthdayPortraits(${JSON.stringify(portraitUrl)});})();`;

export function BirthdayWidget({ locale }: { locale: Locale }) {
  const { t } = useTranslation('common');

  useEffect(() => {
    // Inline scripts run during HTML parsing; effects also cover client navigation.
    updateBirthdayDates();
    loadBirthdayPortraits(portraitUrl);
    const timer = window.setInterval(updateBirthdayDates, 60_000);
    window.addEventListener('pageshow', updateBirthdayDates);
    document.addEventListener('visibilitychange', updateBirthdayDates);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pageshow', updateBirthdayDates);
      document.removeEventListener('visibilitychange', updateBirthdayDates);
    };
  }, []);

  return (
    <>
      {/* CSSOM updates leave the cached markup unchanged, including during hydration. */}
      <style>{`[data-birthday]{display:none}[data-day-label]{display:none}[data-day-label="date"]{display:inline}`}</style>
      <style id="birthday-dates" />
      <style id="birthday-portraits" />
      <div data-birthday-widget className="w-full border-y md:border md:rounded-xl border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/10 overflow-hidden">
        <div className="px-4 py-2 border-b border-amber-100 dark:border-amber-800/30">
          <span className="text-sm font-bold text-amber-700 dark:text-amber-300">{t('home.birthdaySoon')}</span>
        </div>
        <div className="flex gap-3 px-4 py-3 overflow-x-auto">
          {Object.entries(birthdays).flatMap(([dateKey, students]) =>
            students.map((student) => {
              const name = locale === 'en' ? student.name_en : locale === 'ko' ? student.name_ko : locale === 'ja' ? student.name_ja : student.name_zh;
              return (
                <Link
                  key={`${student.id}-${dateKey}`}
                  data-birthday={dateKey}
                  to={localeLink(locale, '/charts/jp/heatmap')}
                  state={{ studentId: student.id }}
                  className="flex-col items-center gap-1 shrink-0 group"
                >
                  <div
                    data-birthday-portrait={student.id}
                    role="img"
                    aria-label={name}
                    className="w-12 h-12 rounded-full border-2 border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 bg-cover bg-top transition-transform group-hover:scale-105"
                  />
                  <span className="text-xs font-semibold text-center w-14 leading-tight text-neutral-600 dark:text-neutral-400">{name}</span>
                  <span className="text-xs font-bold px-1 py-0.5 rounded bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
                    <span data-day-label="-1">{t('yesterday')}</span>
                    <span data-day-label="0">{t('today')}</span>
                    <span data-day-label="1">{t('tomorrow')}</span>
                    <span data-day-label="date">{dateKey}</span>
                  </span>
                </Link>
              );
            }),
          )}
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
    </>
  );
}
