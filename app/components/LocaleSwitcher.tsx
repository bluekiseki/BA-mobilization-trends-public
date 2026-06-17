// app/components/LocaleSwitcher.tsx
import LocaleSwitcherSelect, { changePathLanguage } from './LocaleSwitcherSelect';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineLanguage } from 'react-icons/hi2';
import { useLocation, useNavigate } from 'react-router';
import { type Locale } from '~/utils/i18n/config';
import { useOutsideClick } from '~/utils/useOutsideClick';

export default function LocaleSwitcher() {
  // const {t, i18n} = useTranslation('LocaleSwitcher');
  const { t, i18n } = useTranslation('common', { keyPrefix: 'LocaleSwitcher' });
  const locale = i18n.language;

  return (
    <LocaleSwitcherSelect
      defaultValue={locale}
      items={[
        {
          value: 'en',
          label: 'English',
        },
        {
          value: 'ko',
          label: '한국어',
        },
        {
          value: 'ja',
          label: '日本語',
        },
        {
          value: 'zh-Hant',
          label: '繁體中文',
        },
      ]}
      label={t('label')}
    />
  );
}

const LOCALES: {
  value: Locale;
  label: string;
}[] = [
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'ja', label: '日本語' },
  { value: 'zh-Hant', label: '繁體中文' },
];

// Language dropdown
export const LocaleDropdown = ({ currentLocale, isMobileText = false }: { currentLocale: Locale; isMobileText?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname, search } = useLocation();
  const { t } = useTranslation('common', { keyPrefix: 'navigation' });
  const navigate = useNavigate();
  useOutsideClick(ref, () => setIsOpen(false));

  const handleSelect = (val: Locale) => {
    setIsOpen(false);
    if (val === currentLocale) return;
    document.documentElement.lang = val;
    void navigate(changePathLanguage(currentLocale, val, pathname) + search);
  };

  return (
    <div className="relative flex items-center" ref={ref}>
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors">
        <HiOutlineLanguage className="text-xl" strokeWidth={1.5} />
        <span className={`${isMobileText ? 'block' : 'hidden xl:block'} text-sm font-medium`}>{t('language')}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-32 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-lg py-1 z-50">
          {LOCALES.map((loc) => (
            <button
              key={loc.value}
              onClick={() => handleSelect(loc.value)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${currentLocale === loc.value ? 'font-bold text-neutral-900 dark:text-white bg-neutral-50 dark:bg-neutral-800/50' : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
            >
              {loc.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
