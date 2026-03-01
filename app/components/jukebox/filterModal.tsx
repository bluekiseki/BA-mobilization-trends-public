import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaSearch, FaTimes, FaCheckDouble, FaRegSquare, FaRegCheckSquare } from 'react-icons/fa';
import type { Locale } from '~/utils/i18n/config';
import { useSearchMatcher } from '~/utils/useSearchMatcher';

// --- Types (If in a separate file, import these) ---
interface Student {
  Id: number;
  Name: string;
}

// ------------------------------------------------------------------
// 1. FilterModal (For Main Story, Event Story - [ID, Name] pair)
// ------------------------------------------------------------------

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: [string, string][]; // [id, name]
  selectedItems: Record<string, boolean>;
  onToggleItem: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
}

export const FilterModal: React.FC<FilterModalProps> = ({ isOpen, onClose, title, items, selectedItems, onToggleItem, onToggleAll }) => {
  const { t, i18n } = useTranslation('jukebox');
  const locale = i18n.language as Locale;
  const matcher = useSearchMatcher(locale);

  const [filterTerm, setFilterTerm] = useState('');

  // Filter items based on search term
  const filteredItems = useMemo(() => {
    if (!filterTerm) return items;
    const lowerTerm = filterTerm.toLowerCase();
    return items.filter(([_, name]) => matcher(name, lowerTerm));
  }, [items, filterTerm]);

  // Check if all *currently filtered* items are selected
  const areAllVisibleSelected = filteredItems.length > 0 && filteredItems.every(([id]) => selectedItems[id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-neutral-800 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh] border border-neutral-200 dark:border-neutral-700">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center bg-neutral-50 dark:bg-neutral-800/50 rounded-t-2xl">
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">{title}</h3>
          <button onClick={onClose} className="p-2 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors">
            <FaTimes />
          </button>
        </div>

        {/* Search & Actions */}
        <div className="p-4 bg-white dark:bg-neutral-800 sticky top-0 z-10 space-y-3">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder={t('search.placeholder')}
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-neutral-100 dark:bg-neutral-700 border-none rounded-lg focus:ring-2 focus:ring-blue-500 text-neutral-800 dark:text-neutral-200 placeholder-neutral-500 dark:placeholder-neutral-400"
            />
          </div>
          <button onClick={() => onToggleAll(filteredItems.map(([id]) => id))} className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline px-1">
            <FaCheckDouble />
            {/* Use select_all_searched / deselect_all_searched based on context */}
            {areAllVisibleSelected ? t('actions.deselect_all') : t('actions.select_all')}
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {filteredItems.length > 0 ? (
            filteredItems.map(([id, name]) => (
              <button
                key={id}
                onClick={() => onToggleItem(id)}
                className={`w-full flex items-center p-3 rounded-lg text-left transition-all ${selectedItems[id] ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700/50'}`}
              >
                <div className={`text-xl mr-3 ${selectedItems[id] ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-300 dark:text-neutral-600'}`}>
                  {selectedItems[id] ? <FaRegCheckSquare /> : <FaRegSquare />}
                </div>
                <span className={`text-sm font-medium ${selectedItems[id] ? 'text-blue-800 dark:text-blue-200' : 'text-neutral-700 dark:text-neutral-300'}`}>{name}</span>
              </button>
            ))
          ) : (
            <div className="text-center py-8 text-neutral-500 dark:text-neutral-400 text-sm">{t('search.no_results')}</div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 rounded-b-2xl flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-transform active:scale-95">
            {t('actions.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// 2. StudentFilterModal (For Favor/Memorial - [ID, StudentObj] pair)
// ------------------------------------------------------------------

interface StudentFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: [string, Student][]; // [id, studentObject]
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-neutral-800 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh] border border-neutral-200 dark:border-neutral-700">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center bg-neutral-50 dark:bg-neutral-800/50 rounded-t-2xl">
          <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">{title}</h3>
          <button onClick={onClose} className="p-2 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200">
            <FaTimes />
          </button>
        </div>

        {/* Search & Actions */}
        <div className="p-4 bg-white dark:bg-neutral-800 sticky top-0 z-10 space-y-3">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              // Using the specific student search placeholder key
              placeholder={t('search.student_name')}
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-neutral-100 dark:bg-neutral-700 border-none rounded-lg focus:ring-2 focus:ring-blue-500 text-neutral-800 dark:text-neutral-200 placeholder-neutral-500 dark:placeholder-neutral-400"
            />
          </div>
          <button onClick={() => onToggleAll(filteredItems.map(([id]) => id))} className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline px-1">
            <FaCheckDouble />
            {areAllVisibleSelected ? t('actions.deselect_all_searched') : t('actions.select_all_searched')}
          </button>
        </div>

        {/* Student Grid List */}
        <div className="overflow-y-auto flex-1 p-2">
          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredItems.map(([id, student]) => (
                <button
                  key={id}
                  onClick={() => onToggleItem(id)}
                  className={`flex items-center p-2 rounded-lg text-left transition-all border ${selectedItems[id] ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-transparent border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-700/50'}`}
                >
                  <div className={`text-lg mr-2 ${selectedItems[id] ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-300 dark:text-neutral-600'}`}>
                    {selectedItems[id] ? <FaRegCheckSquare /> : <FaRegSquare />}
                  </div>
                  <span className={`text-sm font-medium truncate ${selectedItems[id] ? 'text-blue-800 dark:text-blue-200' : 'text-neutral-700 dark:text-neutral-300'}`}>{student.Name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-neutral-500 dark:text-neutral-400 text-sm">{t('search.no_results')}</div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 rounded-b-2xl flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-transform active:scale-95">
            {t('actions.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
