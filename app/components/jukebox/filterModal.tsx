// app/components/jukebox/filterModal.tsx
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaSearch, FaTimes, FaCheckDouble, FaRegSquare, FaRegCheckSquare } from 'react-icons/fa';
import type { Locale } from '~/utils/i18n/config';
import { useSearchMatcher } from '~/utils/useSearchMatcher';

interface Student {
  Id: number;
  Name: string;
}

// ------------------------------------------------------------------
// 1. FilterModal (Main Story, Event Story filters)
// ------------------------------------------------------------------
interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: [string, string][];
  selectedItems: Record<string, boolean>;
  onToggleItem: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
}

export const FilterModal: React.FC<FilterModalProps> = ({ isOpen, onClose, title, items, selectedItems, onToggleItem, onToggleAll }) => {
  const { t, i18n } = useTranslation('jukebox');
  const locale = i18n.language as Locale;
  const matcher = useSearchMatcher(locale);

  const [filterTerm, setFilterTerm] = useState('');

  const filteredItems = useMemo(() => {
    if (!filterTerm) return items;
    const lowerTerm = filterTerm.toLowerCase();
    return items.filter(([_, name]) => matcher(name, lowerTerm));
  }, [items, filterTerm]);

  const areAllVisibleSelected = filteredItems.length > 0 && filteredItems.every(([id]) => selectedItems[id]);

  if (!isOpen) return null;

  return (
    // [Improvement 1] Maintain z-50 (Modal stays on top as the previously modified player is z-40)
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-neutral-900 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center bg-white dark:bg-neutral-900 z-20">
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <FaTimes size={18} />
          </button>
        </div>

        {/* [Improvement 2] Neatly arrange search bar and Select All button in a single line */}
        <div className="p-4 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">{t('itemCount', { count: filteredItems.length })}</span>
            <button
              onClick={() => onToggleAll(filteredItems.map(([id]) => id))}
              className="flex items-center gap-1.5 text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <FaCheckDouble size={14} />
              {areAllVisibleSelected ? t('actions.deselect_all') : t('actions.select_all')}
            </button>
          </div>

          <div className="relative">
            <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
            <input
              type="text"
              placeholder={t('search.placeholder')}
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-100/70 dark:bg-neutral-800/50 border-none rounded-xl focus:ring-2 focus:ring-blue-500/50 text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 transition-all"
            />
          </div>
        </div>

        {/* [Improvement 3] List area: Remove unnecessary background colors, change to transparent and clean Row format */}
        <div className="overflow-y-auto flex-1 p-2 custom-scrollbar">
          {filteredItems.length > 0 ? (
            <ul className="space-y-0.5">
              {filteredItems.map(([id, name]) => {
                const isSelected = selectedItems[id];
                return (
                  <li key={id}>
                    <button
                      onClick={() => onToggleItem(id)}
                      className="w-full flex items-center px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/60 group"
                    >
                      {/* Blue color applied only to checked icons */}
                      <div className={`text-lg mr-3 transition-colors ${isSelected ? 'text-blue-500' : 'text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-400'}`}>
                        {isSelected ? <FaRegCheckSquare /> : <FaRegSquare />}
                      </div>
                      {/* Text changes only to bold default color when selected */}
                      <span className={`text-sm ${isSelected ? 'text-neutral-900 dark:text-white font-semibold' : 'text-neutral-600 dark:text-neutral-400 font-medium'}`}>{name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-center py-10 text-neutral-400 text-sm">{t('search.no_results')}</div>
          )}
        </div>

        {/* Bottom confirm button */}
        <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 text-sm font-semibold rounded-xl transition-colors"
          >
            {t('actions.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// 2. StudentFilterModal (Student filter)
// ------------------------------------------------------------------
interface StudentFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: [string, Student][];
  selectedItems: Record<string, boolean>;
  onToggleItem: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
}

export const StudentFilterModal: React.FC<StudentFilterModalProps> = ({ isOpen, onClose, title, items, selectedItems, onToggleItem, onToggleAll }) => {
  const { t, i18n } = useTranslation('jukebox');
  const locale = i18n.language as Locale;
  const matcher = useSearchMatcher(locale);
  const [filterTerm, setFilterTerm] = useState('');

  const filteredItems = useMemo(() => {
    if (!filterTerm) return items;
    const lowerTerm = filterTerm.toLowerCase();
    return items.filter(([_, student]) => matcher(student.Name, lowerTerm));
  }, [items, filterTerm]);

  const areAllVisibleSelected = filteredItems.length > 0 && filteredItems.every(([id]) => selectedItems[id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-neutral-900 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center bg-white dark:bg-neutral-900 z-20">
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <FaTimes size={18} />
          </button>
        </div>

        <div className="p-4 bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">{t('studentCount', { count: filteredItems.length })}</span>
            <button
              onClick={() => onToggleAll(filteredItems.map(([id]) => id))}
              className="flex items-center gap-1.5 text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <FaCheckDouble size={14} />
              {areAllVisibleSelected ? t('actions.deselect_all_searched') : t('actions.select_all_searched')}
            </button>
          </div>

          <div className="relative">
            <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
            <input
              type="text"
              placeholder={t('search.student_name')}
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-100/70 dark:bg-neutral-800/50 border-none rounded-xl focus:ring-2 focus:ring-blue-500/50 text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 transition-all"
            />
          </div>
        </div>

        {/* Student list: Maintain Grid layout but remove bulky box borders */}
        <div className="overflow-y-auto flex-1 p-3 custom-scrollbar">
          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {filteredItems.map(([id, student]) => {
                const isSelected = selectedItems[id];
                return (
                  <button
                    key={id}
                    onClick={() => onToggleItem(id)}
                    className="flex items-center px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/60 group"
                  >
                    <div className={`text-lg mr-3 transition-colors ${isSelected ? 'text-blue-500' : 'text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-400'}`}>
                      {isSelected ? <FaRegCheckSquare /> : <FaRegSquare />}
                    </div>
                    <span className={`text-sm truncate ${isSelected ? 'text-neutral-900 dark:text-white font-semibold' : 'text-neutral-600 dark:text-neutral-400 font-medium'}`}>{student.Name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-neutral-400 text-sm">{t('search.no_results')}</div>
          )}
        </div>

        <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 text-sm font-semibold rounded-xl transition-colors"
          >
            {t('actions.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
