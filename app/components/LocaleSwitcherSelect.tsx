'use client';

import { useEffect, useRef, useState } from "react";
import { Locale } from "../utils/i18n/config";
import { setUserLocale } from "../utils/i18n/service";

type Props = {
  defaultValue: string;
  items: Array<{value: string; label: string}>;
  label: string;
};


type LocaleItem = {
  value: string;
  label: string;
};

type LocaleSwitcherProps = {
defaultValue: string;
items: LocaleItem[];
label: string;
};


// export default function LocaleSwitcherSelect({
//   defaultValue,
//   items,
//   label
// }: Props) {
//   function onChange(value: string) {
//     const locale = value as Locale;
//     setUserLocale(locale);
//   }

//   return (
//     <div className="locale-switcher">
//       <select defaultValue={defaultValue} onChange={(e) => onChange(e.target.value)} aria-label={label}>
//         {items.map((item) => (
//           <option key={item.value} value={item.value}>
//             {item.label}
//           </option>
//         ))}
//       </select>
//     </div>
//   );
// }


export default function LocaleSwitcherSelect({ defaultValue, items, label }: LocaleSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LocaleItem>(
    () => items.find(item => item.value === defaultValue) || items[0]
  );
  const switcherRef = useRef<HTMLDivElement>(null);

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
    setUserLocale(item.value as Locale);
  };

  return (
    <div className="relative inline-block text-left w-36" ref={switcherRef} aria-label={label}>
      <div>
        <button
          type="button"
          className="inline-flex justify-between items-center w-full rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800 focus:ring-blue-500 transition-colors duration-200"
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
          className="origin-top-right absolute right-0 mt-2 w-full rounded-md shadow-lg bg-white dark:bg-gray-700 ring-1 ring-gray-300 ring-opacity-5 focus:outline-none z-20"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="options-menu"
        >
          <div className="py-1" role="none">
            {items.map((item) => (
              <button
                key={item.value}
                onClick={() => handleItemClick(item)}
                className={`${
                  selectedItem.value === item.value
                    ? 'font-semibold bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-white'
                    : 'text-gray-700 dark:text-gray-300'
                } block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 hover:text-gray-900 dark:hover:text-white transition-colors duration-150`}
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