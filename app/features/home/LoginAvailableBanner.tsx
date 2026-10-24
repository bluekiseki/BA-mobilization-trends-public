import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LuX } from 'react-icons/lu';
import { HiOutlineUserCircle } from 'react-icons/hi2';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';

const STORAGE_KEY = 'login-available-banner-dismissed-v1';

export function LoginAvailableBanner({ locale }: { locale: Locale }) {
  const { t } = useTranslation('common');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_auth } = useTranslation('auth');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== '1') setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  return (
    <div className={`overflow-hidden transition-all duration-500 ease-in-out ${visible ? 'max-h-24 opacity-100 mb-2.5' : 'max-h-0 opacity-0'}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-sm border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-sm text-neutral-600 dark:text-neutral-300">
        <HiOutlineUserCircle className="shrink-0 text-neutral-400 dark:text-neutral-500 text-lg" strokeWidth={1.5} />
        <span className="flex-1">{t('home.loginAvailable')}</span>
        <Link to={localeLink(locale, '/signup')} onClick={dismiss} className="shrink-0 text-sm text-blue-600 dark:text-blue-400 hover:underline">
          {t_auth('common.signUp')}
        </Link>
        <button onClick={dismiss} className="shrink-0 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors" aria-label={t_ui('close')}>
          <LuX size={14} />
        </button>
      </div>
    </div>
  );
}
