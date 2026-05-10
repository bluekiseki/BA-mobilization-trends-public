// app/components/LanguageMismatchBanner.tsx
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import LocaleSwitcher from './LocaleSwitcher'; // Language switcher
import { issuesURL as GITHUB_TRANSLATE_URL } from '~/data/livedataServer.json';

// Define data types for component props
type BannerData = {
  type: 'mismatch' | 'unsupported';
  displayLocale: Locale; // The text language of the banner itself (reqLocale)
  suggestedLocale?: Locale; // The language to suggest switching to (on mismatch)
  targetPath?: string; // The path to switch to (on mismatch)
};

type Props = {
  bannerData: BannerData;
  onDismiss: () => void;
};

const getNativeLanguageName = (locale: string) => {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) || locale;
  } catch (e) {
    return locale; // Handle exceptions like non-standard codes
  }
};

export function LanguageBanner({ bannerData, onDismiss }: Props) {
  const { i18n } = useTranslation('common', {
    keyPrefix: 'language_banner',
    lng: bannerData.displayLocale,
  });

  const t = i18n.getFixedT(bannerData.displayLocale, 'common', 'language_banner'); // Assuming 'common' namespace

  const languageName = bannerData.suggestedLocale ? getNativeLanguageName(bannerData.suggestedLocale) : '';

  return (
    <div className="bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-100 p-3 shadow-md" role="alert">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-y-3 gap-x-4 px-2 sm:px-6 lg:px-8">
        {/* Message area */}
        <div className="grow flex flex-col md:flex-row md:items-center gap-2">
          {bannerData.type === 'mismatch' ? (
            // Scenario 1: Language mismatch
            <p className="text-sm md:text-base font-medium">{t('message', { language: languageName })}</p>
          ) : (
            // Scenario 2: Unsupported language
            <p className="text-sm md:text-base font-medium">{t('unsupported.message')}</p>
          )}
        </div>

        {/* Button/Action area */}
        <div className="shrink-0 flex items-center flex-wrap gap-2">
          {bannerData.type === 'mismatch' && bannerData.targetPath ? (
            // Scenario 1: Language switch button
            <Link
              to={bannerData.targetPath}
              onClick={onDismiss}
              className="px-3 py-1.5 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
            >
              {t('switch_button', { language: languageName })}
            </Link>
          ) : (
            <>
              <a
                href={GITHUB_TRANSLATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
              >
                {t('unsupported.contribute_button')}
              </a>
              <div className="relative z-10">
                <LocaleSwitcher />
              </div>
            </>
          )}

          {/* Common: Close button */}
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-md text-sky-700 dark:text-sky-200 hover:bg-sky-200 dark:hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
            aria-label={t('dismiss_button')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
