// app/components/ThemeToggleButton.tsx

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineComputerDesktop, HiOutlineMoon, HiOutlineSun } from 'react-icons/hi2';
import { useIsDarkState } from '~/store/isDarkState';
import { useOutsideClick } from '~/utils/useOutsideClick';

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

// [Theme Dropdown]
export const ThemeDropdown = ({ isMobileText = false }: { isMobileText?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const { setIsDark } = useIsDarkState();
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation('common', { keyPrefix: 'navigation' });
  useOutsideClick(ref, () => setIsOpen(false));

  const isValidTheme = (value: string | null): value is Theme => {
    return value === 'light' || value === 'dark' || value === 'system';
  };

  const applyTheme = (newTheme: Theme) => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    const effectiveTheme = newTheme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : newTheme;
    root.classList.add(effectiveTheme);
    setIsDark(effectiveTheme);
    localStorage.setItem('theme', newTheme);
  };

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    const themeValue: Theme = isValidTheme(storedTheme) ? storedTheme : 'system';
    setTheme(themeValue);
    applyTheme(themeValue);
  }, []);

  const currentIcon =
    theme === 'light' ? (
      <HiOutlineSun className="text-xl" strokeWidth={1.5} />
    ) : theme === 'dark' ? (
      <HiOutlineMoon className="text-xl" strokeWidth={1.5} />
    ) : (
      <HiOutlineComputerDesktop className="text-xl" strokeWidth={1.5} />
    );

  return (
    <div className="relative flex items-center" ref={ref}>
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors">
        {currentIcon}
        <span className={`${isMobileText ? 'block' : 'hidden xl:block'} text-sm font-medium`}>{t('theme')}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-lg py-1 z-50">
          {(
            [
              { id: 'light' as const, label: t('lightMode'), icon: <HiOutlineSun /> },
              { id: 'dark' as const, label: t('darkMode'), icon: <HiOutlineMoon /> },
              { id: 'system' as const, label: t('systemTheme'), icon: <HiOutlineComputerDesktop /> },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setTheme(item.id);
                applyTheme(item.id);
                setIsOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white transition-colors text-left"
            >
              <span className="text-lg">{item.icon}</span> {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
