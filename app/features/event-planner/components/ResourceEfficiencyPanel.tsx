// app/components/planner/ResourceEfficiencyPanel.tsx
import { Fragment, type ReactNode, useMemo, useRef, useState, useEffect, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from 'recharts';
import HelpTooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { HiOutlineQuestionMarkCircle } from 'react-icons/hi2';
import type { EventData, IconData, StudentData } from '~/types/plannerData';
import type { MainTabId } from './mainTab';
import { ItemIcon } from '../../../components/item/Icon';
import { NumberInput } from '../../../components/common/NumberInput';
import { SimRunButton } from './SimRunButton';
import { resolveLabel } from '../../../utils/locale';
import { useSearchMatcher } from '~/hooks/useSearchMatcher';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { resolveApConfig } from '~/utils/ApCalculatorConfig';
import { buildApTimeline, computeDailyAp, dateReachingAp } from '../logic/apDaily';
import { getFreeStudentID } from '../logic/getFreeStudentId';
import { computeJointChart, solveChartRange, type JointChartRequest } from '../logic/jointChart';
import { useJointChart } from '../useJointChart';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';
import type { JointStep } from '~/features/event-planner/logic/jointPlan';
import {
  buildResourceApIndex,
  buildCumulativeCurve,
  computeSimulatedSources,
  type SimulatedSources,
  computeShopGoalConsumption,
  getEventDurationDays,
  hasSimulatedResourceSource,
  type StageWithType,
  type ApSegment,
  type SourceLabelKey,
  type FarmingPlanEntry,
} from '~/features/event-planner/logic/resourceApCost';
import { ApFlowSankeyChart } from './ApFlowSankeyChart';
import type { TotalBonusMap } from '../types';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { calcElephNeeded } from '~/utils/elephEligmaCalc';
import { StarRating } from '~/components/student/StarRating';
import { getStarValue } from '~/utils/raid/report';
import { starGrowthCost, uwGrowthCost } from '~/data/growthData';
import { runAsync } from '~/utils/runAsync';

function EfficiencyHelp({ label, showLabel = false, children }: { label: string; showLabel?: boolean; children: ReactNode }) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVisible(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  return (
    <HelpTooltip
      id={id}
      placement="bottomRight"
      trigger={['hover', 'click']}
      visible={visible}
      onVisibleChange={setVisible}
      mouseLeaveDelay={0.2}
      styles={{ body: { boxShadow: 'none', minHeight: 'auto' } }}
      overlay={
        <div
          className="w-64 text-xs leading-relaxed"
          style={{ maxWidth: 'calc(100vw - 32px)' }}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest('button, a')) setVisible(false);
          }}
        >
          {children}
        </div>
      }
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={visible ? id : undefined}
        aria-expanded={visible}
        className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        {showLabel && label}
        <HiOutlineQuestionMarkCircle className="h-4 w-4" aria-hidden="true" />
      </button>
    </HelpTooltip>
  );
}

// Rough estimate of a well-invested player's daily AP income (natural regen + dailies + monthly pass) —
// used only as a floor for how far right the graph extends when the player hasn't entered their own AP supply.
const ESTIMATED_AP_PER_DAY = 1700;

interface FarmingPlanGroup {
  category: 'stage' | 'story';
  fromLabel: string;
  toLabel: string;
  repeatsForever: boolean;
}

// Collapses per-stage entries into ranges; ongoing repeat target stays separate.
function groupFarmingPlan(entries: FarmingPlanEntry[]): FarmingPlanGroup[] {
  const groups: FarmingPlanGroup[] = [];
  for (const e of entries) {
    const num = Number(e.stageNumber);
    const last = groups[groups.length - 1];
    if (last && !last.repeatsForever && !e.repeatsForever && last.category === e.category && num === Number(last.toLabel) + 1) {
      last.toLabel = e.stageNumber;
    } else {
      groups.push({ category: e.category, fromLabel: e.stageNumber, toLabel: e.stageNumber, repeatsForever: e.repeatsForever });
    }
  }
  return groups;
}

// Module-level cache (survives mount/unmount) — keyed by eventId + totalBonus value snapshot, not reference.
const simSourcesCache = new Map<number, { inputsKey: string; sources: SimulatedSources }>();

interface ResourceEfficiencyPanelProps {
  eventId: number;
  eventData: EventData;
  allStages: StageWithType[];
  iconData: IconData;
  allStudents: StudentData;
  availableAp: number;
  totalBonus: TotalBonusMap;
  onNavigateToTab?: (tabId: MainTabId) => void;
}

function renderSourceLabel(label: SourceLabelKey, t: ReturnType<typeof useTranslation>['t'], resourceName: (key: string) => string): string {
  return label.parts
    .map((part) => {
      if (part.type === 'resource') return resourceName(part.value);
      if (part.type === 'key') return t(part.value, label.params ?? {});
      return part.value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(label.params?.[key] ?? ''));
    })
    .join('');
}

// Format axis tick as compact label; keep 2 significant digits (e.g. 1.0k, 12.5k, 2M).
// Fills for the stage bands under the chart; each farmed stage gets its own.
const STAGE_BAND_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];
const STAGE_BAND_NEUTRAL = '#808080';

// "2026-01-02" -> "01/02"
function formatMonthDay(date: string): string {
  return date.slice(5).replace('-', '/');
}

function formatAxisTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const scaled = value / 1_000_000;
    return `${scaled.toFixed(Math.abs(scaled) < 10 ? 1 : 0)}M`;
  }
  if (abs >= 1_000) {
    const scaled = value / 1_000;
    return `${scaled.toFixed(Math.abs(scaled) < 10 ? 1 : 0)}k`;
  }
  return value.toLocaleString();
}

export const ResourceEfficiencyPanel = ({ eventId, eventData, allStages, iconData, allStudents, availableAp, totalBonus, onNavigateToTab }: ResourceEfficiencyPanelProps) => {
  const { t, i18n } = useTranslation(['planner', 'game']);
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;
  const matcher = useSearchMatcher(locale);
  const [search, setSearch] = useState('');
  const [chartWidth, setChartWidth] = useState(320);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Dice race routing (which tile a fixed die targets) reuses whatever the calculator tab already has
  // saved for this event — same rule as every other plan-independent "efficiency" dimension here: the raw
  // field only (undefined when unset), never the hook's DefaultDiceRaceSimConfig-filled convenience value,
  // and never targetLap/endConditionType (those stay plan-specific, see Ctx.diceRaceRouting).
  const { plan, clearedStages, setClearedStages } = usePlanForEvent(eventId);
  const clearedSet = useMemo(
    () =>
      new Set(
        Object.entries(clearedStages)
          .filter(([, done]) => done)
          .map(([id]) => id),
      ),
    [clearedStages],
  );
  const diceRaceRouting = useMemo(
    () =>
      plan.diceRaceSimConfig
        ? {
            fixedDicePriority: plan.diceRaceSimConfig.fixedDicePriority,
            ownedFixedDice: plan.diceRaceSimConfig.ownedFixedDice,
            allowDoubleFixedDice: plan.diceRaceSimConfig.allowDoubleFixedDice ?? false,
          }
        : undefined,
    [plan.diceRaceSimConfig],
  );

  // Simulations opt-in (expensive). Computed in click handler to avoid StrictMode double-invoke. Cache key
  // covers every input the simulated extractors read (totalBonus + dice race routing) so a stale result is
  // never served for different inputs.
  // Purchase counts set in the shop tab are applied whenever there are any.
  const hasShopGoals = useMemo(() => Object.values(plan.purchaseCounts ?? {}).some((n) => n > 0), [plan.purchaseCounts]);
  const [applyShopChoice, setApplyShopGoals] = useState(true);
  const applyShopGoals = hasShopGoals && applyShopChoice;
  // Events without a distributed student default to ending the chart at the shop goals; an explicit choice wins.
  const [stopChoice, setStopAtGoals] = useState<boolean | null>(null);
  const stopAtGoals = stopChoice ?? getFreeStudentID(eventData) === undefined;
  // Story clears are not an in-game gate for area stages; opt in to count their AP as part of the prerequisites.
  const [highAreaFirst, setHighAreaFirst] = useState(false);
  const shopGoals = useMemo(
    () => (applyShopGoals ? { purchaseCounts: plan.purchaseCounts ?? {}, alreadyPurchasedCounts: plan.alreadyPurchasedCounts ?? {} } : undefined),
    [applyShopGoals, plan.purchaseCounts, plan.alreadyPurchasedCounts],
  );
  // Currency the plan's shop purchases would spend, shown next to the toggle whether or not it is applied.
  const plannedShopSpend = useMemo(
    () =>
      Object.entries(computeShopGoalConsumption(eventData, { purchaseCounts: plan.purchaseCounts ?? {}, alreadyPurchasedCounts: plan.alreadyPurchasedCounts ?? {} })).filter(
        ([, amount]) => amount > 0,
      ),
    [eventData, plan.purchaseCounts, plan.alreadyPurchasedCounts],
  );
  const simInputsKey = useMemo(() => JSON.stringify({ totalBonus, diceRaceRouting }), [totalBonus, diceRaceRouting]);
  const [simSources, setSimSources] = useState<SimulatedSources | null>(() => {
    const cached = simSourcesCache.get(eventId);
    return cached && cached.inputsKey === simInputsKey ? cached.sources : null;
  });
  // Inputs the current simIndex was actually computed for — lets the effect below tell "still valid" apart
  // from "inputs changed since the last calculation" without re-running on every unrelated render. Also
  // doubles as "the latest requested key" so a late-resolving calculation for stale inputs (e.g. the user
  // flips to the dice race calculator tab and changes the strategy while a calculation is in flight) never
  // overwrites a newer one.
  const simIndexComputedForRef = useRef<string | null>(simSources ? simInputsKey : null);
  const [isCalculatingSimulations, setIsCalculatingSimulations] = useState(false);
  const canIncludeSimulations = useMemo(() => hasSimulatedResourceSource(eventData), [eventData]);
  const handleIncludeSimulations = useCallback(() => {
    const requestedKey = simInputsKey;
    simIndexComputedForRef.current = `pending:${requestedKey}`;
    setIsCalculatingSimulations(true);
    void runAsync(() => computeSimulatedSources({ allStages, eventData, eventId, totalBonus, includeSimulations: true, diceRaceRouting }))
      .then((sources) => {
        if (simIndexComputedForRef.current !== `pending:${requestedKey}`) return; // superseded by a newer request
        simSourcesCache.set(eventId, { inputsKey: requestedKey, sources });
        simIndexComputedForRef.current = requestedKey;
        setSimSources(sources);
      })
      .finally(() => setIsCalculatingSimulations(false));
  }, [allStages, eventData, eventId, totalBonus, diceRaceRouting, simInputsKey]);
  // e.g. the user changes the dice race calculator tab's fixed-die strategy after already calculating here
  // -- the cached simulated sources no longer reflects that, so drop it and prompt a recalculation instead of silently
  // showing stale numbers.
  useEffect(() => {
    if (simIndexComputedForRef.current !== null && simIndexComputedForRef.current !== simInputsKey) {
      setSimSources(null);
      simIndexComputedForRef.current = null;
    }
  }, [simInputsKey]);
  const includeSimulations = simSources !== null;
  // Only the cheap non-simulated sources (e.g. shop goals) are rebuilt when plan inputs change.
  const simIndex = useMemo(
    () =>
      simSources
        ? buildResourceApIndex({
            allStages,
            eventData,
            eventId,
            totalBonus,
            includeSimulations: true,
            diceRaceRouting,
            shopGoals,
            includeStoryClears: true,
            highAreaFirst,
            simulatedSources: simSources,
          })
        : null,
    [simSources, allStages, eventData, eventId, totalBonus, diceRaceRouting, shopGoals, highAreaFirst],
  );

  // Fast path safe as useMemo; simIndex takes over after opt-in.
  const fastIndex = useMemo(
    () => buildResourceApIndex({ allStages, eventData, eventId, totalBonus, includeSimulations: false, diceRaceRouting, shopGoals, includeStoryClears: true, highAreaFirst }),
    [allStages, eventData, eventId, totalBonus, diceRaceRouting, shopGoals, highAreaFirst],
  );
  const resourceApIndex = simIndex ?? fastIndex;
  const resourceKeys = resourceApIndex.resourceKeys;
  // Priority: 1) a farmable student Eleph, 2) Eligma (Item_23, next most broadly useful target) if this
  // event farms it, 3) one-time Character_id, 4) whatever's first.
  const defaultKey = useMemo(() => {
    const studentElephKey = resourceKeys.find((k) => {
      if (!k.startsWith('Item_')) return false;
      const id = Number(k.slice('Item_'.length));
      if (!allStudents[id]) return false;
      return resourceApIndex.resolveProfile(k).segments.length > 0;
    });
    if (studentElephKey) return studentElephKey;
    if (resourceKeys.includes('Item_23') && resourceApIndex.resolveProfile('Item_23').segments.length > 0) return 'Item_23';
    return resourceKeys.find((k) => k.startsWith('Character_')) ?? resourceKeys[0] ?? null;
  }, [resourceKeys, allStudents, resourceApIndex]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const activeKey = selectedKey ?? defaultKey;

  // Sankey diagram: trace AP flow (debug only, collapsed by default).
  const [showApFlow, setShowApFlow] = useState(false);
  const [apFlowTargetAmount, setApFlowTargetAmount] = useState(200);
  const apFlow = useMemo(() => {
    if (!showApFlow || !activeKey) return null;
    // Reuses resourceApIndex's already-extracted data (see ResourceApIndex.buildSankey) instead of running
    // extractAll a second time — with simulations included, a fresh extraction can take seconds.
    return resourceApIndex.buildSankey(activeKey, apFlowTargetAmount);
  }, [showApFlow, activeKey, resourceApIndex, apFlowTargetAmount]);

  // Farming plan: show which stages are needed and which is the repeat target.
  const farmingPlan = useMemo((): FarmingPlanEntry[] => {
    if (!activeKey) return [];
    return resourceApIndex.buildFarmingPlan(activeKey);
  }, [activeKey, resourceApIndex]);

  const searchResults = useMemo(() => {
    const q = search.trim();

    return resourceKeys
      .map((key) => ({ key, label: resolveLabel(key, eventData, allStudents, locale) }))
      .filter((r) => {
        if (!q || matcher(r.label, q)) return true;
        if (r.key.toLowerCase().includes(q.toLowerCase())) return true;
        // Match by student nicknames for Eleph/shard items.
        const sep = r.key.lastIndexOf('_');
        const id = Number(r.key.slice(sep + 1));
        const student = allStudents[id];
        return student?.SearchTags?.some((tag) => matcher(tag, q)) ?? false;
      });
  }, [search, resourceKeys, eventData, allStudents, locale, matcher]);

  const activeLabel = activeKey ? resolveLabel(activeKey, eventData, allStudents, locale) : null;
  const resourceName = useCallback((key: string) => resolveLabel(key, eventData, allStudents, locale), [eventData, allStudents, locale]);
  // Same text as renderSourceLabel, but a resource part (the currency of a shop) shows its icon instead of its name.
  const renderLabelNode = (label: SourceLabelKey): ReactNode =>
    label.parts.map((part, i) => {
      if (part.type !== 'resource') return renderSourceLabel({ parts: [part], params: label.params }, t, resourceName);
      return (
        <span key={i} className="mx-0.5 inline-flex translate-y-0.5 align-middle" title={resourceName(part.value)}>
          <ItemIcon
            type={part.value.slice(0, part.value.lastIndexOf('_'))}
            itemId={part.value.slice(part.value.lastIndexOf('_') + 1)}
            amount={0}
            size={5}
            eventData={eventData}
            iconData={iconData}
            allStudents={allStudents}
          />
        </span>
      );
    });

  const profile = useMemo(() => {
    if (!activeKey) return null;
    return resourceApIndex.resolveProfile(activeKey);
  }, [activeKey, resourceApIndex]);

  // Mark star/UW upgrade thresholds as horizontal lines for student Eleph.
  const { growthPlans, materialInventory: storedInventory, updateMaterialInventory } = useGlobalStore();
  // Owned-amount is global inventory; changes reflect elsewhere.
  const ownedAmount = activeKey ? (storedInventory[activeKey] ?? 0) : 0;
  // Unchecking hides the target's owned amount from every calculation without touching the stored inventory.
  const [includeOwned, setIncludeOwned] = useState(true);
  const materialInventory = useMemo(() => (includeOwned || !activeKey ? storedInventory : { ...storedInventory, [activeKey]: 0 }), [includeOwned, activeKey, storedInventory]);
  const effectiveOwned = includeOwned ? ownedAmount : 0;
  const isStudentEleph = activeKey?.startsWith('Item_') && !!allStudents[Number(activeKey.slice('Item_'.length))];
  const currentStudentStat = useMemo(() => {
    if (!isStudentEleph || !activeKey) return null;
    const studentId = Number(activeKey.slice('Item_'.length));
    const plan = growthPlans.find((p) => p.studentId === studentId);
    return { star: plan?.current.star ?? 1, uw: plan?.current.uw ?? 0 };
  }, [isStudentEleph, activeKey, growthPlans]);
  const elephStarLines = useMemo(() => {
    if (!isStudentEleph || !activeKey) return [];
    const studentId = Number(activeKey.slice('Item_'.length));
    const plan = growthPlans.find((p) => p.studentId === studentId);
    const currentStar = plan?.current.star ?? 1;
    const currentUw = plan?.current.uw ?? 0;
    // Global inventory takes precedence over growth plan snapshot.
    const currentEleph = materialInventory[activeKey] ?? plan?.current.eleph ?? 0;
    // Derive star/UW ceilings from cost tables, not hardcoded.
    const maxStar = Math.max(...Object.keys(starGrowthCost).map(Number));
    const maxUw = Math.max(...Object.keys(uwGrowthCost).map(Number));
    const starLines: { label: string; threshold: number }[] = [];
    for (let star = currentStar + 1; star <= maxStar; star++) {
      const threshold = calcElephNeeded(currentStar, star, currentUw, 0) - currentEleph;
      if (threshold > 0) starLines.push({ label: `${star}★`, threshold });
    }
    const uwLines: { label: string; threshold: number }[] = [];
    for (let uw = currentUw + 1; uw <= maxUw; uw++) {
      const threshold = calcElephNeeded(currentStar, maxStar, currentUw, uw) - currentEleph;
      if (threshold > 0) uwLines.push({ label: `${t('game:ue')}${uw}`, threshold });
    }
    // Drop redundant star label if UW threshold coincides.
    const uwThresholds = new Set(uwLines.map((l) => l.threshold));
    return [...starLines.filter((l) => !uwThresholds.has(l.threshold)), ...uwLines];
  }, [activeKey, isStudentEleph, growthPlans, materialInventory]);

  // Include one-time AP contributions in graph.
  const graphSegments = useMemo(() => {
    if (!profile) return [] as ApSegment[];
    const extra: ApSegment[] = profile.oneTimeContributions
      .filter((o) => o.apCost !== undefined && o.apCost > 0)
      .map((o) => ({ apCost: o.apCost as number, amount: o.amount, source: o.source, sourceLabel: o.sourceLabel, prefixClears: o.prefixClears }));
    return [...profile.segments, ...extra].sort((a, b) => b.amount / b.apCost - a.amount / a.apCost);
  }, [profile]);

  // Free contributions + owned amount form baseline.
  const freeBaseline = useMemo(() => (profile?.oneTimeContributions.filter((o) => o.apCost === undefined).reduce((a, o) => a + o.amount, 0) ?? 0) + effectiveOwned, [profile, effectiveOwned]);

  // Graph width: max of event duration or player's AP supply.
  const baseMaxAp = useMemo(() => {
    const finiteCost = graphSegments.filter((s) => !s.repeatsForever).reduce((a, s) => a + s.apCost, 0);
    const eventWindowAp = getEventDurationDays({ allStages, eventData, eventId }) * ESTIMATED_AP_PER_DAY;
    return Math.max(eventWindowAp, availableAp, finiteCost * 1.2, 1000);
  }, [graphSegments, availableAp, allStages, eventData, eventId]);

  // Day-by-day AP supply from the calculator tab's saved settings, used to date points on the AP axis.
  const apTimeline = useMemo(() => {
    const config = resolveApConfig(plan.apConfig, eventData.season.EventContentOpenTime, eventData.season.EventContentCloseTime || eventData.season.ExtensionTime);
    return buildApTimeline(computeDailyAp(config), config.bonusAp);
  }, [plan.apConfig, eventData.season]);

  // Shop goals and cleared stages change which stages must be paid for, which only the joint model handles. It is the slow
  // part, so it is solved in a web worker; everything else is cheap and stays inline.
  const jointMode = ((shopGoals && hasShopGoals) || clearedSet.size > 0) && !!activeKey;
  const elephThresholds = useMemo(() => elephStarLines.map((l) => l.threshold), [elephStarLines]);
  // clearedSet is rebuilt on every render, so the request is keyed by its content to keep the worker effect from re-firing.
  const clearedKey = JSON.stringify([...clearedSet].sort());
  const jointRequest = useMemo<JointChartRequest | null>(
    () =>
      jointMode && activeKey ? { activeKey, inventory: materialInventory, cleared: JSON.parse(clearedKey) as string[], stopAtGoals: stopAtGoals && applyShopGoals, baseMaxAp, elephThresholds } : null,
    [jointMode, activeKey, materialInventory, clearedKey, stopAtGoals, applyShopGoals, baseMaxAp, elephThresholds],
  );
  // totalBonus and diceRaceRouting are rebuilt by parents with equal content; key them by content so the worker index is not rebuilt.
  const stableSimInputs = useMemo(() => JSON.parse(simInputsKey) as { totalBonus: TotalBonusMap; diceRaceRouting: typeof diceRaceRouting }, [simInputsKey]);
  const jointCtx = useMemo(
    () => ({
      allStages,
      eventData,
      eventId,
      totalBonus: stableSimInputs.totalBonus,
      includeSimulations: simSources !== null,
      diceRaceRouting: stableSimInputs.diceRaceRouting,
      shopGoals,
      includeStoryClears: true,
      highAreaFirst,
      simulatedSources: simSources ?? undefined,
    }),
    [allStages, eventData, eventId, stableSimInputs, shopGoals, highAreaFirst, simSources],
  );
  const remote = useJointChart(jointMode, jointCtx, jointRequest);
  // Main-thread fallback for when the worker cannot run.
  const fallback = useMemo(() => (remote.failed && jointRequest ? computeJointChart(resourceApIndex, jointRequest) : null), [remote.failed, jointRequest, resourceApIndex]);
  const jointChart = jointMode ? (fallback ?? remote.result) : null;
  const chartPending = jointMode && !fallback && remote.pending;
  // Dim the chart only when a solve is actually slow; a fast one would flash on every setting change.
  const [chartDimmed, setChartDimmed] = useState(false);
  useEffect(() => {
    if (!chartPending) {
      setChartDimmed(false);
      return;
    }
    const timer = setTimeout(() => setChartDimmed(true), 300);
    return () => clearTimeout(timer);
  }, [chartPending]);

  // Without goals or cleared stages the curve is a plain cumulative sum.
  const localChart = useMemo(() => {
    if (jointMode) return null;
    const build = (ap: number) => {
      const areas: { from: number; to: number }[] = [];
      if (graphSegments.length === 0) return { curve: [], areas };
      const base = buildCumulativeCurve(graphSegments, ap, (seg, from, to) => {
        if ((seg.source.type === 'shop_tier' || seg.source.type === 'shop_flat_limit') && seg.source.goal && to > from) areas.push({ from, to });
      });
      return { curve: freeBaseline > 0 ? base.map((p) => ({ ...p, amount: p.amount + freeBaseline })) : base, areas };
    };
    return solveChartRange(build, baseMaxAp, elephThresholds);
  }, [jointMode, graphSegments, baseMaxAp, freeBaseline, elephThresholds]);
  const localPlan = useMemo(
    () => (!jointMode && activeKey ? resourceApIndex.buildJointGoalPlan(activeKey, materialInventory, clearedSet, false) : null),
    [jointMode, activeKey, resourceApIndex, materialInventory, clearedSet],
  );

  const jointPlan = jointMode ? (jointChart?.plan ?? null) : localPlan;
  // With the option on, the chart ends where the last shop goal is bought.
  const stopAp = jointChart?.stopAp ?? null;
  const curve = jointChart?.curve ?? localChart?.curve ?? [];
  const goalAreas = localChart?.areas ?? [];
  const maxAp = jointChart?.maxAp ?? localChart?.maxAp ?? baseMaxAp;
  // The open-ended rate includes the exchanges fed by the final farming loop, without one-time rewards or inventory.
  const finalTargetPerAp = jointPlan?.steps.find((step) => step.forever && step.targetPerAp !== undefined)?.targetPerAp;
  const finalRepeatEfficiency =
    !(stopAtGoals && applyShopGoals) && finalTargetPerAp !== undefined && Number.isFinite(finalTargetPerAp)
      ? activeKey === 'Currency_1'
        ? t('ui.resourceEfficiencyCreditsPerAp', { credits: Math.round(finalTargetPerAp).toLocaleString(locale) })
        : t('ui.resourceEfficiencyApPerItem', {
            ap: finalTargetPerAp > 0 ? (1 / finalTargetPerAp).toLocaleString(locale, { maximumFractionDigits: 2 }) : '∞',
          })
      : null;

  // Credits read as credits per AP, everything else as AP per item.
  const formatUnitRate = (amount: number, apCost: number) =>
    activeKey === 'Currency_1'
      ? t('ui.resourceEfficiencyCreditsPerAp', { credits: apCost > 0 ? Math.round(amount / apCost).toLocaleString(locale) : '∞' })
      : t('ui.resourceEfficiencyApPerItem', { ap: (apCost / amount).toFixed(2) });

  // Shop purchases sitting next to each other in the plan collapse into one row per payment currency.
  const planRows = useMemo(() => {
    const rows: { step: JointStep; purchases?: number; costKey?: string; clears?: JointStep[] }[] = [];
    if (!jointPlan) return rows;
    let runStart = 0;
    for (const step of jointPlan.steps) {
      if (step.kind !== 'goal') {
        rows.push({ step });
        runStart = rows.length;
        continue;
      }
      const label = step.ref !== undefined ? jointPlan.labels[step.ref] : undefined;
      const source = label?.source;
      const range = source && (source.type === 'shop_tier' || source.type === 'shop_flat_limit') ? source.goal : undefined;
      const purchases = (range ? range.to - range.from + 1 : 1) * step.count;
      const index = rows.findIndex((row, i) => i >= runStart && row.costKey === label?.costKey);
      if (index >= 0) rows[index] = { ...rows[index], step: { ...rows[index].step, apEnd: step.apEnd }, purchases: (rows[index].purchases ?? 0) + purchases };
      else rows.push({ step: { ...step, ap: 0 }, purchases, costKey: label?.costKey });
    }
    // Order by completion: purchases can occur during a farming interval.
    rows.sort((a, b) => a.step.apEnd - b.step.apEnd);
    const grouped: typeof rows = [];
    for (const row of rows) {
      const previous = grouped[grouped.length - 1];
      if (row.step.kind === 'clear' && previous?.step.kind === 'clear') {
        previous.clears = [...(previous.clears ?? [previous.step]), row.step];
        previous.step = { ...previous.step, ap: previous.step.ap + row.step.ap, apEnd: row.step.apEnd };
      } else {
        grouped.push({ ...row });
      }
    }
    return grouped;
  }, [jointPlan]);
  // Bands along the AP axis for the stage farmed there, one color per stage; clears merge into one neutral band.
  const stageBands = useMemo(() => {
    if (!jointPlan) return [];
    const bands: { from: number; to: number; text?: string; count: number; color: string }[] = [];
    const colors = new Map<string, string>();
    for (const { step, purchases } of planRows) {
      if (purchases !== undefined || (!step.forever && step.ap < 0.5)) continue;
      // Open-ended steps that begin past the chart, and repeats that round to zero runs, would only add noise.
      if (step.kind !== 'clear' && (step.forever ? step.apStart >= maxAp || (step.runAp ?? 0) < 0.5 : Math.round(step.count) === 0)) continue;
      const to = step.forever ? maxAp : step.apEnd;
      if (step.kind === 'clear') {
        const last = bands[bands.length - 1];
        if (last && last.text === undefined) last.to = to;
        else bands.push({ from: step.apStart, to, count: 1, color: STAGE_BAND_NEUTRAL });
        continue;
      }
      const label = step.ref !== undefined ? jointPlan.labels[step.ref] : undefined;
      const text = label ? renderSourceLabel(label.sourceLabel, t, resourceName) : undefined;
      if (text !== undefined && !colors.has(text)) colors.set(text, STAGE_BAND_COLORS[colors.size % STAGE_BAND_COLORS.length]);
      bands.push({ from: step.apStart, to, text, count: step.count, color: (text !== undefined && colors.get(text)) || STAGE_BAND_NEUTRAL });
    }
    return bands;
  }, [planRows, jointPlan, maxAp, t, resourceName]);
  // Curve value at the owned AP (linear between neighbouring samples).
  const ownedApAmount = useMemo(() => {
    if (availableAp <= 0) return null;
    const pts = curve.filter((p): p is typeof p & { amount: number } => p.amount !== null);
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].ap >= availableAp && pts[i].ap > pts[i - 1].ap) {
        const f = (availableAp - pts[i - 1].ap) / (pts[i].ap - pts[i - 1].ap);
        return pts[i - 1].amount + f * (pts[i].amount - pts[i - 1].amount);
      }
    }
    return null;
  }, [curve, availableAp]);
  // Right edge of the chart; the stage strip under it is scaled to the same range.
  const chartMaxAp = stopAp ?? Math.max(1, ...curve.map((p) => p.ap));
  // With an auto Y range the visible span can be narrow (e.g. 12,000-12,100); compact "12k" ticks would then all read the same.
  const yTickFormatter = useMemo(() => {
    const values = curve.flatMap((p) => (p.amount === null ? [] : [p.amount]));
    const span = values.length > 0 ? Math.max(...values) - Math.min(...values) : Infinity;
    return span < 1_000 ? (v: number) => Math.round(v).toLocaleString() : formatAxisTick;
  }, [curve]);
  // Cut the curve at the right edge with an interpolated end point so the line reaches it instead of stopping at the last sample.
  const chartCurve = useMemo(() => {
    if (stopAp === null) return curve;
    const inside = curve.filter((p) => p.ap <= stopAp);
    const next = curve.find((p) => p.ap > stopAp);
    const last = inside[inside.length - 1];
    if (!last || !next || last.amount === null || next.amount === null) return inside;
    const f = (stopAp - last.ap) / (next.ap - last.ap);
    return [...inside, { ap: stopAp, amount: last.amount + f * (next.amount - last.amount) }];
  }, [curve, stopAp]);
  const clearChains = useMemo(() => (activeKey && resourceApIndex ? resourceApIndex.listJointClearChains(activeKey, materialInventory) : []), [activeKey, resourceApIndex, materialInventory]);
  const allCleared = clearChains.length > 0 && clearChains.every((chain) => chain.every((c) => clearedStages[c.id]));

  // Reserve enough horizontal space for each localized date label.
  const dateMarks = useMemo(() => {
    const plotWidth = Math.max(1, chartWidth - 76);
    const minApGap = (110 / plotWidth) * chartMaxAp;
    let previousAp = 0;
    return apTimeline.filter((entry) => {
      if (entry.cumulativeAp - previousAp < minApGap || entry.cumulativeAp > chartMaxAp - minApGap / 2) return false;
      previousAp = entry.cumulativeAp;
      return true;
    });
  }, [apTimeline, chartMaxAp, chartWidth]);
  const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  // "11/13 (Fri)" from an ISO date.
  const formatDateLabel = (date: string): string => `${formatMonthDay(date)} (${t(`common.${weekdayKeys[new Date(`${date}T00:00:00Z`).getUTCDay()]}`)})`;
  if (!activeKey) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('ui.resourceEfficiencyNoData')}</p>;
  }

  // Resource picker and owned-amount input are also pre-calculation UI, so the blur + no-pointer-events treatment covers them too, not just the results below.
  const awaitingSimulation = canIncludeSimulations && !includeSimulations;
  const disabledUntilCalculated = awaitingSimulation ? 'pointer-events-none blur-sm' : '';

  return (
    <div className="space-y-6">
      {/* Simulated minigame opt-in (excluded until player runs calculation) */}
      {awaitingSimulation && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
          <div className="text-amber-800 dark:text-amber-300">
            <p>{t('ui.resourceEfficiencySimPrompt')}</p>
            {!!eventData.dice_race && (
              <p>
                {t('ui.resourceEfficiencySimDiceRaceNoteBefore')}
                {onNavigateToTab ? (
                  <button type="button" onClick={() => onNavigateToTab('minigame')} className="font-semibold underline hover:no-underline">
                    {t('ui.minigame')}
                  </button>
                ) : (
                  <strong className="font-semibold">{t('ui.minigame')}</strong>
                )}
                {t('ui.resourceEfficiencySimDiceRaceNoteAfter')}
              </p>
            )}
          </div>
          <SimRunButton
            isRunning={isCalculatingSimulations}
            onClick={handleIncludeSimulations}
            className="shrink-0 rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            {t('ui.resourceEfficiencySimButton')}
          </SimRunButton>
        </div>
      )}

      <div className="relative">
        {/* Transparent overlay catches hover (cursor-not-allowed) + blocks all input */}
        {awaitingSimulation && <div className="absolute inset-0 z-10 cursor-not-allowed" />}
        <div className={`space-y-3 ${disabledUntilCalculated}`}>
          {/* Resource picker */}
          <div className="relative" ref={searchRef}>
            <input
              type="text"
              aria-label={t('ui.resourceEfficiencySearchPlaceholder')}
              placeholder={activeLabel || t('ui.resourceEfficiencySearchPlaceholder')}
              value={search}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => {
                setSearch(e.target.value);
                setIsOpen(true);
              }}
              className="w-full max-w-sm rounded border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-800 focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            {isOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-80 w-full max-w-sm overflow-y-auto rounded border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">{t('ui.resourceEfficiencyNoResults')}</p>
                ) : (
                  searchResults.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => {
                        setSelectedKey(r.key);
                        setSearch('');
                        setIsOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      <ItemIcon
                        type={r.key.slice(0, r.key.lastIndexOf('_'))}
                        itemId={r.key.slice(r.key.lastIndexOf('_') + 1)}
                        amount={0}
                        size={6}
                        eventData={eventData}
                        iconData={iconData}
                        allStudents={allStudents}
                      />
                      <span className="truncate" title={r.label}>
                        {r.label}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {activeLabel && activeKey && (
            <div className="flex flex-wrap items-center gap-2">
              {/* key={activeKey} forces fresh instance to preserve hook order */}
              <ItemIcon
                key={activeKey}
                type={activeKey.slice(0, activeKey.lastIndexOf('_'))}
                itemId={activeKey.slice(activeKey.lastIndexOf('_') + 1)}
                amount={0}
                size={8}
                eventData={eventData}
                iconData={iconData}
                allStudents={allStudents}
              />
              {/* Label is omitted (not just blurred) while awaiting calculation — the icon alone is enough of
                a placeholder, and legible text next to a blurred row reads inconsistently. */}
              {!awaitingSimulation && <span className="font-semibold text-neutral-800 dark:text-neutral-100">{activeLabel}</span>}
              <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                {t('ui.resourceEfficiencyOwned')}
                <div className="w-28">
                  <NumberInput value={ownedAmount} onChange={(v) => updateMaterialInventory(activeKey, v)} min={0} max={Infinity} narrowButtonType="plus_only" />
                </div>
                <label className="flex cursor-pointer items-center gap-1">
                  <input type="checkbox" checked={includeOwned} onChange={(e) => setIncludeOwned(e.target.checked)} />
                  {t('ui.resourceEfficiencyIncludeOwned')}
                </label>
              </div>
              {isStudentEleph && (
                <span className="flex basis-full flex-wrap items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {t('ui.resourceEfficiencyElephHintBefore')}
                  <Link to={localeLink(locale, '/students')} className="text-blue-500 hover:underline dark:text-blue-400">
                    {t_ui('studentGrowthPlanner')}
                  </Link>

                  {currentStudentStat && (
                    <>
                      {' '}
                      {t('spreadsheet.sortLabels.currentRank')}:
                      <span className="scale-75 origin-left">
                        <StarRating n={getStarValue(currentStudentStat.star, currentStudentStat.uw)} />
                      </span>
                    </>
                  )}
                </span>
              )}
            </div>
          )}

          <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-neutral-700 dark:text-neutral-300">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('ui.resourceEfficiencyAreaLabel')}</span>
                <div className="flex flex-wrap items-center gap-1" role="group">
                  {([false, true] as const).map((high) => (
                    <button
                      key={String(high)}
                      type="button"
                      title={high ? t('label.highAreaFirstHint') : undefined}
                      aria-pressed={highAreaFirst === high}
                      onClick={() => setHighAreaFirst(high)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        highAreaFirst === high
                          ? 'bg-ba-btn-blue text-neutral-900'
                          : 'border border-neutral-200 bg-white text-neutral-500 hover:border-ba-btn-blue dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:border-ba-btn-blue'
                      }`}
                    >
                      {high ? t('ui.resourceEfficiencyHighAreas') : t('ui.resourceEfficiencyAllAreas')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('ui.resourceEfficiencyStopLabel')}</span>
                <div className="flex items-center gap-1" role="group" aria-label={t('ui.resourceEfficiencyStopLabel')}>
                  {([false, true] as const).map((stop) => (
                    // A disabled button gets no hover, so the reason sits on a wrapper that still receives it.
                    <span key={String(stop)} title={stop && !applyShopGoals ? t(hasShopGoals ? 'ui.resourceEfficiencyApplyShopGoals' : 'ui.resourceEfficiencyGoalsRequired') : undefined}>
                      <button
                        type="button"
                        disabled={stop && !applyShopGoals}
                        aria-pressed={(stopAtGoals && applyShopGoals) === stop}
                        onClick={() => setStopAtGoals(stop)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                          (stopAtGoals && applyShopGoals) === stop
                            ? 'bg-ba-btn-blue text-neutral-900'
                            : 'border border-neutral-200 bg-white text-neutral-500 hover:border-ba-btn-blue dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:border-ba-btn-blue'
                        }`}
                      >
                        {t(stop ? 'ui.resourceEfficiencyUntilGoals' : 'ui.resourceEfficiencyContinue')}
                      </button>
                    </span>
                  ))}
                </div>
                <EfficiencyHelp label={t('ui.resourceEfficiencyStopLabel')}>
                  <p>{t(hasShopGoals ? 'ui.resourceEfficiencyStopAtGoalsHint' : 'ui.resourceEfficiencyGoalsRequired')}</p>
                  {!hasShopGoals && onNavigateToTab && (
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateToTab('goals');
                      }}
                      className="mt-2 font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {t('ui.resourceEfficiencySetGoals')}
                    </button>
                  )}
                </EfficiencyHelp>
                {hasShopGoals && (
                  <label className="flex cursor-pointer items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                    <input type="checkbox" checked={applyShopGoals} onChange={(e) => setApplyShopGoals(e.target.checked)} />
                    {t('ui.resourceEfficiencyApplyShopGoals')}
                  </label>
                )}
              </div>
              {clearChains.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2" title={t('ui.resourceEfficiencyClearedStagesHint')}>
                  <input type="checkbox" checked={allCleared} onChange={(e) => setClearedStages(e.target.checked ? Object.fromEntries(clearChains.flat().map((c) => [c.id, true])) : {})} />
                  {t('ui.resourceEfficiencyClearedStages')}
                </label>
              )}
            </div>

            {applyShopGoals && plannedShopSpend.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span>{t('ui.resourceEfficiencyShopGoalExpectedSpend')}</span>
                {plannedShopSpend.map(([key, amount]) => (
                  <span key={key} className="flex items-center gap-1" title={resourceName(key)}>
                    <ItemIcon
                      type={key.slice(0, key.lastIndexOf('_'))}
                      itemId={key.slice(key.lastIndexOf('_') + 1)}
                      amount={0}
                      size={6}
                      eventData={eventData}
                      iconData={iconData}
                      allStudents={allStudents}
                    />
                    <span className="tabular-nums text-neutral-700 dark:text-neutral-300">× {Math.round(amount).toLocaleString()}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            {Object.values(totalBonus).every((v) => v === 0) && eventData.bonus && onNavigateToTab && (
              <button type="button" onClick={() => onNavigateToTab('bonus')} className="text-blue-600 hover:underline dark:text-blue-400">
                {t('ui.resourceEfficiencyBonusUnset')}
              </button>
            )}
            <EfficiencyHelp label={t('ui.resourceEfficiencyAssumptions')} showLabel>
              <p>{t('ui.resourceEfficiencyDescriptionBefore')}</p>
              <p className="mt-1">{t('ui.resourceEfficiencyDescriptionAfter')}</p>
            </EfficiencyHelp>
          </div>

          {/* Graph */}
          {curve.length > 0 ? (
            <div className={chartDimmed ? 'opacity-50' : undefined}>
              <ResponsiveContainer width="100%" height={320} onResize={(width) => setChartWidth(width)}>
                <LineChart data={chartCurve} margin={{ top: 12, right: 32, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                  <XAxis
                    dataKey="ap"
                    type="number"
                    domain={[0, chartMaxAp]}
                    allowDataOverflow
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                    tickFormatter={formatAxisTick}
                    tickLine={false}
                    axisLine={false}
                    label={{ value: 'AP', position: 'insideBottomRight', fontSize: 10, fill: 'currentColor' }}
                  />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'currentColor' }} tickFormatter={yTickFormatter} tickLine={false} axisLine={false} width={44} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { ap: number; amount: number | null };
                      if (p.amount === null) return null;
                      const reachDate = dateReachingAp(apTimeline, p.ap);
                      return (
                        <div style={{ background: 'rgba(23,23,23,0.95)', border: '1px solid #404040', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#fff' }}>
                          <div>
                            AP {Math.round(p.ap).toLocaleString()}
                            {reachDate && ` · ${formatDateLabel(reachDate)}`}
                          </div>
                          <div style={{ fontFamily: 'monospace' }}>{p.amount.toFixed(1)}</div>
                          {finalRepeatEfficiency !== null && (
                            <div>
                              {t('ui.resourceEfficiencyFinalRepeatEfficiency')}: {finalRepeatEfficiency}
                            </div>
                          )}
                          {stageBands.find((b) => b.text && p.ap >= b.from && p.ap <= b.to) && <div>{stageBands.find((b) => b.text && p.ap >= b.from && p.ap <= b.to)?.text}</div>}
                        </div>
                      );
                    }}
                  />
                  {goalAreas.map((a, i) => (
                    <ReferenceArea
                      key={i}
                      x1={a.from}
                      // Keep a sliver of a tiny goal span visible against the full-event AP axis.
                      x2={Math.max(a.to, a.from + maxAp * 0.015)}
                      fill="#3b82f6"
                      fillOpacity={0.2}
                      stroke="none"
                      ifOverflow="hidden"
                      label={{ value: t('ui.resourceEfficiencyShopGoalTag'), fontSize: 10, fill: '#3b82f6', position: 'insideTopLeft' }}
                    />
                  ))}
                  {dateMarks.map((e) => (
                    <ReferenceLine
                      key={e.date}
                      x={e.cumulativeAp}
                      stroke="rgba(128,128,128,0.35)"
                      strokeDasharray="2 3"
                      label={{ value: formatDateLabel(e.date), fontSize: 9, fill: 'currentColor', position: 'insideBottomRight', dy: -4 }}
                    />
                  ))}
                  {stopAp !== null && jointPlan && (
                    <ReferenceLine
                      x={jointPlan.apUsed}
                      stroke="currentColor"
                      strokeWidth={1}
                      strokeOpacity={0.6}
                      label={{
                        value:
                          t('ui.resourceEfficiencyGoalAp', { ap: Math.round(jointPlan.apUsed).toLocaleString() }) +
                          (dateReachingAp(apTimeline, jointPlan.apUsed) ? ` · ${formatMonthDay(dateReachingAp(apTimeline, jointPlan.apUsed) as string)}` : ''),
                        position: 'insideTopRight',
                        dy: 14,
                        fontSize: 10,
                        fill: 'currentColor',
                      }}
                    />
                  )}
                  {availableAp > 0 && availableAp <= chartMaxAp && (
                    <ReferenceLine
                      x={availableAp}
                      label={{ value: `${t('ui.resourceEfficiencyOwnedAp')} ${Math.round(availableAp).toLocaleString()}`, position: 'insideTopRight', dy: 16, fontSize: 10, fill: '#3b82f6' }}
                      stroke="#3b82f6"
                      strokeDasharray="3 2"
                    />
                  )}
                  {ownedApAmount !== null && (
                    <ReferenceLine
                      y={ownedApAmount}
                      label={{
                        value: t('ui.resourceEfficiencyOwnedYield', { ap: Math.round(availableAp).toLocaleString(), amount: ownedApAmount.toLocaleString(undefined, { maximumFractionDigits: 1 }) }),
                        position: 'insideBottomLeft',
                        fontSize: 10,
                        fill: '#3b82f6',
                      }}
                      stroke="#3b82f6"
                      strokeDasharray="3 2"
                    />
                  )}
                  {elephStarLines.map(({ label, threshold }) => (
                    <ReferenceLine
                      key={label}
                      y={threshold}
                      stroke="#a3a3a3"
                      strokeOpacity={0.45}
                      strokeDasharray="3 2"
                      label={{ value: `${label} (${Math.round(threshold).toLocaleString()})`, fontSize: 10, fill: 'currentColor', position: 'insideRight' }}
                    />
                  ))}
                  <Line type="linear" dataKey="amount" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
              {stageBands.some((b) => b.text) && (
                // Lines up with the plot area: YAxis width 44 on the left, chart margin 32 on the right.
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full" style={{ marginLeft: 44, marginRight: 32 }}>
                  {stageBands.map((b, i) => {
                    const width = ((Math.min(b.to, chartMaxAp) - Math.min(b.from, chartMaxAp)) / chartMaxAp) * 100;
                    return width > 0 ? <span key={i} title={b.text} style={{ width: `${width}%`, background: b.color, opacity: b.text ? 0.75 : 0.3 }} /> : null;
                  })}
                </div>
              )}
              {stageBands.some((b) => b.text) && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                  {stageBands
                    .filter((b) => b.text)
                    .map((b, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: b.color, opacity: 0.6 }} />
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">{b.text}</span>
                        <span>{Number.isFinite(b.count) ? t('ui.resourceEfficiencyStepPurchases', { count: Math.round(b.count).toLocaleString() }) : t('ui.resourceEfficiencyStepForever')}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ) : null}

          {/* Transparency section — every row uses the same "{amount} / {cost}" shape plus repeat/one-time + approximation tags. */}
          <details open className="space-y-3 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-700">
            <summary className="cursor-pointer py-1 font-medium text-neutral-700 dark:text-neutral-300">{t('ui.resourceEfficiencyPlanOrder')}</summary>
            {jointPlan && (
              <div>
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1 tabular-nums">
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">{t('ui.resourceEfficiencyPlanStep')}</span>
                  <span className="text-right text-xs text-neutral-400 dark:text-neutral-500">{t_ui('count')}</span>
                  <span className="text-right text-xs text-neutral-400 dark:text-neutral-500">{t('ui.resourceEfficiencyPlanSpent')}</span>
                  <span className="text-right text-xs text-neutral-400 dark:text-neutral-500">{t('ui.resourceEfficiencyApCumulative')}</span>
                  {planRows.map(({ step, purchases, costKey, clears }, i) => {
                    const label = step.ref !== undefined ? jointPlan.labels[step.ref] : undefined;
                    return (
                      <Fragment key={i}>
                        <span className="flex flex-wrap items-baseline gap-x-2 text-neutral-700 dark:text-neutral-300">
                          <span className="flex items-center gap-1.5">
                            {purchases !== undefined && costKey && (
                              <span title={resolveLabel(costKey, eventData, allStudents, locale)}>
                                <ItemIcon
                                  type={costKey.slice(0, costKey.lastIndexOf('_'))}
                                  itemId={costKey.slice(costKey.lastIndexOf('_') + 1)}
                                  amount={0}
                                  size={5}
                                  eventData={eventData}
                                  iconData={iconData}
                                  allStudents={allStudents}
                                />
                              </span>
                            )}
                            {clears ? (
                              <details>
                                <summary className="cursor-pointer">{t('ui.resourceEfficiencyClearGroup', { count: clears.length })}</summary>
                                <ul className="mt-1 space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                                  {clears.map((clear, index) => (
                                    <li key={index}>
                                      {clear.ref !== undefined && renderLabelNode(jointPlan.labels[clear.ref].sourceLabel)} · AP {Math.round(clear.ap).toLocaleString()}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : purchases !== undefined ? (
                              t('ui.resourceEfficiencyStepShop')
                            ) : label ? (
                              renderLabelNode(label.sourceLabel)
                            ) : (
                              ''
                            )}
                          </span>
                        </span>
                        <span className="text-right text-neutral-500 dark:text-neutral-400">
                          {clears
                            ? '–'
                            : purchases !== undefined
                              ? Math.round(purchases).toLocaleString()
                              : step.kind === 'clear'
                                ? 1
                                : step.forever
                                  ? '∞'
                                  : step.kind === 'repeat'
                                    ? Math.round(step.count).toLocaleString()
                                    : step.count.toFixed(1)}
                        </span>
                        <span className="text-right text-neutral-500 dark:text-neutral-400">{step.ap >= 0.5 ? Math.round(step.ap).toLocaleString() : '–'}</span>
                        <span className="text-right text-neutral-500 dark:text-neutral-400">{step.forever ? '∞' : Math.round(step.apEnd).toLocaleString()}</span>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            )}
            {!jointPlan && profile && profile.segments.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('ui.resourceEfficiencySegments')}</h3>
                <ul className="space-y-1">
                  {profile.segments.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-neutral-700 dark:text-neutral-300">
                      <span>{renderLabelNode(s.sourceLabel)}</span>
                      <span className="text-neutral-400 dark:text-neutral-500">
                        — {s.amount.toFixed(2)}
                        {t('ui.resourceEfficiencyUnit')} / AP {s.apCost.toFixed(2)}
                        {s.amount > 0 && ` (${formatUnitRate(s.amount, s.apCost)})`}
                      </span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                        {s.amount === 0 ? t('ui.resourceEfficiencyUnlockTag') : s.repeatsForever ? t('ui.resourceEfficiencyRepeats') : t('ui.resourceEfficiencyOneTimeTag')}
                      </span>
                      {(s.source.type === 'shop_tier' || s.source.type === 'shop_flat_limit') && s.source.goal && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-950 dark:text-blue-400">{t('ui.resourceEfficiencyShopGoalTag')}</span>
                      )}
                      {s.isApproximated && (
                        <span className="flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                          {t('ui.resourceEfficiencyApproximated')}
                          {(s.source.type === 'dice_race_lap' || s.source.type === 'dice_race') && (
                            <HelpTooltip placement="top" overlay={<span className="text-xs">{t('ui.resourceEfficiencyDiceRaceAssumption')}</span>} mouseEnterDelay={0.05}>
                              <span className="cursor-help" aria-label={t('ui.resourceEfficiencyDiceRaceAssumption')}>
                                <HiOutlineQuestionMarkCircle className="text-sm" />
                              </span>
                            </HelpTooltip>
                          )}
                        </span>
                      )}
                      {!!s.firstRunBonusAmount && (
                        <span className="text-neutral-400 dark:text-neutral-500">{t('ui.resourceEfficiencyFirstRunBonus', { amount: s.firstRunBonusAmount.toFixed(2) })}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!jointPlan && farmingPlan.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('ui.resourceEfficiencyFarmingPlan')}</h3>
                <ul className="space-y-1">
                  {groupFarmingPlan(farmingPlan).map((g, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-neutral-700 dark:text-neutral-300">
                      <span>
                        {t(g.category === 'story' ? 'game:story' : 'common.stage')} {g.fromLabel === g.toLabel ? g.fromLabel : `${g.fromLabel}~${g.toLabel}`}
                      </span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                        {g.repeatsForever ? t('ui.resourceEfficiencyRepeats') : t('ui.resourceEfficiencyOneTimeTag')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {profile && profile.oneTimeContributions.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('ui.resourceEfficiencyOneTimeTag')}</h3>
                <ul className="space-y-1">
                  {profile.oneTimeContributions.map((o, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-neutral-700 dark:text-neutral-300">
                      <span>{renderLabelNode(o.sourceLabel)}</span>
                      <span className="text-neutral-400 dark:text-neutral-500">
                        — {o.amount.toFixed(2)}
                        {t('ui.resourceEfficiencyUnit')} / {o.apCost !== undefined ? `AP ${o.apCost.toFixed(2)}` : t('ui.resourceEfficiencyFree')}
                        {o.apCost !== undefined && o.amount > 0 && ` (${formatUnitRate(o.amount, o.apCost)})`}
                      </span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                        {t('ui.resourceEfficiencyOneTimeTag')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {profile && profile.segments.length === 0 && profile.oneTimeContributions.length === 0 && <p className="text-neutral-500 dark:text-neutral-400">{t('ui.resourceEfficiencyNoData')}</p>}
          </details>
        </div>
      </div>

      {/* Debug: AP flow Sankey (verification tool, independent of sim gate) */}
      {import.meta.env.DEV && (
        <div className="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <button
            type="button"
            onClick={() => setShowApFlow((v) => !v)}
            className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            {showApFlow ? '▾' : '▸'} Debug: AP flow (Sankey)
          </button>
          {showApFlow && activeKey && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span>Target amount of {activeKey}:</span>
                <div className="w-24">
                  <NumberInput value={apFlowTargetAmount} onChange={setApFlowTargetAmount} min={1} max={Infinity} narrowButtonType="plus_only" />
                </div>
              </div>
              {apFlow && apFlow.labels.length > 0 ? (
                <ApFlowSankeyChart flow={apFlow} eventData={eventData} allStudents={allStudents} locale={locale} />
              ) : (
                <p className="text-xs text-neutral-400 dark:text-neutral-500">No flow to show for this amount.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
