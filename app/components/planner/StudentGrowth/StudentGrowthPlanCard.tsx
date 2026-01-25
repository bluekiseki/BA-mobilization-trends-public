// app/components/planner/StudentGrowth/StudentGrowthPlanCard.tsx

import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, IconData, IconInfos, Student, StudentData, StudentPortraitData } from '~/types/plannerData';
import eventList from '~/data/jp/eventList.json';

// Sub-components
import { GrowthAccordion } from './GrowthAccordion';
import { BasicStatsTab } from './BasicStatsTab';
import { SkillsTab } from './SkillsTab';
import { EquipmentTab } from './EquipmentTab';
import { PotentialTab } from './PotentialTab';
import { AffectionTab } from './FaverTab';
import StudentSearchDropdown from '~/components/StudentSearchDropdown';
import { MAX_LEVEL } from './const';

// Icons
import { FiChevronsUp, FiTarget, FiTrash2, FiX, FiSearch, FiChevronsDown } from 'react-icons/fi';
import { IoSync } from 'react-icons/io5';

// --- Constants ---
const HighFlowerBouquetItemIds = [5996, 5997];
const LowFlowerBouquetItemIds = [5998, 5999];

// --- Types ---
interface StudentGrowthPlanCardProps {
  plan: GrowthPlan;
  allStudents: StudentData;
  studentPortraits: StudentPortraitData;
  studentOptions: [string, Student][];
  eventData?: EventData;
  iconData?: IconData;
  iconInfos?: IconInfos;
  onClose: () => void;
}

// --- Main Component ---
export const StudentGrowthPlanCard = ({ plan, allStudents, studentPortraits, eventData, iconData, onClose }: StudentGrowthPlanCardProps) => {
  const { updatePlan, removePlan, toggleEventInclusion } = useGlobalStore();
  const { t } = useTranslation(['planner', 'common']);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ stats: true });
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const studentInfo = plan.studentId ? allStudents[plan.studentId] : null;

  // --- Logic Hooks ---
  const rankOptions = useMemo(
    () => [
      ...Array.from({ length: 5 }, (_, i) => ({ value: `star_${i + 1}`, label: `${i + 1}★` })),
      ...Array.from({ length: 4 }, (_, i) => ({ value: `uw_${i + 1}`, label: `${t('common.ue', 'UE')} ${i + 1}★` })),
    ],
    [],
  );

  const giftAffectionList = useMemo(() => {
    if (!plan.studentId || !studentInfo || !eventData?.icons.Item) return [];
    const studentTags = [...(studentInfo.FavorItemTags || []), ...(studentInfo.FavorItemUniqueTags || [])];
    const allGifts = Object.entries(eventData.icons.Item)
      .filter(([, itemData]) => itemData.ItemCategory === 6)
      .map(([itemId, itemData]) => {
        const matchCount = itemData.TagsStr?.filter((tag) => studentTags.includes(tag)).length || 0;
        let preferenceLevel = matchCount + 1 + Number(itemData.Rarity === 3);
        let affectionPoints = 0;
        const idNum = Number(itemId);

        if (HighFlowerBouquetItemIds.includes(idNum)) {
          affectionPoints = 240;
          preferenceLevel = 4;
        } else if (LowFlowerBouquetItemIds.includes(idNum)) {
          affectionPoints = 60;
          preferenceLevel = 3;
        } else if (itemData.Rarity === 3) {
          affectionPoints = preferenceLevel >= 4 ? 240 : preferenceLevel === 3 ? 180 : 120;
        } else {
          affectionPoints = preferenceLevel >= 4 ? 80 : preferenceLevel === 3 ? 60 : preferenceLevel === 2 ? 40 : 20;
        }

        return { id: itemId, type: 'Item', rarity: itemData.Rarity, affectionPoints, preferenceLevel };
      });
    return allGifts.sort((a, b) => b.rarity - a.rarity || b.affectionPoints - a.affectionPoints);
  }, [plan.studentId, studentInfo, eventData]);

  // --- Handlers ---
  const handleBatchUpdate = useCallback(
    (field: string, value: unknown) => {
      updatePlan(plan.uuid, field, value);
    },
    [updatePlan, plan.uuid],
  );

  const handlePlanChange = useCallback(
    (field: string, value: string | number | boolean, isNumeric = false) => {
      updatePlan(plan.uuid, field, isNumeric ? Number(value) || 0 : value);
    },
    [updatePlan, plan.uuid],
  );

  const handleRankChange = useCallback(
    (type: 'current' | 'target', value: string) => {
      const [rankType, rankLevel] = value.split('_');
      const level = Number(rankLevel);
      if (rankType === 'star') {
        updatePlan(plan.uuid, `${type}.star`, level);
        updatePlan(plan.uuid, `${type}.uw`, 0);
      } else {
        updatePlan(plan.uuid, `${type}.star`, 5);
        updatePlan(plan.uuid, `${type}.uw`, level);
      }
    },
    [updatePlan, plan.uuid],
  );

  // --- Action Generators ---
  const generateActions = (section: string) => {
    const update = (field: string, val: unknown) => updatePlan(plan.uuid, field, val);
    return {
      onTargetMax: () => {
        if (section === 'stats') {
          update('target.level', MAX_LEVEL);
          handleRankChange('target', 'uw_4');
          update('target.affection', 100);
        } else if (section === 'skills') {
          update('target.ex', 5);
          update('target.normal', 10);
          update('target.passive', 10);
          update('target.sub', 10);
        } else if (section === 'equipment') {
          update('target.equipment', [10, 10, 10]);
        } else if (section === 'potential') {
          update('target.potential', { hp: 25, atk: 25, heal: 25 });
        } else if (section === 'affection') {
          update('target.affection', 100);
        }
      },
      onResetTarget: () => {
        if (section === 'stats') {
          update('target.level', plan.current.level);
          update('target.star', plan.current.star);
          update('target.uw', plan.current.uw);
          update('target.affection', plan.current.affection);
        } else if (section === 'skills') {
          update('target.ex', plan.current.ex);
          update('target.normal', plan.current.normal);
          update('target.passive', plan.current.passive);
          update('target.sub', plan.current.sub);
        } else if (section === 'equipment') {
          update('target.equipment', [...plan.current.equipment]);
        } else if (section === 'potential') {
          update('target.potential', { ...plan.current.potential });
        } else if (section === 'affection') {
          update('target.affection', plan.current.affection);
        }
      },
      onFullMax: () => {
        if (section === 'stats') {
          ['current', 'target'].forEach((t) => {
            update(`${t}.level`, MAX_LEVEL);
            update(`${t}.star`, 5);
            update(`${t}.uw`, 4);
            update(`${t}.affection`, 100);
          });
        } else if (section === 'skills') {
          ['current', 'target'].forEach((t) => {
            update(`${t}.ex`, 5);
            update(`${t}.normal`, 10);
            update(`${t}.passive`, 10);
            update(`${t}.sub`, 10);
          });
        } else if (section === 'equipment') {
          ['current', 'target'].forEach((t) => update(`${t}.equipment`, [10, 10, 10]));
        } else if (section === 'potential') {
          ['current', 'target'].forEach((t) => update(`${t}.potential`, { hp: 25, atk: 25, heal: 25 }));
        } else if (section === 'affection') {
          ['current', 'target'].forEach((t) => update(`${t}.affection`, 100));
        }
      },
      onFullReset: () => {
        if (section === 'stats') {
          ['current', 'target'].forEach((t) => {
            update(`${t}.level`, 1);
            update(`${t}.star`, studentInfo?.StarGrade || 1);
            update(`${t}.uw`, 0);
            update(`${t}.affection`, 1);
          });
        } else if (section === 'skills') {
          ['current', 'target'].forEach((t) => {
            update(`${t}.ex`, 1);
            update(`${t}.normal`, 1);
            update(`${t}.passive`, 1);
            update(`${t}.sub`, 1);
          });
        } else if (section === 'equipment') {
          ['current', 'target'].forEach((t) => update(`${t}.equipment`, [0, 0, 0]));
        } else if (section === 'potential') {
          ['current', 'target'].forEach((t) => update(`${t}.potential`, { hp: 0, atk: 0, heal: 0 }));
        } else if (section === 'affection') {
          ['current', 'target'].forEach((t) => update(`${t}.affection`, 1));
        }
      },
    };
  };

  const handleGlobalAction = (action: 'min' | 'targetMax' | 'max' | 'reset') => {
    Object.keys(openSections).forEach((section) => {
      const actions = generateActions(section);
      if (action === 'min') actions.onFullReset();
      if (action === 'targetMax') actions.onTargetMax();
      if (action === 'max') actions.onFullMax();
      if (action === 'reset') actions.onResetTarget();
    });
  };

  const warnings = {
    equipment: plan.target.equipment.some((tier, i) => {
      const requiredLvl = i === 1 ? 15 : i === 2 ? 35 : 1;
      return plan.target.level < requiredLvl && tier > 0;
    }),
    potential: (plan.target.level < 90 || plan.target.uw === 0) && Object.values(plan.target.potential).some((v) => v > 0),
  };
  const formatSkill = (val: number, max: number) => (val === max ? 'M' : val);
  const summaries = {
    stats: {
      cur: `Lv.${plan.current.level} / ${plan.current.uw > 0 ? `${t('common.ue', 'UE')}${plan.current.uw}★` : `${plan.current.star}★`}`,
      tar: `Lv.${plan.target.level} / ${plan.target.uw > 0 ? `${t('common.ue', 'UE')}${plan.target.uw}★` : `${plan.target.star}★`}`,
    },
    skills: {
      cur: `${formatSkill(plan.current.ex, 5)}${formatSkill(plan.current.normal, 10)}${formatSkill(plan.current.passive, 10)}${formatSkill(plan.current.sub, 10)}`,
      tar: `${formatSkill(plan.target.ex, 5)}${formatSkill(plan.target.normal, 10)}${formatSkill(plan.target.passive, 10)}${formatSkill(plan.target.sub, 10)}`,
    },
    eq: { cur: `T${plan.current.equipment.join('/')}`, tar: `T${plan.target.equipment.join('/')}` },
    pot: {
      cur: `${plan.current.potential.hp}/${plan.current.potential.atk}/${plan.current.potential.heal}`,
      tar: `${plan.target.potential.hp}/${plan.target.potential.atk}/${plan.target.potential.heal}`,
    },
  };

  const sortedEvents = useMemo(
    () =>
      Object.entries(eventList)
        .map(([id, details]) => ({ id: Number(id), name: `${Number(id) > 10000 ? `[${t('common.rerun')}] ` : ''}${details.Kr}` }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const filteredEvents = useMemo(
    () => sortedEvents.filter((e) => !plan.includedInEvents.includes(e.id) && e.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [searchTerm, sortedEvents, plan.includedInEvents],
  );

  const bulletColor = studentInfo?.BulletType ? { Explosion: '#b62915', Pierce: '#bc8800', Mystic: '#206d9b', Sonic: '#9a46a8' }[studentInfo.BulletType] : '#e5e7eb';

  // --- Global Actions Configuration ---
  const globalActions = [
    {
      action: 'min' as const,
      icon: <FiChevronsDown size={14} />,
      label: t('growthCard.btnMinAll', 'Min All'),
      desc: t('growthCard.tooltipMinAll'),
      colorClass: 'text-gray-600 bg-gray-50 hover:bg-gray-100 border-gray-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-gray-300',
    },
    {
      action: 'reset' as const,
      icon: <IoSync size={14} />,
      label: t('growthCard.btnResetTargets', 'Sync'),
      desc: t('growthCard.tooltipResetTargets'),
      colorClass: 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300',
    },
    {
      action: 'targetMax' as const,
      icon: <FiTarget size={14} />,
      label: t('growthCard.btnMaxTargets', 'Goal Max'),
      desc: t('growthCard.tooltipMaxTargets'),
      colorClass: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-300',
    },
    {
      action: 'max' as const,
      icon: <FiChevronsUp size={14} />,
      label: t('growthCard.btnMaxAll', 'All Max'),
      desc: t('growthCard.tooltipMaxAll'),
      colorClass: 'text-red-600 bg-red-50 hover:bg-red-100 border-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300',
    },
  ];

  return (
    <div className="flex flex-col bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-gray-100 dark:border-neutral-800 overflow-hidden transition-all duration-200">
      {/* 1. Header Area */}
      <div className="relative z-20">
        <div className="absolute top-0 left-0 bottom-0 w-1" style={{ backgroundColor: bulletColor }} />

        {/* Top Row: Portrait, Select, Delete/Close */}
        <div className="flex items-center gap-3 p-3 pl-4 bg-white dark:bg-neutral-900">
          {/* Portrait */}
          <div className="relative shrink-0">
            {plan.studentId && studentPortraits[plan.studentId] ? (
              <div className="w-10 h-10 rounded-full object-cover ring-2 ring-gray-50 dark:ring-neutral-800 shrink-0 overflow-hidden" style={{ backgroundColor: bulletColor || '#f3f4f6' }}>
                <img src={`data:image/webp;base64,${studentPortraits[plan.studentId]}`} className="w-full h-full object-cover" alt="" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-neutral-800 animate-pulse" />
            )}
          </div>

          {/* Student Selector */}
          <div className="flex-1 min-w-0">
            <StudentSearchDropdown students={allStudents} selectedStudentId={plan.studentId} setSelectedStudentId={(id) => handlePlanChange('studentId', Number(id))} />
          </div>

          {/* Window Controls (Delete & Close) */}
          <div className="flex items-center gap-1 pl-2 border-l border-gray-100 dark:border-neutral-800">
            <button
              onClick={() => {
                // if (confirm(t('common.confirmRemove')))
                removePlan(plan.uuid);
              }}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title={t('common.remove')}
            >
              <FiTrash2 size={18} />
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800" title={t('common.close')}>
              <FiX size={18} />
            </button>
          </div>
        </div>

        {/* Action Row: 4 Visible Buttons with Descriptions */}
        {studentInfo && (
          <div className="px-3 pb-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {globalActions.map((btn) => (
                <button
                  key={btn.action}
                  onClick={() => handleGlobalAction(btn.action)}
                  className={`flex flex-col items-start p-2 rounded-lg border transition-all active:scale-[0.98] ${btn.colorClass}`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {btn.icon}
                    <span className="text-xs font-bold">{btn.label}</span>
                  </div>
                  <span className="text-[10px] opacity-80 leading-tight text-left break-keep">{btn.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Content: Scrollable Area */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-gray-50 dark:divide-neutral-800 bg-white dark:bg-neutral-900 custom-scrollbar border-t border-gray-100 dark:border-neutral-800">
        {studentInfo ? (
          <>
            <GrowthAccordion
              title={t('growthCard.stats')}
              isOpen={openSections.stats}
              onToggle={() => setOpenSections((p) => ({ ...p, stats: !p.stats }))}
              currentSummary={summaries.stats.cur}
              targetSummary={summaries.stats.tar}
              {...generateActions('stats')}
            >
              <BasicStatsTab
                plan={plan}
                studentInfo={studentInfo}
                handlePlanChange={handlePlanChange}
                handleRankChange={handleRankChange}
                rankOptions={rankOptions}
                handleBatchUpdate={handleBatchUpdate}
              />
            </GrowthAccordion>
            {/* ... Other Tabs (Skills, Equipment, Potential, Affection) ... */}
            <GrowthAccordion
              title={t('growthCard.skills')}
              isOpen={openSections.skills}
              onToggle={() => setOpenSections((p) => ({ ...p, skills: !p.skills }))}
              currentSummary={summaries.skills.cur}
              targetSummary={summaries.skills.tar}
              {...generateActions('skills')}
            >
              <SkillsTab plan={plan} studentInfo={studentInfo} handlePlanChange={handlePlanChange} />
            </GrowthAccordion>

            <GrowthAccordion
              title={t('growthCard.equipment')}
              isOpen={openSections.equipment}
              onToggle={() => setOpenSections((p) => ({ ...p, equipment: !p.equipment }))}
              currentSummary={summaries.eq.cur}
              targetSummary={summaries.eq.tar}
              {...generateActions('equipment')}
              isWarning={warnings.equipment}
              warningText={t('equipmentTab.levelLockWarning')}
            >
              <EquipmentTab plan={plan} studentInfo={studentInfo} handleBatchUpdate={handleBatchUpdate} />
            </GrowthAccordion>

            <GrowthAccordion
              title={t('growthCard.potential')}
              isOpen={openSections.potential}
              onToggle={() => setOpenSections((p) => ({ ...p, potential: !p.potential }))}
              currentSummary={summaries.pot.cur}
              targetSummary={summaries.pot.tar}
              {...generateActions('potential')}
              isWarning={warnings.potential}
              warningText={t('potentialTab.unlockCondition')}
            >
              <PotentialTab plan={plan} handleBatchUpdate={handleBatchUpdate} isWarning={warnings.potential} />
            </GrowthAccordion>

            <GrowthAccordion
              title={t('growthCard.affection')}
              isOpen={openSections.affection}
              onToggle={() => setOpenSections((p) => ({ ...p, affection: !p.affection }))}
              currentSummary={`Rank ${plan.current.affection}`}
              targetSummary={`Rank ${plan.target.affection}`}
              {...generateActions('affection')}
            >
              {eventData?.icons.Item && iconData ? (
                <AffectionTab plan={plan} giftAffectionList={giftAffectionList} eventData={eventData} iconData={iconData} handlePlanChange={handlePlanChange} />
              ) : (
                <div className="p-6 text-center text-xs text-gray-400">Loading Affection Data...</div>
              )}
            </GrowthAccordion>
          </>
        ) : (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400 opacity-60">
            <FiSearch size={32} className="mb-2" />
            <span className="text-sm font-light">{t('growthCard.selectStudentPrompt')}</span>
          </div>
        )}
      </div>

      {/* 3. Footer: Event Tags */}
      <div className="relative bg-gray-50 dark:bg-neutral-950/50 border-t border-gray-200 dark:border-neutral-800 p-2 z-10">
        <div className="mt-2 relative">
          <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider ml-2 mb-2">{t('growthCard.includeInEventsQuestion')}</h4>
          <div className="relative group">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
            <input
              type="text"
              placeholder={t('growthCard.searchEvents', 'Add Event...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              className="w-full bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
            />
          </div>
          {isSearchFocused && searchTerm && filteredEvents.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50 animate-in slide-in-from-bottom-2 fade-in">
              {filteredEvents.map((e) => (
                <button
                  key={e.id}
                  onMouseDown={() => {
                    toggleEventInclusion(plan.uuid, e.id);
                    setSearchTerm('');
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 dark:hover:bg-neutral-700 border-b border-gray-50 dark:border-neutral-700/50 last:border-0 truncate transition-colors flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  {e.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={`flex flex-wrap gap-1.5 mt-2 transition-all`}>
          {plan.includedInEvents.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-neutral-700 px-2.5 py-1 rounded-full text-[11px] shadow-sm"
            >
              <span className="truncate max-w-[120px]">{sortedEvents.find((e) => e.id === id)?.name || id}</span>
              <button onClick={() => toggleEventInclusion(plan.uuid, id)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full p-0.5 transition-colors">
                <FiX size={10} />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
