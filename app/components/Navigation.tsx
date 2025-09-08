'use client'

import { useEffect, useRef, useState } from "react";
import LocaleSwitcher from "./LocaleSwitcher";
import { ThemeSwitcher } from "./ThemeToggleButton";
import { useTranslations } from "next-intl";
import Link from 'next/link';

export const Navigation = () => {
    // const { darkMode, toggleDarkMode } = useThemeStore();
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const t = useTranslations('layout-nav');
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


    return <nav className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left Section: Takes up equal space to center the links */}
        <div className="flex-1">
            <Link href="/" className="text-xl font-bold text-slate-900 dark:text-slate-50 transition-opacity hover:opacity-80">
                {t('home')}
            </Link>
        </div>

        {/* Center Section: Always visible nav links */}
        <div className="flex items-center justify-center gap-4 sm:gap-6">
             <Link href="/charts/ranking" className="font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-50">
                {t('ranking')}
            </Link>
            <Link href="/charts/heatmap" className="font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-50">
                {t('heatmap')}
            </Link>
        </div>

        {/* Right Section: Takes up equal space and aligns content to the right */}
        <div className='flex-1 flex items-center justify-end'>
            {/* Desktop Controls */}
            <div className="hidden md:flex items-center gap-4">
                <LocaleSwitcher />
                <ThemeSwitcher />
            </div>

            {/* Mobile Settings Button & Dropdown */}
            <div className="relative md:hidden" ref={menurRef}>
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                    aria-expanded={isMenuOpen}
                >
                    <span className="sr-only">Open settings menu</span>
                    {/* Settings (Cog) Icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z" /></svg>
                </button>

                {/* MOBILE SETTINGS DROPDOWN PANEL */}
                <div className={`${isMenuOpen ? 'block' : 'hidden'} absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-white dark:bg-slate-900 shadow-lg ring-1 ring-gray-300 dark:ring-gray-700 ring-opacity-5 focus:outline-none`}>
                    <div className="py-4 flex flex-col items-center gap-4">
                        <LocaleSwitcher />
                        <ThemeSwitcher />
                    </div>
                </div>
            </div>
        </div>
    </nav>
    // return <></>
}