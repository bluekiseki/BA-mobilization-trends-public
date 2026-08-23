// app/components/planner/StudentGrowth/StudentGrowthPlanCard.tsx

import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import type { ContentItem, EventData, IconData, IconInfos, Student, StudentData, StudentPortraitData } from '~/types/plannerData';
import eventListJsonRaw from '~/data/jp/eventList.json';
import type { EventListData } from '~/types/eventList';
const eventList = eventListJsonRaw as unknown as EventListData;

// Sub-components
import { GrowthAccordion } from './GrowthAccordion';
import { BasicStatsTab } from './BasicStatsTab';
import { SkillsTab } from './SkillsTab';
import { EquipmentTab } from './EquipmentTab';
import { PotentialTab } from './PotentialTab';
import { AffectionTab } from './FaverTab';
import StudentSearchDropdown from '~/components/StudentSearchDropdown';
import { MAX_LEVEL, uwMaxLevelMap } from './const';

// Icons
import { FiChevronsUp, FiTarget, FiTrash2, FiX, FiSearch, FiChevronsDown, FiHelpCircle, FiInfo, FiDollarSign, FiPlus } from 'react-icons/fi';
import { IoSync } from 'react-icons/io5';
import { StarRating } from '~/components/StarRating';
import { getStarValue } from '~/components/dashboard/common';
import { getGiftAffectionList } from './giftAffectionList';

// --- Types ---
interface StudentGrowthPlanCardProps {
  plan: GrowthPlan;
  allStudents: StudentData;
  studentPortraits: StudentPortraitData;
  studentOptions: [string, Student][];
  contentItems?: ContentItem[];
  eventData?: EventData;
  iconData?: IconData;
  iconInfos?: IconInfos;
  onClose: () => void;
}

// Linear star-value helpers (same as StudentElephCard)
const ALL_STAR_VALUES_CARD = [1, 2, 3, 4, 5, 7, 8, 9, 10] as const;
function toSV(star: number, uw: number): number {
  return uw === 0 ? star : uw + 6;
}
function fromSV(n: number): { star: number; uw: number } {
  return n <= 5 ? { star: n, uw: 0 } : { star: 5, uw: n - 6 };
}

// --- FinalGoalDeadlineRowCard: sets deadline for the final (plan.target) goal ---
type FinalGoalScheduleCard = { date?: string; contentRef?: { id: string } };

interface FinalGoalDeadlineRowCardProps {
  schedule: FinalGoalScheduleCard | undefined;
  contentItems: ContentItem[];
  onChange: (schedule: FinalGoalScheduleCard | null) => void;
}

function FinalGoalDeadlineRowCard({ schedule, contentItems, onChange }: FinalGoalDeadlineRowCardProps) {
  const [mode, setMode] = useState<'event' | 'date'>(() => (schedule?.contentRef ? 'event' : 'date'));

  const handleSwitchMode = (m: 'event' | 'date') => {
    setMode(m);
    onChange(null);
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden text-[10px] shrink-0">
        {(['event', 'date'] as const).map((m) => (
          <button
            key={m}
            onClick={() => handleSwitchMode(m)}
            className={`px-1.5 py-0.5 transition-colors ${mode === m ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'}`}
          >
            {m === 'event' ? 'Content' : 'Date'}
          </button>
        ))}
      </div>
      {mode === 'event' ? (
        <select
          value={schedule?.contentRef?.id ?? ''}
          onChange={(e) => onChange(e.target.value ? { contentRef: { id: e.target.value } } : null)}
          className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400"
        >
          <option value="">— None —</option>
          {contentItems.map((ci) => (
            <option key={ci.id} value={ci.id}>
              {ci.prefix}
              {ci.season} {ci.bossTitle} ({ci.date})
            </option>
          ))}
        </select>
      ) : (
        <input
          type="date"
          value={schedule?.date ?? ''}
          onChange={(e) => onChange(e.target.value ? { date: e.target.value } : null)}
          className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400"
        />
      )}
    </div>
  );
}

// --- PendingGoalRowCard: draft goal committed only when date/contentRef is set ---
interface PendingGoalRowCardProps {
  minStar: number;
  maxStar: number;
  defaultStar: number;
  defaultUw: number;
  contentItems: ContentItem[];
  starBtnCls: (active: boolean) => string;
  onAdd: (goal: Omit<import('~/types/resourcePlan').StudentTargetGoal, 'id'>) => void;
  onCancel: () => void;
}

function PendingGoalRowCard({ minStar, maxStar, defaultStar, defaultUw, contentItems, starBtnCls, onAdd, onCancel }: PendingGoalRowCardProps) {
  const [star, setStar] = useState(defaultStar);
  const [uw, setUw] = useState(defaultUw);
  const [mode, setMode] = useState<'event' | 'date'>('event');
  const goalSV = toSV(star, uw);
  const visibleSVs = ALL_STAR_VALUES_CARD.filter((n) => n >= minStar && n <= maxStar);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 w-10 shrink-0">Target</span>
        <div className="flex flex-wrap gap-0.5 flex-1">
          {visibleSVs.map((n) => (
            <button
              key={n}
              onClick={() => {
                const { star: s, uw: u } = fromSV(n);
                setStar(s);
                setUw(u);
              }}
              className={starBtnCls(goalSV === n)}
            >
              <StarRating n={n} />
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="text-neutral-300 hover:text-red-500 dark:text-neutral-600 dark:hover:text-red-400 transition-colors shrink-0">
          <FiTrash2 size={11} />
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden text-[10px] shrink-0">
          {(['event', 'date'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-1.5 py-0.5 transition-colors ${mode === m ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'}`}
            >
              {m === 'event' ? 'Content' : 'Date'}
            </button>
          ))}
        </div>
        {mode === 'event' ? (
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onAdd({ targetStar: star, targetUw: uw, contentRef: { id: e.target.value } });
            }}
            className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400"
          >
            <option value="">— Select content —</option>
            {contentItems.map((ci) => (
              <option key={ci.id} value={ci.id}>
                {ci.prefix}
                {ci.season} {ci.bossTitle} ({ci.date})
              </option>
            ))}
          </select>
        ) : (
          <input
            type="date"
            className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400"
            onChange={(e) => {
              if (e.target.value) onAdd({ targetStar: star, targetUw: uw, date: e.target.value });
            }}
          />
        )}
      </div>
    </div>
  );
}

// --- GoalRow subcomponent (must be a proper component to allow useState) ---
interface GoalRowCardProps {
  goal: import('~/types/resourcePlan').StudentTargetGoal;
  visibleSVs: readonly number[];
  contentItems: ContentItem[];
  starBtnCls: (active: boolean) => string;
  onUpdate: (patch: Partial<import('~/types/resourcePlan').StudentTargetGoal>) => void;
  onRemove: () => void;
}

function GoalRowCard({ goal, visibleSVs, contentItems, starBtnCls, onUpdate, onRemove }: GoalRowCardProps) {
  const goalSV = toSV(goal.targetStar, goal.targetUw);
  const [goalMode, setGoalMode] = useState<'event' | 'date'>(() => (goal.contentRef ? 'event' : 'date'));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 w-10 shrink-0">Target</span>
        <div className="flex flex-wrap gap-0.5 flex-1">
          {visibleSVs.map((n) => (
            <button
              key={n}
              onClick={() => {
                const { star, uw } = fromSV(n);
                onUpdate({ targetStar: star, targetUw: uw });
              }}
              className={starBtnCls(goalSV === n)}
            >
              <StarRating n={n} />
            </button>
          ))}
        </div>
        <button onClick={onRemove} className="text-neutral-300 hover:text-red-500 dark:text-neutral-600 dark:hover:text-red-400 transition-colors shrink-0">
          <FiTrash2 size={11} />
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden text-[10px] shrink-0">
          {(['event', 'date'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setGoalMode(m);
                if (m === 'event') onUpdate({ date: undefined });
                else onUpdate({ contentRef: undefined });
              }}
              className={`px-1.5 py-0.5 transition-colors ${
                goalMode === m ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
              }`}
            >
              {m === 'event' ? 'Content' : 'Date'}
            </button>
          ))}
        </div>
        {goalMode === 'event' ? (
          <select
            value={goal.contentRef?.id ?? ''}
            onChange={(e) => onUpdate({ contentRef: e.target.value ? { id: e.target.value } : undefined })}
            className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400"
          >
            <option value="">— Select content —</option>
            {contentItems.map((ci) => (
              <option key={ci.id} value={ci.id}>
                {ci.prefix}
                {ci.season} {ci.bossTitle} ({ci.date})
              </option>
            ))}
          </select>
        ) : (
          <input
            type="date"
            className="flex-1 min-w-0 px-1.5 py-0.5 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400"
            value={goal.date ?? ''}
            onChange={(e) => onUpdate({ date: e.target.value || undefined })}
          />
        )}
      </div>
    </div>
  );
}

// --- Main Component ---
export const StudentGrowthPlanCard = ({ plan, allStudents, studentPortraits, contentItems = [], eventData, iconData, onClose }: StudentGrowthPlanCardProps) => {
  const { updatePlan, removePlan, toggleEventInclusion } = useGlobalStore();
  const { targetGoals, addTargetGoal, updateTargetGoal, removeTargetGoal, setFinalGoal } = useResourcePlanStore();
  const { t } = useTranslation(['planner', 'game', 'common']);
  const { t: t_ui } = useTranslation('ui');

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ stats: false, skills: false, equipment: false, potential: false, affection: false, targets: false });
  const [showTargetPending, setShowTargetPending] = useState(false);
  const [activeHelp, setActiveHelp] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showCostHints, setShowCostHints] = useState(true);

  const studentInfo = plan.studentId ? allStudents[plan.studentId] : null;

  // --- Logic Hooks ---
  const rankOptions = useMemo(
    () => [
      ...Array.from({ length: 5 }, (_, i) => ({ value: `star_${i + 1}`, label: `${i + 1}★` })),
      ...Array.from({ length: 4 }, (_, i) => ({ value: `uw_${i + 1}`, label: `${t('game:ue', 'UE')} ${i + 1}★` })),
    ],
    [],
  );

  const giftAffectionList = useMemo(() => {
    if (!plan.studentId || !studentInfo || !eventData?.icons.Item) return [];
    const gifts = getGiftAffectionList(studentInfo, eventData);
    return gifts;
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
        updatePlan(plan.uuid, `${type}.uwLevel`, 1);
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
          update('target.uwLevel', uwMaxLevelMap[4]);
          update('target.affection', Math.max(plan.target.affection, 50));
          update('target.gear', 2);
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
          update('target.affection', Math.max(plan.target.affection, 50));
        }
      },
      onResetTarget: () => {
        if (section === 'stats') {
          update('target.level', plan.current.level);
          update('target.star', plan.current.star);
          update('target.uw', plan.current.uw);
          update('target.uwLevel', plan.current.uwLevel);
          update('target.affection', plan.current.affection);
          update('target.gear', plan.current.gear ?? 0);
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
          (['current', 'target'] as const).forEach((t) => {
            update(`${t}.level`, MAX_LEVEL);
            update(`${t}.star`, 5);
            update(`${t}.uw`, 4);
            update(`${t}.uwLevel`, uwMaxLevelMap[4]);
            update(`${t}.affection`, Math.max(plan[t].affection, 50));
            update(`${t}.gear`, 2);
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
          (['current', 'target'] as const).forEach((t) => update(`${t}.affection`, Math.max(plan[t].affection, 50)));
        }
      },
      onFullReset: () => {
        if (section === 'stats') {
          ['current', 'target'].forEach((t) => {
            update(`${t}.level`, 1);
            update(`${t}.star`, studentInfo?.StarGrade || 1);
            update(`${t}.uw`, 0);
            update(`${t}.uwLevel`, 1);
            update(`${t}.affection`, 1);
            update(`${t}.gear`, 0);
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

  const UNLOCK_LEVELS = [1, 10, 20];

  const warnings = {
    // Equipment: Case where tier exists but level is insufficient for either (Target OR Current)
    equipment:
      plan.target.equipment.some((tier, i) => {
        const requiredLvl = UNLOCK_LEVELS[i] ?? 1;
        return tier > 0 && plan.target.level < requiredLvl;
      }) ||
      plan.current.equipment.some((tier, i) => {
        const requiredLvl = UNLOCK_LEVELS[i] ?? 1;
        return tier > 0 && plan.current.level < requiredLvl;
      }),

    // Potential: Case where potential is allocated but (level < 90 OR unique weapon missing) for either (Target OR Current)
    potential:
      ((plan.target.level < 90 || plan.target.uw === 0) && Object.values(plan.target.potential).some((v) => v > 0)) ||
      ((plan.current.level < 90 || plan.current.uw === 0) && Object.values(plan.current.potential).some((v) => v > 0)),
  };

  const formatSkill = (val: number, max: number) => (val === max ? 'M' : val);
  const summaries = {
    stats: {
      // Return JSX instead of a string
      cur: (
        <div className="flex items-center gap-1.5">
          <span>Lv.{plan.current.level}</span>
          <span className="text-neutral-300 dark:text-neutral-450">/</span>
          <div className="-mt-0.5">
            <StarRating n={getStarValue(plan.current.star, plan.current.uw)} />
          </div>
        </div>
      ),
      tar: (
        <div className="flex items-center gap-1.5">
          <span>Lv.{plan.target.level}</span>
          <span className="text-neutral-300 dark:text-neutral-450">/</span>
          <div className="-mt-0.5">
            <StarRating n={getStarValue(plan.target.star, plan.target.uw)} />
          </div>
        </div>
      ),
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
        .filter(([, details]) => details.Planable != false)
        .map(([id, details]) => ({ id: Number(id), name: `${Number(id) > 10000 ? `[${t('game:rerun')}] ` : ''}${details.Kr}` }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const filteredEvents = useMemo(
    () => sortedEvents.filter((e) => !plan.includedInEvents.includes(e.id) && e.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [searchTerm, sortedEvents, plan.includedInEvents],
  );

  const bulletColor = studentInfo?.BulletType ? { Explosion: '#b62915', Pierce: '#bc8800', Mystic: '#206d9b', Sonic: '#9a46a8', Chemical: '#137973' }[studentInfo.BulletType] : '#e5e7eb';

  // --- Global Actions Configuration ---
  const globalActions = [
    {
      action: 'min' as const,
      icon: <FiChevronsDown size={14} />,
      label: t('growthCard.btnMinAll', 'Min All'),
      desc: t('growthCard.tooltipMinAll'),
      colorClass: 'text-neutral-600 bg-neutral-50 hover:bg-neutral-100 border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300',
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
    <div className="flex flex-col bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden transition-all duration-200">
      {/* 1. macOS Style Top Header (Compact) */}
      <div className="relative">
        {/* Top accent border: uses the provided bulletColor */}
        <div className="absolute top-0 left-0 right-0 h-0.75 z-10" style={{ backgroundColor: bulletColor || '#3b82f6' }} />

        <div className="flex items-center justify-between px-3 pt-3 pb-2 bg-neutral-50/50 dark:bg-neutral-800/30">
          {/* Left: macOS Signal Colors with Permanent Icons */}
          <div className="flex items-center gap-2">
            {/* Delete Button (Yellow/Amber) */}
            <button
              onClick={() => {
                // if (confirm(t('common.confirmRemove')))
                removePlan(plan.uuid);
              }}
              className="w-5 h-5 rounded-full bg-[#FF5F57] hover:bg-[#FF5F57]/80 flex items-center justify-center text-white transition-colors "
              title={t('common.remove')}
            >
              <FiTrash2 size={11} strokeWidth={2.5} />
            </button>
            {/* Close Button (Red) */}
            <button onClick={onClose} className="w-5 h-5 rounded-full bg-[#FEBC2E] hover:bg-[#FEBC2E]/80 flex items-center justify-center text-[#926600] transition-colors " title={t_ui('close')}>
              <FiX size={11} strokeWidth={2.5} />
            </button>
          </div>

          {/* Right: Cost Hint Toggle + Student ID */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCostHints((v) => !v)}
              title={showCostHints ? t('growthCard.hideCostHints', 'Hide cost hints') : t('growthCard.showCostHints', 'Show cost hints')}
              className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                showCostHints ? 'bg-blue-100 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500'
              }`}
            >
              <FiDollarSign size={11} />
            </button>
            {plan.studentId && <div className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-200/50 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400">ID: {plan.studentId}</div>}
          </div>
        </div>
      </div>

      {/* 2. Main Content Area (Dropdown focused) */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-4">
          {/* Portrait: Keep portrait image small to save space */}
          <div className="shrink-0">
            {plan.studentId && studentPortraits[plan.studentId] ? (
              <div className="w-10 h-10 rounded-full object-cover ring-2 ring-neutral-50 dark:ring-neutral-800 shrink-0 overflow-hidden" style={{ backgroundColor: bulletColor || '#f3f4f6' }}>
                <img src={`data:image/webp;base64,${studentPortraits[plan.studentId]}`} className="w-full h-full object-cover" alt="" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
            )}
          </div>

          {/* Student Search Dropdown: Secure maximum horizontal width */}
          <div className="flex-1 min-w-0 text-xs">
            <StudentSearchDropdown
              students={allStudents}
              selectedStudentId={plan.studentId}
              setSelectedStudentId={(id) => {
                updatePlan(plan.uuid, 'studentId', id);
                const newStudent = allStudents[id];
                if (newStudent && !('Name' in (newStudent.Gear ?? {}))) {
                  updatePlan(plan.uuid, 'current.gear', 0);
                  updatePlan(plan.uuid, 'target.gear', 0);
                }
              }}
              hideLavel={true}
            />
          </div>
        </div>

        {/* 3. Global Actions Toolbar (Redesigned) */}

        {/* 3. Global Actions (Horizontal Split-Chips) */}
        {studentInfo && (
          <div className="mt-4 pt-3 border-t border-dashed border-neutral-100 dark:border-neutral-800">
            {/* Header Label */}
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{t('growthCard.globalActions', 'Quick Actions')}</span>
              {activeHelp && (
                <button onClick={() => setActiveHelp(null)} className="text-[10px] text-neutral-400 hover:text-neutral-600 underline decoration-dotted">
                  {t('common.closeHelp', 'Close Help')}
                </button>
              )}
            </div>

            {/* Buttons Row */}
            <div className="flex flex-wrap gap-2">
              {globalActions.map((btn) => {
                const isActive = activeHelp === btn.action;

                return (
                  <div
                    key={btn.action}
                    className={`
                      inline-flex items-center rounded-md border transition-all duration-200
                      ${
                        isActive
                          ? 'border-blue-300 ring-1 ring-blue-300/50 bg-blue-50/30 dark:border-blue-700 dark:bg-blue-900/20'
                          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800'
                      }
                    `}
                  >
                    {/* Action Part (Left) */}
                    <button
                      onClick={() => handleGlobalAction(btn.action)}
                      className={`
                        flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-l-md hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors
                     
                          text-neutral-600 dark:text-neutral-300
                        
                      `}
                    >
                      {btn.icon}
                      <span>{btn.label}</span>
                    </button>

                    {/* Separator */}
                    <div className="w-px h-3.5 bg-neutral-200 dark:bg-neutral-700" />

                    {/* Help Part (Right) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveHelp(isActive ? null : btn.action);
                      }}
                      className={`
                        px-1.5 py-1.5 transition-colors text-neutral-400 hover:text-blue-500 cursor-help
                        ${isActive ? 'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-200' : 'hover:bg-neutral-50 dark:hover:bg-neutral-700'}
                      `}
                      title={btn.desc}
                    >
                      <FiHelpCircle size={13} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Description Panel (Shows only when activeHelp is set) */}
            {activeHelp && (
              <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-700/50 rounded-md p-2.5 animate-in fade-in slide-in-from-top-1 duration-200 flex gap-2 items-start">
                <FiInfo className="shrink-0 mt-0.5 text-blue-500" size={14} />
                <div>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200 mr-1">{globalActions.find((a) => a.action === activeHelp)?.label}:</span>
                  <span className="leading-relaxed opacity-90">{globalActions.find((a) => a.action === activeHelp)?.desc}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Content: Scrollable Area */}
      <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-neutral-50 dark:divide-neutral-800 bg-white dark:bg-neutral-900 custom-scrollbar border-t border-neutral-100 dark:border-neutral-800">
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
                iconData={showCostHints ? iconData : undefined}
                eventData={showCostHints ? eventData : undefined}
              />
            </GrowthAccordion>
            <GrowthAccordion
              title={t('game:skills')}
              isOpen={openSections.skills}
              onToggle={() => setOpenSections((p) => ({ ...p, skills: !p.skills }))}
              currentSummary={summaries.skills.cur}
              targetSummary={summaries.skills.tar}
              {...generateActions('skills')}
            >
              <SkillsTab plan={plan} studentInfo={studentInfo} handlePlanChange={handlePlanChange} iconData={showCostHints ? iconData : undefined} eventData={showCostHints ? eventData : undefined} />
            </GrowthAccordion>

            <GrowthAccordion
              title={t('game:equipment')}
              isOpen={openSections.equipment}
              onToggle={() => setOpenSections((p) => ({ ...p, equipment: !p.equipment }))}
              currentSummary={summaries.eq.cur}
              targetSummary={summaries.eq.tar}
              {...generateActions('equipment')}
              isWarning={warnings.equipment}
              warningText={t('equipmentTab.levelLockWarning')}
            >
              <EquipmentTab plan={plan} studentInfo={studentInfo} handleBatchUpdate={handleBatchUpdate} iconData={iconData} eventData={showCostHints ? eventData : undefined} />
            </GrowthAccordion>

            <GrowthAccordion
              title={t('game:potential')}
              isOpen={openSections.potential}
              onToggle={() => setOpenSections((p) => ({ ...p, potential: !p.potential }))}
              currentSummary={summaries.pot.cur}
              targetSummary={summaries.pot.tar}
              {...generateActions('potential')}
              isWarning={warnings.potential}
              warningText={t('potentialTab.unlockCondition')}
            >
              <PotentialTab
                plan={plan}
                handleBatchUpdate={handleBatchUpdate}
                iconData={showCostHints ? iconData : undefined}
                eventData={showCostHints ? eventData : undefined}
                studentInfo={studentInfo}
              />
            </GrowthAccordion>

            <GrowthAccordion
              title={t('game:affection')}
              isOpen={openSections.affection}
              onToggle={() => setOpenSections((p) => ({ ...p, affection: !p.affection }))}
              currentSummary={`Rank ${plan.current.affection}`}
              targetSummary={`Rank ${plan.target.affection}`}
              {...generateActions('affection')}
            >
              {eventData?.icons.Item && iconData ? (
                <AffectionTab
                  plan={plan}
                  giftAffectionList={giftAffectionList}
                  eventData={eventData}
                  iconData={iconData}
                  handlePlanChange={handlePlanChange}
                  allStudents={allStudents}
                  studentPortraits={studentPortraits}
                />
              ) : (
                <div className="p-6 text-center text-xs text-neutral-400">Loading Affection Data...</div>
              )}
            </GrowthAccordion>

            {plan.studentId != null &&
              (() => {
                const studentId = plan.studentId;
                const allGoals = targetGoals[studentId] ?? [];
                const finalGoal = allGoals.find((g) => g.id === 'final');
                const goals = allGoals.filter((g) => g.id !== 'final');
                const minStar = toSV(plan.current.star, plan.current.uw);
                const targetSV = toSV(plan.target.star, plan.target.uw);
                const visibleSVs = ALL_STAR_VALUES_CARD.filter((n) => n >= minStar && n <= targetSV);
                const starBtnCls = (active: boolean) =>
                  `p-0.5 rounded transition-colors ${active ? 'bg-neutral-200 dark:bg-neutral-700 ring-1 ring-amber-400' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`;
                const sortedGoals = [...goals].sort((a, b) => {
                  const dA = a.date ?? contentItems.find((c) => c.id === a.contentRef?.id)?.date ?? '';
                  const dB = b.date ?? contentItems.find((c) => c.id === b.contentRef?.id)?.date ?? '';
                  return dA.localeCompare(dB);
                });

                return (
                  <GrowthAccordion
                    title="Targets"
                    isOpen={openSections.targets}
                    onToggle={() => setOpenSections((p) => ({ ...p, targets: !p.targets }))}
                    currentSummary={`${goals.length} mid · ${finalGoal ? '1' : '0'} final`}
                    targetSummary=""
                    onTargetMax={() => {}}
                    onResetTarget={() => {}}
                    onFullMax={() => {}}
                    onFullReset={() => {}}
                  >
                    <div className="space-y-2 p-3">
                      {/* Final Goal */}
                      <div className="space-y-1.5 pb-2 border-b border-neutral-100 dark:border-neutral-800">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 w-16 shrink-0">Final Goal</span>
                          <div className="flex flex-wrap gap-0.5">
                            {visibleSVs.map((n) => (
                              <button
                                key={n}
                                onClick={() => {
                                  const { star, uw } = fromSV(n);
                                  updatePlan(plan.uuid, 'target.star', star);
                                  updatePlan(plan.uuid, 'target.uw', uw);
                                }}
                                className={starBtnCls(toSV(plan.target.star, plan.target.uw) === n)}
                              >
                                <StarRating n={n} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <FinalGoalDeadlineRowCard
                          schedule={finalGoal}
                          contentItems={contentItems}
                          onChange={(s) => setFinalGoal(studentId, s ? { targetStar: plan.target.star, targetUw: plan.target.uw, ...s } : null)}
                        />
                      </div>
                      {/* Intermediate Goals */}
                      <p className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium pt-1">Intermediate Goals</p>
                      {sortedGoals.length === 0 && !showTargetPending && <p className="text-[11px] text-neutral-400 dark:text-neutral-500 italic">No intermediate goals yet.</p>}

                      {(sortedGoals.length > 0 || showTargetPending) && (
                        <div className="relative">
                          <div className="absolute left-2.5 top-2 bottom-2 w-px bg-neutral-200 dark:bg-neutral-700" />
                          {sortedGoals.map((goal) => (
                            <div key={goal.id} className="flex mb-2.5">
                              <div className="w-5 shrink-0 flex justify-center pt-1.5 relative z-10">
                                <div className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-neutral-500 ring-2 ring-white dark:ring-neutral-900" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <GoalRowCard
                                  goal={goal}
                                  visibleSVs={visibleSVs}
                                  contentItems={contentItems}
                                  starBtnCls={starBtnCls}
                                  onUpdate={(patch) => updateTargetGoal(studentId, goal.id, patch)}
                                  onRemove={() => removeTargetGoal(studentId, goal.id)}
                                />
                              </div>
                            </div>
                          ))}
                          {showTargetPending && (
                            <div className="flex">
                              <div className="w-5 shrink-0 flex justify-center pt-1.5 relative z-10">
                                <div className="w-2 h-2 rounded-full border-2 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <PendingGoalRowCard
                                  minStar={minStar}
                                  maxStar={targetSV}
                                  defaultStar={plan.target.star}
                                  defaultUw={plan.target.uw}
                                  contentItems={contentItems}
                                  starBtnCls={starBtnCls}
                                  onAdd={(goal) => {
                                    addTargetGoal(studentId, goal);
                                    setShowTargetPending(false);
                                  }}
                                  onCancel={() => setShowTargetPending(false)}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {!showTargetPending && (
                        <button
                          onClick={() => setShowTargetPending(true)}
                          className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        >
                          <FiPlus size={10} />
                          Add goal
                        </button>
                      )}
                    </div>
                  </GrowthAccordion>
                );
              })()}
          </>
        ) : (
          <div className="py-20 flex flex-col items-center justify-center text-neutral-400 opacity-60">
            <FiSearch size={32} className="mb-2" />
            <span className="text-sm font-light">{t('growthCard.selectStudentPrompt')}</span>
          </div>
        )}
      </div>

      {/* 3. Footer: Event Tags */}
      <div className="relative bg-neutral-50 dark:bg-neutral-950/50 border-t border-neutral-200 dark:border-neutral-800 p-2 z-10">
        <div className="mt-2 relative">
          <h4 className="font-bold text-xs text-neutral-400 uppercase tracking-wider ml-2 mb-2">{t('growthCard.includeInEventsQuestion')}</h4>
          <div className="relative group">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" size={14} />
            <input
              type="text"
              placeholder={t('growthCard.searchEvents', 'Add Event...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
            />
          </div>
          {isSearchFocused && searchTerm && filteredEvents.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50 animate-in slide-in-from-bottom-2 fade-in">
              {filteredEvents.map((e) => (
                <button
                  key={e.id}
                  onMouseDown={() => {
                    toggleEventInclusion(plan.uuid, e.id);
                    setSearchTerm('');
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-700 border-b border-neutral-50 dark:border-neutral-700/50 last:border-0 truncate transition-colors flex items-center gap-2"
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
              className="inline-flex items-center gap-1.5 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 rounded-full text-[11px] shadow-sm"
            >
              <span className="truncate max-w-30">{sortedEvents.find((e) => e.id === id)?.name || id}</span>
              <button onClick={() => toggleEventInclusion(plan.uuid, id)} className="text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full p-0.5 transition-colors">
                <FiX size={10} />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
