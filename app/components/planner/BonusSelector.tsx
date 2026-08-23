// src/components/BonusSelector.tsx

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiTrendingUp } from 'react-icons/fi';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import type { EventData, IconData, StudentData, StudentPortraitData } from '~/types/plannerData';
import type { WithNonNullable } from '~/utils/WithNonNullable';

export type TotalBonusMap = { [itemUniqueId: number]: number };

interface BonusSelectorProps {
  eventId: number;
  eventData: WithNonNullable<EventData, 'currency' | 'bonus'>; //NonNullable<EventData["currency"|"bonus"]>;
  iconData: IconData;
  allStudents: StudentData;
  studentPortraits: StudentPortraitData;
  onBonusCalculate: (bonusMap: TotalBonusMap) => void;
}

type BonusStudent = {
  id: string;
  name: string;
  portrait: string;
  totalBonusValue: number;
};

const calculateBonusMap = (studentIds: string[], eventData: BonusSelectorProps['eventData'], allStudents: StudentData): TotalBonusMap => {
  const bonusMap: TotalBonusMap = {};

  eventData.currency.forEach((currency) => {
    const relevantStudents = studentIds
      .map((id) => {
        const bonusInfo = eventData.bonus[id];
        if (!bonusInfo) return null;
        const typeIndex = bonusInfo.EventContentItemType.indexOf(currency.EventContentItemType);
        if (typeIndex === -1) return null;
        return {
          squadType: allStudents[Number(id)]?.SquadType || (Number(id) < 20000 ? 'Main' : 'Support'),
          bonusValue: bonusInfo.BonusPercentage[typeIndex],
        };
      })
      .filter((student): student is NonNullable<typeof student> => student !== null);

    const strikers = relevantStudents
      .filter((student) => student.squadType === 'Main')
      .sort((a, b) => b.bonusValue - a.bonusValue)
      .slice(0, 4);
    const specials = relevantStudents
      .filter((student) => student.squadType === 'Support')
      .sort((a, b) => b.bonusValue - a.bonusValue)
      .slice(0, 2);
    bonusMap[currency.ItemUniqueId] = [...strikers, ...specials].reduce((sum, student) => sum + student.bonusValue, 0);
  });

  return bonusMap;
};

export const BonusSelector = ({ eventId, eventData, iconData, allStudents, studentPortraits, onBonusCalculate }: BonusSelectorProps) => {
  const bonusData = eventData.bonus;
  const { plan, setSelectedStudents } = usePlanForEvent(eventId);
  const { selectedStudents } = plan;
  const growthPlans = useGlobalStore((state) => state.growthPlans);

  const myStudentPool = useMemo(() => {
    return new Set(growthPlans.filter((plan) => plan.studentId !== null).map((plan) => String(plan.studentId)));
  }, [growthPlans]);

  const onSelectStudent = useCallback(
    (studentId: string) => {
      if (selectedStudents) {
        const newSelectedStudent = selectedStudents.includes(studentId) ? selectedStudents.filter((id) => id !== studentId) : [...selectedStudents, studentId];
        setSelectedStudents(newSelectedStudent);
      }
    },
    [selectedStudents, setSelectedStudents],
  );
  const { t } = useTranslation('planner');
  const { t: t_ui } = useTranslation('ui');

  if (!selectedStudents) return null;

  const bonusStudents = useMemo(() => {
    return Object.keys(bonusData)
      .map((id) => {
        const studentInfo = allStudents[Number(id)];
        const bonusInfo = bonusData[id];
        const totalBonusValue = bonusInfo?.BonusPercentage.reduce((sum, current) => sum + current, 0);
        return {
          id,
          name: studentInfo?.Name || id,
          portrait: studentPortraits[Number(id)],
          totalBonusValue,
        };
      })
      .sort((a, b) => b.totalBonusValue - a.totalBonusValue);
  }, [bonusData, allStudents, studentPortraits]);

  const handleSelectAll = useCallback(() => {
    setSelectedStudents(bonusStudents.map((s) => s.id));
  }, [bonusStudents, selectedStudents, onSelectStudent]);

  const handleSelectFromMyPool = useCallback(() => {
    const myPoolBonusStudents = bonusStudents.filter((s) => myStudentPool.has(s.id));
    setSelectedStudents(myPoolBonusStudents.map((s) => s.id));
  }, [bonusStudents, myStudentPool, selectedStudents, onSelectStudent]);

  const handleDeselectAll = useCallback(() => {
    setSelectedStudents([]);
  }, [selectedStudents, onSelectStudent]);

  const totalBonus = useMemo(() => calculateBonusMap(selectedStudents, eventData, allStudents), [selectedStudents, allStudents, eventData]);

  const studentsThatIncreaseBonus = useMemo(() => {
    const currentBonus = calculateBonusMap(selectedStudents, eventData, allStudents);
    return new Set(
      bonusStudents
        .filter((student) => !selectedStudents.includes(student.id))
        .filter((student) => {
          const nextBonus = calculateBonusMap([...selectedStudents, student.id], eventData, allStudents);
          return eventData.currency.some((currency) => nextBonus[currency.ItemUniqueId] > currentBonus[currency.ItemUniqueId]);
        })
        .map((student) => student.id),
    );
  }, [selectedStudents, eventData, allStudents, bonusStudents]);

  // 1. Get the list of currencies to use for toggles
  const eventCurrencies = useMemo(() => {
    const eventBonusItems = new Set(
      Object.entries(bonusData)
        .map((v) => v[1].EventContentItemType)
        .flatMap((v) => v),
    );

    return eventData.currency
      .filter((v) => {
        return eventBonusItems.has(v.EventContentItemType);
      })
      .map((c) => ({
        itemType: c.EventContentItemType,
        itemUniqueId: c.ItemUniqueId,
        icon: iconData.Item?.[c.ItemUniqueId.toString()],
      }));
  }, [eventData.currency, iconData.Item]);

  // 2. State for active item filters, default to all active
  const [activeItemFilters, setActiveItemFilters] = useState<Set<number>>(() => new Set(eventCurrencies.map((c) => c.itemType)));

  // 3. Split view toggle
  const [isSplitView, setIsSplitView] = useState(true);

  // 4. Handle toggling an item filter
  const handleToggleFilter = useCallback((itemType: number) => {
    setActiveItemFilters((prev) => {
      const next = new Set(prev);
      if (next.has(itemType)) {
        next.delete(itemType);
      } else {
        next.add(itemType);
      }
      return next;
    });
  }, []);

  // 5. Filter students by active item filters
  const filteredBonusStudents = useMemo(() => {
    if (activeItemFilters.size === eventCurrencies.length) return bonusStudents;
    if (activeItemFilters.size === 0) return [];

    return bonusStudents.filter((student) => {
      const bonusInfo = bonusData[student.id];
      if (!bonusInfo) return false;
      return bonusInfo.EventContentItemType.some((type) => activeItemFilters.has(type));
    });
  }, [bonusStudents, activeItemFilters, eventCurrencies.length, bonusData]);

  // 6. Split into strikers (id starts with '1') and specials (id starts with '2')
  const { strikerStudents, specialStudents } = useMemo(() => {
    return {
      strikerStudents: filteredBonusStudents.filter((s) => s.id.charAt(0) === '1'),
      specialStudents: filteredBonusStudents.filter((s) => s.id.charAt(0) === '2'),
    };
  }, [filteredBonusStudents]);

  useEffect(() => {
    onBonusCalculate(totalBonus);
  }, [totalBonus, onBonusCalculate]);

  const renderStudentCard = (student: BonusStudent) => {
    const isSelected = selectedStudents.includes(student.id);
    const bonusInfo = bonusData[student.id];
    const increasesBonus = !isSelected && studentsThatIncreaseBonus.has(student.id);

    return (
      <div
        key={student.id}
        onClick={() => onSelectStudent(student.id)}
        title={student.name}
        className={`w-14 cursor-pointer relative rounded-sm overflow-hidden transition-all duration-200 flex flex-col group
          ${isSelected ? 'ring-2 dark:ring-1 ring-blue-500 dark:ring-blue-400 shadow-sm shadow-blue-500/50' : 'ring-1 ring-neutral-200 dark:ring-neutral-700 bg-white dark:bg-neutral-800 opacity-60 hover:opacity-100 hover:-translate-y-1'}`}
      >
        {isSelected && (
          <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white dark:border-neutral-800">
            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
        )}
        {increasesBonus && (
          <div
            className="absolute top-1 right-1 w-4 h-4 bg-green-600 rounded-full flex items-center justify-center border-2 border-white dark:border-neutral-800"
            title="Selecting this student increases an event bonus"
          >
            <FiTrendingUp aria-hidden="true" className="w-2.5 h-2.5 text-white" />
          </div>
        )}
        <img src={`data:image/webp;base64,${student.portrait}`} alt={student.name} className="w-full h-auto object-cover aspect-square" loading="lazy" />
        <div
          className={`p-0.5 text-center grow flex flex-col justify-center
            ${isSelected ? 'bg-white dark:bg-neutral-800' : ''}`}
        >
          <div className={`mt-0.5 text-[10px] leading-tight flex flex-col items-center gap-0.5 ${isSelected ? 'dark:text-blue-100' : 'text-neutral-600 dark:text-neutral-400'}`}>
            {bonusInfo.EventContentItemType.map((type, index) => {
              const item = eventData.currency.find((c) => c.EventContentItemType === type);
              if (!item) return null;

              const itemID = item.ItemUniqueId.toString();
              const percentage = bonusInfo.BonusPercentage[index] / 100;

              return (
                <div key={type} className="flex items-center justify-center gap-1">
                  <img src={`data:image/webp;base64,${iconData.Item?.[itemID]}`} className="w-4 h-4 object-contain" />
                  <span className="font-semibold">+{percentage}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Header: Title on left, controls on right. */}
      <div className="flex flex-wrap justify-between items-center cursor-pointer group pt-6 gap-3">
        {/* 1. Title (Always left-aligned) */}
        <div className="flex items-center gap-3 shrink-0">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('ui.bonusStudent')}</h2>
          <span className="flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500">
            <FiTrendingUp aria-hidden="true" className="w-3 h-3 text-green-700 dark:text-green-300" />
            {t('ui.bonusIncreaseHint')}
          </span>
        </div>

        {/* Wrapper for all controls, aligned to the right */}
        <div className="flex flex-wrap justify-end items-center gap-2">
          {/* 2. Item Filter Toggles */}
          {eventCurrencies.map((currency) => {
            const isActive = activeItemFilters.has(currency.itemType);
            return (
              <button
                key={currency.itemType}
                onClick={() => handleToggleFilter(currency.itemType)}
                title={String(currency.itemUniqueId)}
                className={`relative w-9 h-9 p-1 rounded-md transition-all transform hover:scale-110 ${
                  isActive ? 'bg-white dark:bg-neutral-700 ring-2 dark:ring-1 ring-blue-500' : 'bg-neutral-200 dark:bg-neutral-800 opacity-60 hover:opacity-100'
                }`}
              >
                <img src={`data:image/webp;base64,${currency.icon}`} className="w-full h-full object-contain" alt={String(currency.itemUniqueId)} />
                {isActive && (
                  <div className="absolute top-0 right-0 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                )}
              </button>
            );
          })}

          {/* Visual Separator */}
          <div className="border-l border-neutral-300 dark:border-neutral-600 h-9 mx-1"></div>

          {/* 3. Split View Toggle */}
          <button
            onClick={() => setIsSplitView((v) => !v)}
            className={`font-bold text-xs py-1 px-3 rounded-md transition-all hover:scale-105 active:scale-95 h-9 ${
              isSplitView
                ? 'bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white'
                : 'bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            {t('button.splitView')}
          </button>

          {/* Visual Separator */}
          <div className="border-l border-neutral-300 dark:border-neutral-600 h-9 mx-1"></div>

          {/* 4. Action Buttons */}
          <button
            onClick={handleSelectAll}
            className="bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-bold text-xs py-1 px-3 rounded-md transition-all hover:scale-105 active:scale-95 h-9"
          >
            {t_ui('selectAll')}
          </button>
          <button
            onClick={handleSelectFromMyPool}
            disabled={!growthPlans.length}
            className={`font-bold text-xs py-1 px-3 rounded-md transition-all h-9 ${
              growthPlans.length
                ? 'bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700 text-white hover:scale-105 active:scale-95'
                : 'bg-neutral-300 dark:bg-neutral-600 text-neutral-500 dark:text-neutral-400 cursor-not-allowed opacity-50'
            }`}
          >
            {t('button.selectFromMyPool')}
          </button>
          <button
            onClick={handleDeselectAll}
            className="bg-neutral-400 hover:bg-neutral-500 dark:bg-neutral-600 dark:hover:bg-neutral-700 text-white font-bold text-xs py-1 px-3 rounded-md transition-all hover:scale-105 active:scale-95 h-9"
          >
            {t_ui('deselectAll')}
          </button>
        </div>
      </div>

      <div data-component-name="BonusSelector_body" className="mt-4">
        {isSplitView ? (
          <div className="flex flex-col gap-4">
            {/* Striker Section */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#cc1a25' }}>
                  Striker
                </span>
                <div className="flex-1 border-t" style={{ borderColor: '#cc1a2540' }}></div>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">{strikerStudents.length}</span>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">{strikerStudents.map(renderStudentCard)}</div>
            </div>

            {/* Special Section */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: '#006bff' }}>
                  Special
                </span>
                <div className="flex-1 border-t" style={{ borderColor: '#006bff40' }}></div>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">{specialStudents.length}</span>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">{specialStudents.map(renderStudentCard)}</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 justify-center">{filteredBonusStudents.map(renderStudentCard)}</div>
        )}
      </div>
    </>
  );
};
