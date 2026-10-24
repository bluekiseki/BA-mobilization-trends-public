import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';
import { FaChevronDown, FaTimes } from 'react-icons/fa';

export default function GuideV3({ locale }: { locale: Locale }) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.intro' });
  const { t: tv3 } = useTranslation('planner', { keyPrefix: 'gacha.v3.guide' });
  const [showGuideTip, setShowGuideTip] = useState(false);
  useEffect(() => {
    if (window.localStorage.getItem('gacha_v3_guide_tip_seen') !== '1') setShowGuideTip(true);
  }, []);
  const dismissGuideTip = () => {
    setShowGuideTip(false);
    window.localStorage.setItem('gacha_v3_guide_tip_seen', '1');
  };
  return (
    <div className="v3-guide">
      <details
        onToggle={(event) => {
          if (event.currentTarget.open && showGuideTip) dismissGuideTip();
        }}
      >
        <summary className="v3-disclosure-summary w-fit gap-2 py-2 underline underline-offset-4">
          <span>{tv3('title')}</span>
          <FaChevronDown className="v3-disclosure-chevron" aria-hidden="true" />
        </summary>
        <div className="mt-3 space-y-4 text-sm text-neutral-600 dark:text-neutral-300">
          <p>{tv3('p_basic')}</p>
          <nav className="flex flex-wrap gap-4 underline">
            <Link to={localeLink(locale, '/planner/gacha/guide')}>{tv3('link_beginner')}</Link>
            <Link to={localeLink(locale, '/planner/gacha/v2')}>{tv3('link_v2')}</Link>
            <Link to={localeLink(locale, '/planner/gacha_old')}>{tv3('link_v1')}</Link>
            <Link to={localeLink(locale, '/planner/gacha-test')}>{tv3('link_verify')}</Link>
            <a href="https://docs.google.com/spreadsheets/d/1_Zjt_OM9XXidY3uYYDK92W9GrR3DN5cQsZ0IJsoEbjY" target="_blank" rel="noreferrer">
              {t('notes.note1_link')}
            </a>
          </nav>
          <p>{tv3('p_ticket')}</p>
          <p>{tv3('p_income')}</p>
          <ul className="list-disc space-y-2 pl-5">
            {(['note5', 'note6', 'note7', 'note8'] as const).map((key) => (
              <li key={key}>{t(`notes.${key}`)}</li>
            ))}
          </ul>
        </div>
      </details>
      {showGuideTip && (
        <aside className="v3-onboarding-tip v3-guide-tip" aria-label={tv3('tip_aria')}>
          <p>
            <Trans
              t={tv3}
              i18nKey="tip"
              components={{ 1: <Link to={localeLink(locale, '/planner/gacha/guide')} onClick={dismissGuideTip} className="font-semibold underline underline-offset-2" /> }}
            />
          </p>
          <button type="button" onClick={dismissGuideTip} aria-label={tv3('tip_close')}>
            <FaTimes aria-hidden="true" />
          </button>
        </aside>
      )}
    </div>
  );
}
