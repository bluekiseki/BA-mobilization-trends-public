import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { DEFAULT_LOCALE, type Locale } from "~/utils/i18n/config";

type LocaleItem = {
  value: string;
  label: string;
};

type LocaleSwitcherProps = {
  defaultValue: string;
  items: LocaleItem[];
  label: string;
};

const BLACKLISTED_PATHS = ["/source"];


export function changePathLanguage(currentLocale: Locale, newLocale: Locale, pathname: string) {
  let basePath = pathname;
  // console.log('[changePathLanguage], basePath', basePath)
  if (currentLocale && pathname.startsWith(`/${currentLocale}`)) {
    basePath = pathname.replace(`/${currentLocale.replace(/\-/gi, '\-')}`, "");
  }
  // console.log('[changePathLanguage], 2 basePath', basePath)
  // e.g., '/ko' -> '/' (root path must be '/' not an empty string)
  if (basePath === "") {
    basePath = "/";
  }

  // 2. Check if the base path is included in the blacklist.
  const isBlacklisted = BLACKLISTED_PATHS.some((path) =>
    basePath.startsWith(path)
  );
  let newPath;

  if (isBlacklisted) {
    newPath = basePath;
  } else if (newLocale === DEFAULT_LOCALE) {
    // 3b. If the new language is the default (en), do not add a prefix.
    // e.g., '/page'
    newPath = basePath;
  } else {
    // 3c. If the new language is not the default, add the prefix.
    // e.g., '/ja/page'
    // (Handle case where basePath is '/', to become '/ja' instead of '/ja/')
    newPath = basePath === "/" ? `/${newLocale}` : `/${newLocale}${basePath}`;
  }

  return newPath
}

export default function LocaleSwitcherSelect({ defaultValue, items, label }: LocaleSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LocaleItem>(
    () => items.find(item => item.value === defaultValue) || items[0]
  );
  const switcherRef = useRef<HTMLDivElement>(null);
  const { pathname, search } = useLocation();
  const navigate = useNavigate()

  // Effect of closing the dropdown when clicking outside a component
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [switcherRef]);

  const handleItemClick = (item: LocaleItem) => {
    setSelectedItem(item);
    setIsOpen(false);

    const newPath = changePathLanguage(selectedItem.value as Locale, item.value as Locale, pathname)

    // document
    if (item.value)
      document.documentElement.lang = item.value;

    navigate(newPath + search);
    // setUserLocale(item.value as Locale);
  };

  return (
    <div className="relative inline-block text-left w-28" ref={switcherRef} aria-label={label}>
      <div>
        <button
          type="button"
          className="inline-flex justify-between items-center w-full rounded-lg border border-neutral-300 dark:border-neutral-600 shadow-sm px-4 py-2 bg-white dark:bg-neutral-700 text-sm font-medium text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-100 dark:focus:ring-offset-neutral-800 focus:ring-blue-500 transition-colors duration-200"
          id="options-menu"
          aria-haspopup="true"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
        >
          <span>{selectedItem.label}</span>
          <svg className={`-mr-1 ml-2 h-5 w-5 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div
          className="origin-top-right absolute right-0 mt-2 w-full rounded-md shadow-lg bg-white dark:bg-neutral-700 ring-1 ring-neutral-300 ring-opacity-5 focus:outline-none z-20"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="options-menu"
        >
          <div className="py-1" role="none">
            {items.map((item) => (
              <button
                key={item.value}
                onClick={() => handleItemClick(item)}
                className={`${selectedItem.value === item.value
                  ? 'font-semibold bg-neutral-100 dark:bg-neutral-600 text-neutral-900 dark:text-white'
                  : 'text-neutral-700 dark:text-neutral-300'
                  } block w-full text-left px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-600 hover:text-neutral-900 dark:hover:text-white transition-colors duration-150`}
                role="menuitem"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}