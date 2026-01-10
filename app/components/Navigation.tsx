//'use client'

import { useEffect, useRef, useState } from "react";
import LocaleSwitcher from "./LocaleSwitcher";
import { ThemeSwitcher } from "./ThemeToggleButton";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import ServerSwitcher from "./ServerSwitcher";
import { PyroxenesIcon } from "./Icon";
import { localeLink } from "~/utils/localeLink";
import { DEFAULT_LOCALE, SUPORTED_LOCALES, type Locale } from "~/utils/i18n/config";
import { LanguageBanner } from "./LanguageMismatchBanner";
import { useLanguageBannerStore } from "~/store/languageBannerState";
import { changePathLanguage } from "./LocaleSwitcherSelect";

const navLinks = [
    {
        key: 'dashboard',
        label: 'dashboard',
        path: (country: string | null) => `/dashboard/${country || 'jp'}`,
        regex: /^\/dashboard\/(kr|jp)/,
    },
    {
        key: 'ranking',
        label: 'ranking',
        path: (country: string | null) => `/charts/${country || 'jp'}/ranking`,
        regex: /^\/charts\/(kr|jp)\/ranking$/,
    },
    {
        key: 'heatmap',
        label: 'heatmap',
        path: (country: string | null) => `/charts/${country || 'jp'}/heatmap`,
        regex: /^\/charts\/(kr|jp)\/heatmap$/,
    },
    {
        key: 'planner',
        label: 'planner',
        path: () => `/planner/event`,
        regex: /^\/planner\/event/,
    },
    {
        key: 'bgm',
        label: 'BGM',
        path: () => `/utils/jukebox`,
        regex: /^\/utils\/jukebox/,
    },
];



export const Navigation = ({ reqLocale }: { reqLocale: Locale }) => {
    // const { darkMode, toggleDarkMode } = useThemeStore();
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    // const {t} = useTranslation('layout-nav');
    const { t, i18n } = useTranslation("navigation");
    const locale = i18n.language as Locale

    // console.log('Navigation', locale, t('home'))
    const [bannerData, setBannerData] = useState<{
        type: 'mismatch' | 'unsupported'
        displayLocale: Locale // Banner text language
        suggestedLocale?: Locale // Language to suggest
        targetPath?: string // Path to suggest
    } | null>(null)
    const { hasShownLanguageBanner, setHasShownLanguageBanner } = useLanguageBannerStore()



    // Effect of closing the dropdown when clicking outside a component

    const menurRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menurRef.current && !menurRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [menurRef]);

    const { pathname, search } = useLocation();
    const country = ((pathname: string) => {
        if (pathname.startsWith('/charts/jp')) return 'jp'
        if (pathname.startsWith('/charts/kr')) return 'kr'
        if (pathname.startsWith('/dashboard/jp')) return 'jp'
        if (pathname.startsWith('/dashboard/kr')) return 'kr'
        return null
    })(pathname);

    const activeLinkStyle = "relative after:content-[''] after:absolute after:left-0 after:bottom-[2px] after:w-full after:h-[4px] after:bg-yellow-500 after:-z-10 dark:after:bg-bluearchive-botton-yellow";

    const isOptionalLinkActive = navLinks.some(
        link => !['dashboard', 'planner', 'ranking'].includes(link.key) && link.regex.test(pathname)
    );

    const getVisibilityClass = (link: typeof navLinks[0]) => {
        const isActive = link.regex.test(pathname);

        switch (link.key) {
            case 'dashboard':
            case 'planner':
                return 'block';
            // Rankings are hidden on small screens with other "add" links enabled.
            case 'ranking':
                return isOptionalLinkActive ? 'hidden sm:block' : 'block';
            // The remaining links are hidden by default on the small screen, and are only visible when enabled.
            case 'heatmap':
            case 'bgm':
                return isActive ? 'block' : 'hidden sm:block';

            default:
                return 'block';
        }
    };



    useEffect(() => {
        // 1. If banner has already been shown, do nothing
        if (hasShownLanguageBanner) {
            setBannerData(null) // Prevent banner from reappearing when navigating to other pages
            return
        }

        const browserPrefs = [
            ...new Set(navigator.languages.map((l) => {
                if (['zh-TW', 'zh-HK', 'zh-MO', 'zh-hant', 'zh'].includes(l)) return 'zh-Hant' // TODO
                return l.split('-')[0]
            })),
        ] as Locale[]

        const supportedLngs = SUPORTED_LOCALES as readonly Locale[]
        const currentLocale = locale // Current page language
        const bestSupportedBrowserLocale = browserPrefs.find((lang) =>
            supportedLngs.includes(lang),
        )

        // 4. (Improvement 1) Determine the language to display the banner in
        // If reqLocale is supported, use it; otherwise, display banner in default language (DEFAULT_LOCALE)
        const bannerDisplayLocale = supportedLngs.includes(reqLocale)
            ? reqLocale
            : DEFAULT_LOCALE

        if (
            bestSupportedBrowserLocale &&
            bestSupportedBrowserLocale !== currentLocale
        ) {
            // 5. Scenario 1: 'Language Mismatch'
            // (User has a preferred supported language, but it&#39;s different from the current page language)
            const newPath = changePathLanguage(
                currentLocale,
                bestSupportedBrowserLocale,
                pathname,
            )

            setBannerData({
                type: 'mismatch',
                displayLocale: bannerDisplayLocale,
                suggestedLocale: bestSupportedBrowserLocale,
                targetPath: newPath + search,
            })
        } else if (!bestSupportedBrowserLocale) {
            // 6. Scenario 2: 'Unsupported Language'
            // (None of the browser&#39;s preferred languages are supported)
            setBannerData({
                type: 'unsupported',
                displayLocale: bannerDisplayLocale,
            })
        } else {
            // 7. Scenario 3: 'Match' (Preferred language == Current language)
            // Don't show the banner, treat it as "seen"
            if (!bannerData) {
                setHasShownLanguageBanner()
            }
        }
    }, [
        hasShownLanguageBanner,
        setHasShownLanguageBanner,
        pathname,
        search,
        locale,
        reqLocale,
    ])

    return <>

        {bannerData && (
            <LanguageBanner
                bannerData={bannerData}
                onDismiss={() => {
                    setHasShownLanguageBanner() // Save the "shown" state to the Zustand store
                    setBannerData(null) // Hide banner
                }}
            />
        )}
        <div className="p-3">
            <nav className="max-w-7xl mx-auto flex h-7 items-center justify-between px-2 sm:px-6 lg:px-8">
                {/* Left Section: Takes up equal space to center the links */}
                <div className="flex-1">
                    <Link to={localeLink(locale, "/")} className="text-xl font-semibold text-slate-900 dark:text-slate-50 transition-opacity hover:opacity-80">
                        {/* {t('home')} */}
                        <PyroxenesIcon />
                        {/* <ThemedPyroxenesIcon theme="light" title="Home"/> */}
                    </Link>
                </div>

                {/* Center Section: Always visible nav links */}
                <div className="flex items-center justify-center gap-4 sm:gap-6">
                    {/* <Link
                // pathname === '/charts/heatmap'
                to={`/dashboard/${country ? country : 'jp'}`}
                className={`font-medium transition-colors ${/^\/dashboard\/(kr|jp)/.test(pathname)
                    ? 'text-neutral-900 dark:text-neutral-50 ' + activeLinkStyle
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50'
                    }`}
            >
                {t('dashboard')}
            </Link>
            <Link
                to={`/charts/${country ? country : 'jp'}/ranking`}
                className={`sm:block font-medium transition-colors ${/^\/charts\/(kr|jp)\/ranking$/.test(pathname)
                    ? 'text-neutral-900 dark:text-neutral-50 text-underline-offset block ' + activeLinkStyle
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50'
                    }`}
            >
                {t('ranking')}
            </Link>
            <Link
                // pathname === '/charts/heatmap'
                to={`/charts/${country ? country : 'jp'}/heatmap`}
                className={`sm:block font-medium transition-colors ${/^\/charts\/(kr|jp)\/heatmap$/.test(pathname)
                    ? 'text-neutral-900 dark:text-neutral-50 block ' + activeLinkStyle
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50 hidden'
                    }`}
            >
                {t('heatmap')}
            </Link>
            <Link
                // pathname === '/charts/heatmap'
                to={`/planner/event`}
                className={`font-medium transition-colors ${/^\/planner\/event/.test(pathname)
                    ? 'text-neutral-900 dark:text-neutral-50 ' + activeLinkStyle
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50'
                    }`}
            >
                {t('planner')}
            </Link>
            <Link
                // pathname === '/charts/heatmap'
                to={`/utils/jukebox`}
                className={`sm:block font-medium transition-colors ${/^\/utils\/jukebox/.test(pathname)
                    ? 'text-neutral-900 dark:text-neutral-50 block ' + activeLinkStyle
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50 hidden'
                    }`}
            >
                {"BGM"}
            </Link> */}

                    {navLinks.map((link) => {
                        const isActive = link.regex.test(pathname);
                        const visibilityClass = getVisibilityClass(link);

                        // console.log('link.label, t(link.label as any', locale,  link.label, '->', t(link.label as any), )

                        return (
                            <Link
                                key={link.key}
                                to={localeLink(locale, link.path(country))}
                                // to={link.path(country)}
                                className={`font-medium transition-colors ${isActive
                                    ? `text-neutral-900 dark:text-neutral-50 ${activeLinkStyle}`
                                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50'
                                    } ${visibilityClass}`}
                            >
                                {link.key === 'bgm' ? link.label : t(link.label as any)}
                            </Link>
                        );
                    })}

                </div>

                {/* Right Section: Takes up equal space and aligns content to the right */}
                <div className='flex-1 flex items-center justify-end'>
                    {/* Desktop Controls */}
                    <div className="hidden xl:flex items-center gap-4">
                        <LocaleSwitcher />
                        <ThemeSwitcher />
                        <ServerSwitcher />
                    </div>

                    <div className="relative xl:hidden" ref={menurRef}>
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="inline-flex items-center justify-center p-2 rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                            aria-expanded={isMenuOpen}
                        >
                            <span className="sr-only">Open settings menu</span>
                            {/* Settings (Cog) Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z" /></svg>
                        </button>

                        <div className={`${isMenuOpen ? 'block' : 'hidden'} absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-white dark:bg-neutral-900 shadow-lg ring-1 ring-neutral-300 dark:ring-neutral-700 ring-opacity-5 focus:outline-none`}>
                            <div className="py-4 flex flex-col items-center gap-4">
                                <LocaleSwitcher />
                                <ThemeSwitcher />
                                <ServerSwitcher />
                            </div>
                        </div>
                    </div>
                </div>
            </nav>
        </div>
    </>
    // return <></>
}
