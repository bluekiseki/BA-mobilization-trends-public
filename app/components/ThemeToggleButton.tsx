"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useIsDarkState } from '../store/isDarkState';

type Theme = 'light' | 'dark' | 'system';

// Defines the type of value to be used in the ThemeContext
interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Manage theme status, apply/remove 'dark' class to <html> tag
 * This provider should enclose the root layout of the application.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>('system');
  const { setIsDark } = useIsDarkState();


  useEffect(() => {
    // Gets the stored theme from localStorage when the component is mounted.
    // If you have a theme that you previously set, update the status with that value.
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    if (storedTheme) {
      setTheme(storedTheme);
      if (storedTheme != 'system') setIsDark(storedTheme)
    }
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

    if (theme === 'system') {
      root.classList.add(systemTheme);
      setIsDark(systemTheme)
    } else {
      root.classList.add(theme);
      setIsDark(theme)
    }

    localStorage.setItem('theme', theme);

    // System theme change detection
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        const newSystemTheme = mediaQuery.matches ? 'dark' : 'light';
        root.classList.remove('light', 'dark');
        root.classList.add(newSystemTheme);
      }
    };

    mediaQuery.addEventListener('change', handleChange);

    // Clean up the event listener before the component is unmounted or theme changes.
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [theme]);

  const value = { theme, setTheme };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Custom hook for easy use of ThemeContext.
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * UI components that allow users to select their own themes
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center space-x-1 p-1 rounded-full bg-gray-200 dark:bg-gray-800 shadow-inner">
      {(['light', 'dark', 'system'] as Theme[]).map((t) => (
        <button
          key={t}
          onClick={() => setTheme(t)}
          aria-label={`${t} theme`}
          className={`p-2 rounded-full transition-colors duration-200 ${theme === t
              ? 'bg-bluearchive-botton-blue text-black shadow-md'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700'
            }`}
        >
          {t === 'light' && <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
          {t === 'dark' && <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
          {t === 'system' && <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
        </button>
      ))}
    </div>
  );
}