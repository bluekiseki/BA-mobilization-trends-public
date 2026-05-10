//'use client'
// app/components/Navigation.tsx
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { issuesURL } from '~/data/livedataServer.json';

import { HiOutlineQuestionMarkCircle, HiOutlineBars3, HiOutlineXMark, HiOutlineLightBulb, HiOutlineFlag, HiChevronDown } from 'react-icons/hi2';

import { PyroxenesIcon } from './Icon';
import { localeLink } from '~/utils/localeLink';
import { DEFAULT_LOCALE, SUPORTED_LOCALES, type Locale } from '~/utils/i18n/config';
import { useHelpStore } from '~/store/helpStore';
import { type GameServer } from '~/types/data';

import { LanguageBanner } from './LanguageMismatchBanner';
import { useLanguageBannerStore } from '~/store/languageBannerState';
import { HiCode, HiOutlineMail } from 'react-icons/hi';
import ContactButton from './ContactButton';
import BugReportModal from './common/BugReportModal';
import { useOutsideClick } from '~/utils/useOutsideClick';
import { ThemeDropdown } from './ThemeToggleButton';
import { LocaleDropdown } from './LocaleSwitcher';
import { changePathLanguage } from './LocaleSwitcherSelect';
import { ServerToggleSwitch } from './ServerSwitcher';

// ==========================================
// 1. Utilities & configuration data
// ==========================================
const navLinks = [
  { key: 'dashboard', label: 'dashboard', path: (c: string | null) => `/dashboard/${c || 'jp'}`, regex: /\/dashboard\/(kr|jp)/ },
  { key: 'ranking', label: 'ranking', path: (c: string | null) => `/charts/${c || 'jp'}/ranking`, regex: /\/charts\/(kr|jp)\/ranking$/ },
  { key: 'heatmap', label: 'heatmap', path: (c: string | null) => `/charts/${c || 'jp'}/heatmap`, regex: /\/charts\/(kr|jp)\/heatmap$/ },
];

const helpWhitelist = [
  /^(?:\/(?:ko|ja|zh-Hant))?\/dashboard\/(kr|jp)\/\w/,
  /^(?:\/(?:ko|ja|zh-Hant))?\/charts/,
  /^(?:\/(?:ko|ja|zh-Hant))?\/planner\//,
  /^(?:\/(?:ko|ja|zh-Hant))?\/utils\/jukebox/,
  // /^(?:\/(?:ko|ja|zh-Hant))?\/live/,
];

// ==========================================
// 2. Integrated components
// ==========================================

// Wrapper component dedicated to animation
const LanguageBannerAnimationWrapper = ({ show, onExited, children }: { show: boolean; onExited: () => void; children: React.ReactNode }) => {
  const [render, setRender] = useState(show);
  const [animate, setAnimate] = useState(false);
  // Switch to overflow-visible after animation (to allow dropdowns to extend outside the banner)
  const [isFullyOpen, setIsFullyOpen] = useState(false);

  useEffect(() => {
    if (show) {
      // Mount to DOM first
      setRender(true);
      // Apply animation class immediately after (delay required to trigger CSS transition)
      const timer = setTimeout(() => setAnimate(true), 50);
      return () => clearTimeout(timer);
    } else {
      // Closing state: Revert overflow to hidden immediately, then play animation in reverse
      setIsFullyOpen(false);
      setAnimate(false);
      // Unmount completely from DOM and execute close callback after animation (1000ms) ends
      const timer = setTimeout(() => {
        setRender(false);
        onExited();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [show, onExited]);

  if (!render) return null;

  return (
    // Outer: Height animation. overflow-hidden while opening, overflow-visible after fully opened (for dropdowns)
    <div
      className={`transition-[max-height,opacity] duration-1000 ease-in-out ${animate ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0'} ${isFullyOpen ? 'overflow-visible' : 'overflow-hidden'}`}
      onTransitionEnd={() => {
        if (animate) setIsFullyOpen(true);
      }}
    >
      {children}
    </div>
  );
};

const LanguageBannerController = ({ reqLocale }: { reqLocale: Locale }) => {
  const [bannerData, setBannerData] = useState<{
    type: 'mismatch' | 'unsupported';
    displayLocale: Locale;
    suggestedLocale?: Locale;
    targetPath?: string;
  } | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  const { hasShownLanguageBanner, _hasHydrated, setHasShownLanguageBanner } = useLanguageBannerStore();
  const { pathname, search } = useLocation();
  const { i18n } = useTranslation();
  const locale = i18n.language as Locale;

  useEffect(() => {
    if (!_hasHydrated) return;

    if (hasShownLanguageBanner) {
      setBannerData(null);
      setShowBanner(false);
      return;
    }

    const browserPrefs = [
      ...new Set(
        navigator.languages.map((l) => {
          if (['zh-TW', 'zh-HK', 'zh-MO', 'zh-hant', 'zh'].includes(l)) return 'zh-Hant';
          return l.split('-')[0];
        }),
      ),
    ] as Locale[];

    const supportedLngs = SUPORTED_LOCALES as readonly Locale[];
    const bestSupportedBrowserLocale = browserPrefs.find((lang) => supportedLngs.includes(lang));
    const bannerDisplayLocale = supportedLngs.includes(reqLocale) ? reqLocale : DEFAULT_LOCALE;

    if (bestSupportedBrowserLocale && bestSupportedBrowserLocale !== locale) {
      const newPath = changePathLanguage(locale, bestSupportedBrowserLocale, pathname);
      setBannerData({
        type: 'mismatch',
        displayLocale: bannerDisplayLocale,
        suggestedLocale: bestSupportedBrowserLocale,
        targetPath: newPath + search,
      });
      setShowBanner(true);
    } else if (!bestSupportedBrowserLocale) {
      setBannerData({
        type: 'unsupported',
        displayLocale: bannerDisplayLocale,
      });
      setShowBanner(true);
    } else {
      if (!bannerData) {
        setHasShownLanguageBanner();
      }
    }
  }, [_hasHydrated, hasShownLanguageBanner, pathname, search, locale, reqLocale]);

  if (!bannerData && !showBanner) return null;

  // console.log('show LanguageBanner', _hasHydrated, hasShownLanguageBanner);

  return (
    <LanguageBannerAnimationWrapper
      show={showBanner}
      onExited={() => {
        // Cleanup function executed after the animation completely finishes
        setHasShownLanguageBanner();
        setBannerData(null);
      }}
    >
      {/* Actual banner content goes inside the wrapper */}
      {bannerData && (
        <LanguageBanner
          bannerData={bannerData}
          onDismiss={() => {
            // Trigger the closing animation instead of closing immediately on button click
            setShowBanner(false);
          }}
        />
      )}
    </LanguageBannerAnimationWrapper>
  );
};

export const HelpDropdown = ({ isHelpAvailable, isMobileText = false, onOpenBugModal }: { isHelpAvailable: boolean; isMobileText?: boolean; onOpenBugModal: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const openSidebar = useHelpStore((state) => state.openSidebar);

  const { t } = useTranslation('common', { keyPrefix: 'navigation' });

  // Close dropdown on outside click
  useOutsideClick(ref, () => setIsOpen(false));

  return (
    <>
      <div className="relative flex items-center" ref={ref}>
        {/* 1. Help icon button (opens dropdown on click) */}
        <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white transition-colors">
          <HiOutlineQuestionMarkCircle className="text-xl" strokeWidth={1.5} />
          <span className={`${isMobileText ? 'block' : 'hidden xl:block'} text-sm font-medium`}>{t('help')}</span>
        </button>

        {/* 2. Dropdown menu */}
        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg shadow-lg py-1 z-50">
            {isHelpAvailable && (
              <button
                onClick={() => {
                  openSidebar();
                  setIsOpen(false);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-white transition-colors text-left"
              >
                <HiOutlineLightBulb className="text-lg" /> {t('viewDescription')}
              </button>
            )}

            <button
              onClick={() => {
                onOpenBugModal();
                setIsOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-white transition-colors text-left"
            >
              <HiOutlineFlag className="text-lg" /> {t('reportBug')}
            </button>

            <ContactButton>
              <span
                // href={issuesURL}
                // target="_blank"
                // rel="noreferrer"
                // onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-white transition-colors text-left"
              >
                <HiOutlineMail className="text-lg" /> {t('email')}
              </span>
            </ContactButton>

            <a
              href={issuesURL.replace('/issues', '')}
              target="_blank"
              rel="noreferrer"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-white transition-colors text-left"
            >
              <HiCode className="text-lg" /> {t('viewCode')}
            </a>
          </div>
        )}
      </div>
    </>
  );
};

const PlannerDropdown = ({ locale, isActive, activeLinkStyle }: { locale: Locale; isActive: boolean; activeLinkStyle: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation('common', { keyPrefix: 'navigation' });
  const { t: t_p } = useTranslation('planner');

  useOutsideClick(ref, () => setIsOpen(false));

  const plannerItems = [
    { key: 'event', to: '/planner/event', label: t_p('page.eventPlanner') },
    { key: 'gacha', to: '/planner/gacha', label: t_p('gacha.title', 'Pyroxene Planner') },
    { key: 'students', to: '/planner/students', label: t_p('page.studentGrowthPlanner') },
    { key: 'equipment', to: '/planner/equipment', label: t_p('page.equipmentFarmingPlanner') },
    { key: 'favor', to: '/utils/favor', label: t_p('page.favorCalculator') },
  ];

  return (
    <div className="relative flex items-center" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`md:text-base text-sm whitespace-nowrap font-semibold transition-colors flex items-center gap-0.5 ${
          isActive ? activeLinkStyle : 'text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white'
        }`}
      >
        {t('planner')}
        <HiChevronDown className={`text-sm transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-52 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg shadow-lg py-1 z-50">
          {plannerItems.map((item) => (
            <Link
              key={item.key}
              to={localeLink(locale, item.to)}
              onClick={() => setIsOpen(false)}
              className="flex items-center px-4 py-2.5 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const MobilePlannerGroup = ({ locale, pathname, onClose }: { locale: Locale; pathname: string; onClose: () => void }) => {
  const { t } = useTranslation('common', { keyPrefix: 'navigation' });
  const { t: t_p } = useTranslation('planner');
  const isPlannerActive = /\/planner\/|\/utils\/favor/.test(pathname);

  const plannerItems = [
    { key: 'event', to: '/planner/event', label: t_p('page.eventPlanner') },
    { key: 'gacha', to: '/planner/gacha', label: t_p('gacha.title', 'Pyroxene Planner') },
    { key: 'students', to: '/planner/students', label: t_p('page.studentGrowthPlanner') },
    { key: 'equipment', to: '/planner/equipment', label: t_p('page.equipmentFarmingPlanner') },
    { key: 'favor', to: '/utils/favor', label: t_p('page.favorCalculator') },
  ];

  return (
    <div className="flex flex-col gap-2">
      <span className={`text-base font-bold ${isPlannerActive ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-neutral-400'}`}>{t('planner')}</span>
      <div className="flex flex-col gap-3 pl-3 border-l-2 border-slate-100 dark:border-neutral-800">
        {plannerItems.map((item) => {
          const isActive = pathname.includes(item.to);
          return (
            <Link
              key={item.key}
              to={localeLink(locale, item.to)}
              onClick={onClose}
              className={`text-sm font-medium transition-colors ${isActive ? 'text-slate-900 dark:text-white underline decoration-yellow-500 decoration-2 underline-offset-4' : 'text-slate-500 dark:text-neutral-400'}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

// ==========================================
// 3. Main Navigation
// ==========================================
export const Navigation = ({ reqLocale }: { reqLocale: Locale }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const { t, i18n } = useTranslation('common', { keyPrefix: 'navigation' });
  const { t: t_c } = useTranslation('common');
  const locale = i18n.language as Locale;
  const { pathname } = useLocation();

  const headerRef = useRef<HTMLElement>(null);
  useOutsideClick(headerRef, () => {
    if (isMobileMenuOpen) setIsMobileMenuOpen(false);
  });

  const country = (() => {
    if (pathname.includes('/jp')) return 'jp';
    if (pathname.includes('/kr')) return 'kr';
    return null;
  })();

  // Variable to determine whether to expose server settings
  const match = pathname.match(/^(|\/ko|\/ja|\/zh\-Hant)\/(charts|dashboard)\/(jp|kr)/);
  let currentServer = match ? (match[3] as GameServer) : null;
  if (pathname.match(/^(|\/ko|\/ja|\/zh\-Hant)\/dashboard\/(jp|kr)\/\w\d+/)) {
    currentServer = null;
  }

  const isHelpAvailable = helpWhitelist.some((pattern) => pattern.test(pathname));
  const isPlannerActive = /\/planner\/|\/utils\/favor/.test(pathname);
  const activeLinkStyle =
    "relative after:content-[''] after:absolute after:left-0 after:bottom-[2px] after:w-full after:h-[4px] after:bg-yellow-500 after:-z-10 dark:after:bg-bluearchive-botton-yellow";

  return (
    <>
      {/* Place banner controller at the top of the component */}
      {/* z-[200]: Must be higher than header (z-100) so dropdown is not hidden by header */}
      <div className="relative z-200">
        <LanguageBannerController reqLocale={reqLocale} />
      </div>

      <header ref={headerRef} className="sticky top-0 z-100 w-full bg-white/95 dark:bg-neutral-800 backdrop-blur-md">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-4 lg:px-6 flex justify-between items-center h-14">
          {/* Left: Logo */}
          <Link to={localeLink(locale, '/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <PyroxenesIcon />
            <span className="hidden min-[320px]:flex md:hidden font-extrabold  ">{t_c('site-title')}</span>
          </Link>

          {/* Center: Navigation links (Desktop) */}
          <nav className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 gap-7 items-center">
            {navLinks.map((link) => {
              const isActive = link.regex.test(pathname);
              return (
                <Link
                  key={link.key}
                  to={localeLink(locale, link.path(country))}
                  className={`md:text-base text-sm whitespace-nowrap font-semibold transition-colors ${isActive ? activeLinkStyle : 'text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white'}`}
                >
                  {t(link.label as any)}
                </Link>
              );
            })}
            <PlannerDropdown locale={locale} isActive={isPlannerActive} activeLinkStyle={activeLinkStyle} />
            <Link
              to={localeLink(locale, '/utils/jukebox')}
              className={`md:text-base text-sm whitespace-nowrap font-semibold transition-colors ${/\/utils\/jukebox/.test(pathname) ? activeLinkStyle : 'text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white'}`}
            >
              BGM
            </Link>
          </nav>

          {/* Right: Utilities (Icons common to desktop & mobile) */}
          <div className="flex items-center gap-3 sm:gap-5">
            <ThemeDropdown />
            <LocaleDropdown currentLocale={locale} />
            <HelpDropdown isHelpAvailable={isHelpAvailable} onOpenBugModal={() => setIsBugModalOpen(true)} />

            {/* Show desktop toggle switch only if server selection is available on the current page */}
            {currentServer && (
              <div className="hidden md:block">
                <ServerToggleSwitch currentServer={currentServer} variant="dropdown" />
              </div>
            )}

            {/* Mobile hamburger icon */}
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden text-slate-600 dark:text-neutral-300 ml-1">
              {isMobileMenuOpen ? <HiOutlineXMark className="text-2xl" strokeWidth={1.5} /> : <HiOutlineBars3 className="text-2xl" strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {/* Mobile hamburger menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-14 left-0 w-full bg-white dark:bg-neutral-950 border-b border-slate-200 dark:border-neutral-800 shadow-xl px-5 py-5 space-y-5 z-10">
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => {
                const isActive = link.regex.test(pathname);
                return (
                  <Link
                    key={link.key}
                    to={localeLink(locale, link.path(country))}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`text-base font-bold transition-colors ${isActive ? 'text-slate-900 dark:text-white underline decoration-yellow-500 decoration-2 underline-offset-4' : 'text-slate-500 dark:text-neutral-400'}`}
                  >
                    {t(link.label as any)}
                  </Link>
                );
              })}

              {/* Planner Group */}
              <MobilePlannerGroup locale={locale} pathname={pathname} onClose={() => setIsMobileMenuOpen(false)} />

              {/* BGM */}
              <Link
                to={localeLink(locale, '/utils/jukebox')}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`text-base font-bold transition-colors ${/\/utils\/jukebox/.test(pathname) ? 'text-slate-900 dark:text-white underline decoration-yellow-500 decoration-2 underline-offset-4' : 'text-slate-500 dark:text-neutral-400'}`}
              >
                BGM
              </Link>

              {/* Bug Report */}
              <button
                onClick={() => {
                  setIsBugModalOpen(true);
                  setIsMobileMenuOpen(false);
                }}
                className="text-base font-bold transition-colors text-slate-500 dark:text-neutral-400 text-left flex items-center gap-2"
              >
                {/* <HiOutlineFlag className="text-base" /> */}
                {t('reportBug')}
              </button>
            </div>

            {/* Render mobile toggle switch only if server selection is available on the current page */}
            {currentServer && (
              <>
                <div className="h-px bg-slate-100 dark:bg-neutral-800 w-full" />
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-500 dark:text-neutral-400 mb-1">{t('serverSettings')}</span>
                  <div className="-ml-2">
                    <ServerToggleSwitch currentServer={currentServer} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {isBugModalOpen && <BugReportModal onClose={() => setIsBugModalOpen(false)} issuesURL={issuesURL} />}
    </>
  );
};
