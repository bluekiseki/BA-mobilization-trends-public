// app/components/planner/inventory/QuantityEditSheet.tsx
import { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';
import { RiHeartLine } from 'react-icons/ri';
import { CustomNumberInput } from '~/components/CustomInput';
import { GiftAffectionGroups, type GiftStudentEntry } from '~/components/planner/StudentGrowth/GiftStudentSheet';
import { StudentAvatar } from '~/components/planner/common/StudentAvatar';
import type { StudentPortraitData } from '~/types/plannerData';

interface PerStudentNeed {
  studentId: number;
  name: string;
  amount: number;
}

interface QuantityEditSheetProps {
  itemKey: string; // identity of the currently-shown item — used to know when to re-focus the input
  label: string;
  description?: string;
  helperText?: string;
  icon: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext: () => void;
  // Growth-material breakdown; mutually exclusive with giftStudents.
  perStudentNeeds?: PerStudentNeed[];
  // All users (Opart/eleph only); hides section if undefined.
  allUsers?: { studentId: number; name: string }[];
  giftStudents?: GiftStudentEntry[];
  studentPortraits?: StudentPortraitData;
}

// Mobile: bottom sheet; Desktop: docked sidebar. Tab/buttons navigate between items.
export function QuantityEditSheet({
  itemKey,
  label,
  description,
  helperText,
  icon,
  value,
  onChange,
  onClose,
  onPrev,
  onNext,
  perStudentNeeds = [],
  allUsers,
  giftStudents,
  studentPortraits,
}: QuantityEditSheetProps) {
  const { t } = useTranslation('planner');
  const { t: t_ui } = useTranslation('ui');
  const inputId = useId();

  useEffect(() => {
    document.getElementById(inputId)?.focus();
  }, [itemKey, inputId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    if (e.shiftKey) onPrev?.();
    else onNext();
  };

  return (
    <div className="fixed inset-0 z-50 sm:pointer-events-none" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-black/30 sm:hidden" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-0 flex items-end sm:items-stretch justify-center sm:justify-end">
        <div className="relative w-full sm:w-80 sm:h-full max-h-[85vh] sm:max-h-none bg-white dark:bg-neutral-900 border-t sm:border-l border-neutral-200 dark:border-neutral-700 rounded-t-xl sm:rounded-none pointer-events-auto flex flex-col">
          <div className="p-4 pb-0 shrink-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="shrink-0">{icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate" title={label}>
                  {label}
                </div>
                {helperText && <div className="text-xs text-neutral-400 dark:text-neutral-500">{helperText}</div>}
              </div>
              <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 shrink-0" aria-label={t_ui('close')}>
                <FaTimes size={14} />
              </button>
            </div>

            {description && <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3 leading-relaxed">{description}</p>}

            <div className="flex items-center gap-2">
              <button
                onClick={() => onChange(Math.max(0, value - 1))}
                className="w-9 h-9 shrink-0 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                −
              </button>
              <CustomNumberInput
                id={inputId}
                value={value}
                min={0}
                onChange={(v) => onChange(v ?? 0)}
                className="flex-1 h-9 text-center text-base rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                onClick={() => onChange(value + 1)}
                className="w-9 h-9 shrink-0 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                +
              </button>
            </div>

            <div className="flex items-center justify-between mt-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <button
                onClick={onPrev}
                disabled={!onPrev}
                className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 disabled:opacity-30 px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700"
              >
                <FaChevronLeft size={10} /> {t_ui('previous')}
                <kbd className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded text-[9px] font-mono">Shift+Tab</kbd>
              </button>
              <button onClick={onNext} className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 px-2 py-1.5 rounded border border-neutral-200 dark:border-neutral-700">
                <kbd className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded text-[9px] font-mono">Tab</kbd>
                {t_ui('next')} <FaChevronRight size={10} />
              </button>
            </div>
          </div>

          {/* Growth-plan / gift breakdown — scrolls independently so the controls above stay put */}
          <div className="flex-1 overflow-y-auto p-4 pt-3 min-h-0">
            {giftStudents ? (
              <div className="space-y-3">
                <div className="flex items-center gap-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  <RiHeartLine size={11} /> {t('affectionTab.giftIndex.studentsWhoLike')} ({giftStudents.length})
                </div>
                <GiftAffectionGroups students={giftStudents} studentPortraits={studentPortraits} emptyMessage={t('affectionTab.giftIndex.noStudents')} />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{t('inventory.studentNeeds', { count: perStudentNeeds.length })}</div>
                  {perStudentNeeds.length === 0 ? (
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">{t('inventory.noActivePlanNeeds')}</p>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {perStudentNeeds.map((s) => (
                          <tr key={s.studentId} className="border-b border-neutral-50 dark:border-neutral-800/60 last:border-0">
                            <td className="py-1.5 flex items-center gap-2">
                              <StudentAvatar name={s.name} portrait={studentPortraits?.[s.studentId]} />
                              <span className="truncate text-neutral-700 dark:text-neutral-200">{s.name}</span>
                            </td>
                            <td className="py-1.5 text-right font-mono text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{s.amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {allUsers && (
                  <div className="space-y-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{t('inventory.allUsersHeading', { count: allUsers.length })}</div>
                    {allUsers.length === 0 ? (
                      <p className="text-xs text-neutral-400 dark:text-neutral-500">{t('inventory.noUsersForGrowth')}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {allUsers.map((s) => (
                          <StudentAvatar key={s.studentId} name={s.name} portrait={studentPortraits?.[s.studentId]} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
