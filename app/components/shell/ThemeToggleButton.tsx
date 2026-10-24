// app/components/ThemeToggleButton.tsx

import { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineComputerDesktop, HiOutlineMoon, HiOutlineSun } from 'react-icons/hi2';
import { useIsDarkState } from '~/store/isDarkState';

type Theme = 'light' | 'dark' | 'system';

// Defines the type of value to be used in the ThemeContext
interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
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
      if (storedTheme != 'system') setIsDark(storedTheme);
    }
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

    if (theme === 'system') {
      root.classList.add(systemTheme);
      setIsDark(systemTheme);
    } else {
      root.classList.add(theme);
      setIsDark(theme);
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

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
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

// Cycle through the available theme modes with a single click.
export const ThemeDropdown = ({ isMobileText = false }: { isMobileText?: boolean }) => {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation('common', { keyPrefix: 'navigation' });

  const nextTheme: Record<Theme, Theme> = {
    light: 'dark',
    dark: 'system',
    system: 'light',
  };

  const currentIcon =
    theme === 'light' ? (
      <HiOutlineSun className="text-xl" strokeWidth={1.5} />
    ) : theme === 'dark' ? (
      <HiOutlineMoon className="text-xl" strokeWidth={1.5} />
    ) : (
      <HiOutlineComputerDesktop className="text-xl" strokeWidth={1.5} />
    );

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => setTheme(nextTheme[theme])}
        aria-label={t(theme === 'light' ? 'lightMode' : theme === 'dark' ? 'darkMode' : 'systemTheme')}
        title={t(theme === 'light' ? 'lightMode' : theme === 'dark' ? 'darkMode' : 'systemTheme')}
        className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors"
      >
        {currentIcon}
        <span className={`${isMobileText ? 'block' : 'hidden xl:block'} text-sm font-medium`}>{t('theme')}</span>
      </button>
    </div>
  );
};
