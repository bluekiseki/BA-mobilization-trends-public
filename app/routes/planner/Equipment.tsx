// app/routes/planner/Equipment.tsx
import { useMemo, useState, useCallback, useEffect } from 'react';
import { data, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { useEquipmentPlanStore } from '~/store/planner/useEquipmentPlanStore';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { calculatedGrowthNeeds } from '~/utils/calculatedGrowthNeeds';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { getInstance } from '~/middleware/i18next';
import type { Route } from './+types/Equipment';
import type { CampaignData, EventData, IconData, IconInfos, Student, StudentPortraitData } from '~/types/plannerData';
import { FaFilter, FaSortAmountUp, FaSortAmountDown, FaPlusCircle, FaLayerGroup, FaSortNumericDown, FaSortAmountDown as FaSortDesc, FaSearch, FaUsers, FaCalculator, FaMap } from 'react-icons/fa';
import { NumberInput } from '~/components/planner/common/NumberInput';
import { EquipmentStudentCard } from '~/components/planner/Equipment/EquipmentStudentCard';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import { useTranslation } from 'react-i18next';
import { localeLink } from '~/utils/localeLink';
import { EquipmentItemIcon, getEquipmentTierLabel, resolveGachaGroup, type ResolvedStage } from '~/components/planner/Equipment/common';
import { EquipmentFilterModal } from '~/components/planner/Equipment/EquipmentFilterModal';
import { EquipmentInventoryMatrix } from '~/components/planner/Equipment/EquipmentInventoryMatrix';
import { EquipmentSummaryPanel } from '~/components/planner/Equipment/EquipmentSummaryPanel';
import { StageAccordion } from '~/components/planner/Equipment/StageAccordion';
import { SimRunButton } from '~/components/planner/common/SimRunButton';
import { BlueprintUsageDetail } from '~/components/planner/Equipment/BlueprintUsageDetail';
import { cdn } from '~/utils/cdn';
import {
  getTierFromEquipmentId,
  getEquipmentType,
  calculateBlueprintCost,
  blueprintIdToType,
  equipmentTypeToBlueprint,
  optimizeNormalStages2Step,
  optimizeHardStages,
  optimizeCombinedStages2Step,
  normalizeBluprintToEquipment,
  type OptimizeResult,
} from '~/utils/blueprintUtils';
import { CustomNumberInput } from '~/components/CustomInput';
import type { AppHandle } from '~/types/link';
import { StatCard, MultiplierSeg, PaneHeader } from '~/components/planner/Equipment/EquipmentPrimitives';

const equipmentTypeLabelKey = {
  Hat: 'equipments.hat',
  Gloves: 'equipments.gloves',
  Shoes: 'equipments.shoes',
  Bag: 'equipments.bag',
  Badge: 'equipments.badge',
  Hairpin: 'equipments.hairpin',
  Charm: 'equipments.charm',
  Watch: 'equipments.watch',
  Necklace: 'equipments.necklace',
} as const;

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  const siteTitle = i18n.t('common:title');
  const title: string = i18n.t('planner:page.equipmentFarmingPlanner', 'Equipment Farming Planner');
  const description: string = i18n.t('planner:page.description.equipmentFarmingPlanner');
  return data({ siteTitle, title, description, locale });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/p.webp');
}

export const handle: AppHandle = {
  preload: (data: unknown) => {
    const d = data as Record<string, unknown> | undefined;
    const locale = d?.locale as Locale | undefined;
    if (!locale) return [];
    return [
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/w/students_portrait.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/ew/icon_img.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/ew/icon_info.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/w/jp/campaigns.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/w/kr/campaigns.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      ...createLinkHreflang(`/planner/equipment`),
    ];
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function EquipmentPlannerV2() {
  const { title } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation('planner');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_g } = useTranslation('game');
  const locale = i18n.language as Locale;
  const matcher = useSearchMatcher(locale);

  // --- UI State ---
  const [stageFilter, setStageFilter] = useState<'Normal' | 'Hard'>('Normal');
  const [hardMode, setHardMode] = useState<'aggressive' | 'optimized' | 'manual' | 'combined'>('manual');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSortedDesc, setIsSortedDesc] = useState(true);
  const [itemFilter, setItemFilter] = useState(new Set<string>());
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedPlanUuids, setSelectedPlanUuids] = useState(new Set<string>());
  const [optimizerOutput, setOptimizerOutput] = useState<Pick<OptimizeResult, 'blueprintsUsed' | 'finalRemaining'> | null>(null);
  const [summarySortMode, setSummarySortMode] = useState<'tier' | 'id' | 'amount'>('tier');
  const [studentData, setStudentData] = useState<Record<string, Student> | null>(null);
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData>({});
  const [iconData, setIconData] = useState<IconData>({});
  const [allCampaigns, setAllCampaigns] = useState<{ jp?: CampaignData; kr?: CampaignData }>({});
  const [iconInfoData, setIconInfoData] = useState<IconInfos>({
    Item: {},
    Equipment: {},
    Furniture: {},
    Currency: {},
    Emblem: {},
    GachaGroup: {},
  });
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [hardStudentFilter, setHardStudentFilter] = useState(new Set<number>());
  const [summaryTabMode, setSummaryTabMode] = useState<'total' | 'farmed' | 'remaining' | 'blueprint' | 'surplus'>('total');
  const [mobilePane, setMobilePane] = useState<'input' | 'stages' | 'results'>('input');

  // --- Store ---
  const { runCounts, farmingDays, normalMultiplier, hardMultiplier, setRunCount, setFarmingDays, setMultipliers, setRunCounts, campaignSource, setCampaignSource } = useEquipmentPlanStore();
  const campaigns = allCampaigns[campaignSource];

  const { materialInventory, updateMaterialInventory } = useGlobalStore();

  // Blueprint helpers: Equipment_501000~509000 in materialInventory
  const blueprints = useMemo(() => Object.fromEntries(Object.entries(equipmentTypeToBlueprint).map(([type, id]) => [type, materialInventory[`Equipment_${id}`] || 0])), [materialInventory]);
  const setBlueprint = useCallback(
    (type: string, amount: number) => {
      const id = equipmentTypeToBlueprint[type];
      if (id) updateMaterialInventory(`Equipment_${id}`, amount);
    },
    [updateMaterialInventory],
  );

  useEffect(() => {
    fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`))
      .then((r) => r.json() as unknown as Record<string, Student>)
      .then(setStudentData)
      .catch(console.error);
    fetch(cdn(`/w/students_portrait.json`))
      .then((r) => r.json() as unknown as StudentPortraitData)
      .then(setStudentPortraits)
      .catch(console.error);
    fetch(cdn(`/ew/icon_img.json`))
      .then((r) => r.json() as unknown as IconData)
      .then(setIconData)
      .catch(console.error);
    Promise.all([fetch(cdn(`/ew/icon_info.json`)).then((r) => r.json() as unknown as IconInfos), fetch(cdn(`/w/jp/campaign_icon_info.json`)).then((r) => r.json() as unknown as IconInfos)])
      .then(([d, campaignIconInfo]) => setIconInfoData({ ...d, GachaGroup: { ...d.GachaGroup, ...(campaignIconInfo.GachaGroup ?? {}) } }))
      .catch(console.error);
    Promise.all([fetch(cdn(`/w/jp/campaigns.json`)).then((r) => r.json() as unknown as CampaignData), fetch(cdn(`/w/kr/campaigns.json`)).then((r) => r.json() as unknown as CampaignData)])
      .then(([jp, kr]) => setAllCampaigns({ jp, kr }))
      .catch(console.error);
  }, [locale]);

  const mergedStudents = useMemo(() => {
    if (!studentData) return {};
    const students = { ...studentData };
    Object.keys(students).forEach((id) => {
      const n = Number(id);
      if (studentPortraits[n]) students[id].Portrait = studentPortraits[n];
    });
    return students;
  }, [studentData, studentPortraits]);

  const resolvedStages = useMemo((): ResolvedStage[] => {
    if (!campaigns) return [];
    return Object.entries(campaigns).map(([stageId, stageData]) => {
      const drops: Record<string, number> = {};
      stageData.Reward.forEach((reward) => {
        const prob = reward.StageRewardProb / 10000;
        const amount = reward.StageRewardAmount || 1;
        const type = reward.StageRewardParcelTypeStr;
        const id = reward.StageRewardId;
        if (type === 'Equipment') {
          const normalizedId = id in blueprintIdToType ? id : normalizeBluprintToEquipment(id) || id;
          const key = `Equipment_${normalizedId}`;
          drops[key] = (drops[key] || 0) + prob * amount;
        } else if (type === 'Item') {
          drops[`Item_${id}`] = (drops[`Item_${id}`] || 0) + prob * amount;
        } else if (type === 'GachaGroup') {
          const gr = resolveGachaGroup(id, iconInfoData);
          for (const [k, p] of Object.entries(gr)) {
            if (k.startsWith('Equipment_')) {
              const eqId = Number(k.split('_')[1]);
              const normalizedId = eqId in blueprintIdToType ? eqId : normalizeBluprintToEquipment(eqId) || eqId;
              drops[`Equipment_${normalizedId}`] = (drops[`Equipment_${normalizedId}`] || 0) + prob * p;
            } else {
              drops[k] = (drops[k] || 0) + prob * p;
            }
          }
        }
      });
      return {
        id: Number(stageId),
        type: stageData.Type,
        name: stageData.Name,
        chapter: stageData.Chapter,
        stageNum: stageData.Stage,
        ap: stageData.AP,
        drops,
      };
    });
  }, [campaigns, iconInfoData]);

  const hardElephStudents = useMemo(() => {
    const ids = new Set<number>();
    resolvedStages
      .filter((s) => s.type === 'Hard')
      .forEach((stage) => {
        Object.keys(stage.drops).forEach((key) => {
          const [t, id] = key.split('_');
          if (t === 'Item') {
            const n = Number(id);
            if (n >= 10000 && n <= 29999) ids.add(n);
          }
        });
      });
    return Array.from(ids).sort((a, b) => a - b);
  }, [resolvedStages]);

  const { growthPlans } = useGlobalStore();

  const selectedPlans = useMemo(() => growthPlans.filter((p) => selectedPlanUuids.has(p.uuid)), [growthPlans, selectedPlanUuids]);

  const filteredGrowthPlans = useMemo(() => {
    let plans = growthPlans;
    if (showOnlySelected) plans = plans.filter((p) => selectedPlanUuids.has(p.uuid));
    if (studentSearchQuery.trim())
      plans = plans.filter((p) => {
        const s = p.studentId ? mergedStudents[p.studentId] : null;
        if (!s) return false;
        return (
          matcher(s.Name, studentSearchQuery) || matcher(s.PathName, studentSearchQuery) || matcher(s.FamilyName ?? '', studentSearchQuery) || s.SearchTags.some((v) => matcher(v, studentSearchQuery))
        );
      });
    return plans;
  }, [growthPlans, showOnlySelected, selectedPlanUuids, studentSearchQuery, mergedStudents, matcher]);

  const totalEquipmentNeeds = useMemo(() => {
    const needs = calculatedGrowthNeeds(selectedPlans, mergedStudents);
    return Object.fromEntries(
      Object.entries(needs).filter(
        ([key]) => key.startsWith('Equipment_') && !['Equipment_1', 'Equipment_2', 'Equipment_3', 'Equipment_4', 'Equipment_40', 'Equipment_41', 'Equipment_42', 'Equipment_43'].includes(key),
      ),
    );
  }, [selectedPlans, mergedStudents]);

  const farmedByPlan = useMemo(() => {
    const farmed: Record<string, number> = {};
    for (const stage of resolvedStages) {
      const runs = runCounts[stage.id] || 0;
      if (runs === 0) continue;
      const mult = stage.type === 'Normal' ? normalMultiplier : hardMultiplier;
      for (const [k, d] of Object.entries(stage.drops)) farmed[k] = (farmed[k] || 0) + d * runs * mult;
    }
    return farmed;
  }, [runCounts, resolvedStages, normalMultiplier, hardMultiplier]);

  // Pure required amount reflecting only farming + inventory (before exhausting universal blueprints)
  const rawRemainingNeeds = useMemo(() => {
    const rem: Record<string, number> = {};
    for (const [k, amt] of Object.entries(totalEquipmentNeeds)) {
      const need = amt - (materialInventory[k] || 0) - (farmedByPlan[k] || 0);
      if (need > 0) rem[k] = need;
    }
    return rem;
  }, [totalEquipmentNeeds, farmedByPlan, materialInventory]);

  // After running the optimizer, use the value returned by the optimizer; if not run, perform greedy deduction with owned blueprints
  const { remainingNeeds, blueprintsUsed, blueprintsUsedByItem } = useMemo(() => {
    if (optimizerOutput)
      return {
        remainingNeeds: optimizerOutput.finalRemaining,
        blueprintsUsed: optimizerOutput.blueprintsUsed,
        blueprintsUsedByItem: {}, // as Record<string, Record<string, number>>,
      };

    const remaining = { ...rawRemainingNeeds };
    const blueprintsUsed: Record<string, number> = {};
    const blueprintsUsedByItem: Record<string, Record<string, number>> = {};
    const bpCopy = { ...blueprints };

    for (const [key, amt] of Object.entries(farmedByPlan)) {
      const id = Number(key.split('_')[1]);
      if (id in blueprintIdToType) {
        const bt = blueprintIdToType[id];
        bpCopy[bt] = (bpCopy[bt] || 0) + Math.floor(amt);
      }
    }
    for (const [key, needed] of Object.entries(remaining)) {
      let left = needed;
      const id = Number(key.split('_')[1]);
      const eqType = getEquipmentType(id);
      const tier = getTierFromEquipmentId(id);

      if (eqType && bpCopy[eqType]) {
        const cost = calculateBlueprintCost(tier);
        const univ = Math.ceil(left * cost);
        const used = Math.min(univ, bpCopy[eqType]);
        bpCopy[eqType] -= used;
        blueprintsUsed[eqType] = (blueprintsUsed[eqType] || 0) + used;
        if (!blueprintsUsedByItem[eqType]) blueprintsUsedByItem[eqType] = {};
        blueprintsUsedByItem[eqType][key] = (blueprintsUsedByItem[eqType][key] || 0) + used;
        left -= used / cost;
      }
      if (left > 1e-9) remaining[key] = left;
      else delete remaining[key];
    }
    return { remainingNeeds: remaining, blueprintsUsed, blueprintsUsedByItem };
  }, [optimizerOutput, rawRemainingNeeds, farmedByPlan, materialInventory]);

  const blueprintsUsedForDisplay = useMemo(() => {
    const d: Record<string, number> = {};
    for (const [type, amt] of Object.entries(blueprintsUsed)) {
      const id = equipmentTypeToBlueprint[type];
      if (id) d[`Equipment_${id}`] = amt;
    }
    return d;
  }, [blueprintsUsed]);

  const surplusGoods = useMemo(() => {
    const surplus: Record<string, number> = {};
    const allFarmed = { ...farmedByPlan };
    for (const [k, v] of Object.entries(materialInventory)) allFarmed[k] = (allFarmed[k] || 0) + v;
    for (const [k, amt] of Object.entries(allFarmed)) {
      const id = Number(k.split('_')[1]);
      if (id in blueprintIdToType) {
        const bt = blueprintIdToType[id];
        const total = amt + (blueprints[bt] || 0) - (blueprintsUsed[bt] || 0);
        if (total > 0) surplus[k] = total;
      } else {
        const s = amt - (totalEquipmentNeeds[k] || 0);
        if (s > 0) surplus[k] = s;
      }
    }
    for (const [type, owned] of Object.entries(blueprints)) {
      const id = equipmentTypeToBlueprint[type];
      if (!id) continue;
      const k = `Equipment_${id}`;
      if (!(k in allFarmed) && owned > 0) {
        const rem = owned - (blueprintsUsed[type] || 0);
        if (rem > 0) surplus[k] = rem;
      }
    }
    return surplus;
  }, [totalEquipmentNeeds, farmedByPlan, materialInventory, blueprintsUsed]);

  const totalApUsed = useMemo(() => Math.round(resolvedStages.reduce((t, s) => t + (runCounts[s.id] || 0) * s.ap, 0)), [runCounts, resolvedStages]);

  const apByType = useMemo(() => {
    let normal = 0,
      hard = 0;
    for (const s of resolvedStages) {
      const runs = runCounts[s.id] || 0;
      if (!runs) continue;
      if (s.type === 'Normal') normal += runs * s.ap;
      else hard += runs * s.ap;
    }
    return { normal: Math.round(normal), hard: Math.round(hard) };
  }, [runCounts, resolvedStages]);

  const activeStageCountByType = useMemo(() => {
    let normal = 0,
      hard = 0;
    for (const [id, count] of Object.entries(runCounts)) {
      if (count <= 0) continue;
      const s = resolvedStages.find((s) => s.id === Number(id));
      if (s?.type === 'Normal') normal++;
      else if (s?.type === 'Hard') hard++;
    }
    return { normal, hard };
  }, [runCounts, resolvedStages]);

  // --- Optimizer ---
  const handleOptimize = useCallback(() => {
    setIsOptimizing(true);
    setTimeout(() => {
      const maxHardRuns = farmingDays * 3;
      let hardRunCounts: Record<number, number> = {};

      if (hardMode === 'combined') {
        const needs: Record<string, number> = {};
        for (const [k, amt] of Object.entries(totalEquipmentNeeds)) {
          const n = amt - (materialInventory[k] || 0);
          if (n > 0) needs[k] = n;
        }
        if (Object.keys(needs).length > 0) {
          const result = optimizeCombinedStages2Step(resolvedStages, needs, blueprints, normalMultiplier, hardMultiplier, maxHardRuns);
          setRunCounts(result.runCounts);
          setOptimizerOutput({ blueprintsUsed: result.blueprintsUsed, finalRemaining: result.finalRemaining });
        } else {
          setRunCounts({});
          setOptimizerOutput(null);
        }
        setIsOptimizing(false);
        return;
      }

      if (hardMode === 'manual') {
        hardRunCounts = Object.fromEntries(Object.entries(runCounts).filter(([id]) => resolvedStages.find((s) => s.id === Number(id))?.type === 'Hard'));
      } else if (hardMode === 'aggressive') {
        const needed = new Set(Object.keys(totalEquipmentNeeds));
        resolvedStages
          .filter((s) => s.type === 'Hard' && Object.keys(s.drops).some((k) => needed.has(k)))
          .forEach((s) => {
            hardRunCounts[s.id] = maxHardRuns;
          });
      } else {
        const needsForHard: Record<string, number> = {};
        for (const [k, amt] of Object.entries(totalEquipmentNeeds)) {
          const n = amt - (materialInventory[k] || 0);
          if (n > 0) needsForHard[k] = n;
        }
        if (Object.keys(needsForHard).length > 0) hardRunCounts = optimizeHardStages(resolvedStages, needsForHard, hardMultiplier, maxHardRuns).runCounts;
      }

      const hardFarmed: Record<string, number> = {};
      for (const s of resolvedStages) {
        if (s.type !== 'Hard') continue;
        const runs = hardRunCounts[s.id] || 0;
        if (!runs) continue;
        for (const [k, d] of Object.entries(s.drops)) hardFarmed[k] = (hardFarmed[k] || 0) + d * runs * hardMultiplier;
      }

      const needsForNormal: Record<string, number> = {};
      for (const [k, amt] of Object.entries(totalEquipmentNeeds)) {
        const n = amt - (materialInventory[k] || 0) - (hardFarmed[k] || 0);
        if (n > 0) needsForNormal[k] = n;
      }

      const newCounts = { ...hardRunCounts };
      if (Object.keys(needsForNormal).length > 0) {
        const result = optimizeNormalStages2Step(resolvedStages, needsForNormal, blueprints, normalMultiplier);
        for (const [id, runs] of Object.entries(result.runCounts)) newCounts[Number(id)] = runs;
        setRunCounts(newCounts);
        setOptimizerOutput({ blueprintsUsed: result.blueprintsUsed, finalRemaining: result.finalRemaining });
      } else {
        setRunCounts(newCounts);
        setOptimizerOutput(null);
      }
      setIsOptimizing(false);
    }, 0);
  }, [hardMode, runCounts, resolvedStages, totalEquipmentNeeds, farmingDays, hardMultiplier, materialInventory, normalMultiplier, blueprints, setRunCounts]);

  const handleResetAll = useCallback(() => {
    setRunCounts({});
    setOptimizerOutput(null);
  }, [setRunCounts]);
  const handleResetHard = useCallback(() => {
    setRunCounts(Object.fromEntries(Object.entries(runCounts).filter(([id]) => resolvedStages.find((s) => s.id === Number(id))?.type === 'Normal')));
  }, [runCounts, resolvedStages, setRunCounts]);
  const handleResetNormal = useCallback(() => {
    setRunCounts(Object.fromEntries(Object.entries(runCounts).filter(([id]) => resolvedStages.find((s) => s.id === Number(id))?.type === 'Hard')));
    setOptimizerOutput(null);
  }, [runCounts, resolvedStages, setRunCounts]);

  const handleTogglePlan = useCallback((uuid: string) => {
    setSelectedPlanUuids((prev) => {
      const n = new Set(prev);
      if (n.has(uuid)) {
        n.delete(uuid);
      } else {
        n.add(uuid);
      }
      return n;
    });
  }, []);
  const handleSelectAllPlans = useCallback(() => setSelectedPlanUuids(new Set(growthPlans.map((p) => p.uuid))), [growthPlans]);
  const handleDeselectAllPlans = useCallback(() => setSelectedPlanUuids(new Set()), []);

  const eventDataForIcon = useMemo(() => ({ icons: iconInfoData }) as EventData, [iconInfoData]);

  const allFarmableItems = useMemo(() => {
    const items = new Set<string>();
    resolvedStages.forEach((s) =>
      Object.keys(s.drops).forEach((k) => {
        if (!['Equipment_1', 'Equipment_2', 'Equipment_3', 'Equipment_4'].includes(k)) {
          items.add(k);
        }
      }),
    );
    return Array.from(items).sort((a, b) => {
      const ia = parseInt(a.split('_')[1], 10),
        ib = parseInt(b.split('_')[1], 10);
      const ta = parseInt(getEquipmentTierLabel(iconInfoData.Equipment?.[ia]) ?? '0') || 0;
      const tb = parseInt(getEquipmentTierLabel(iconInfoData.Equipment?.[ib]) ?? '0') || 0;
      return ta !== tb ? tb - ta : ia - ib;
    });
  }, [resolvedStages, iconInfoData]);

  const getSortedList = useCallback(
    (items: Record<string, number>, mode: 'tier' | 'id' | 'amount'): [string, number][] => {
      return Object.entries(items).sort((a, b) => {
        if (mode === 'amount') return b[1] - a[1];
        const ia = parseInt(a[0].split('_')[1], 10),
          ib = parseInt(b[0].split('_')[1], 10);
        if (mode === 'id') return ia - ib;
        const ta = parseInt(getEquipmentTierLabel(iconInfoData.Equipment?.[ia]) ?? '0') || 0;
        const tb = parseInt(getEquipmentTierLabel(iconInfoData.Equipment?.[ib]) ?? '0') || 0;
        return ta !== tb ? tb - ta : ia - ib;
      });
    },
    [iconInfoData.Equipment],
  );

  const sortedItems = useMemo(() => {
    const src =
      summaryTabMode === 'total'
        ? totalEquipmentNeeds
        : summaryTabMode === 'farmed'
          ? farmedByPlan
          : summaryTabMode === 'remaining'
            ? remainingNeeds
            : summaryTabMode === 'surplus'
              ? surplusGoods
              : blueprintsUsedForDisplay;
    return getSortedList(src, summarySortMode);
  }, [summaryTabMode, summarySortMode, totalEquipmentNeeds, farmedByPlan, remainingNeeds, surplusGoods, blueprintsUsedForDisplay, getSortedList]);

  const panelColor = {
    total: 'bg-blue-50 dark:bg-blue-900/20',
    farmed: 'bg-green-50 dark:bg-green-900/20',
    remaining: 'bg-red-50 dark:bg-red-900/20',
    blueprint: 'bg-yellow-50 dark:bg-yellow-900/20',
    surplus: 'bg-green-50 dark:bg-green-900/20',
  }[summaryTabMode];

  const emptyText = {
    total: t('equipment.noItemsNeeded'),
    farmed: t('equipment.noFarmingPlan'),
    remaining: t('equipment.noRemainingNeeds'),
    blueprint: '',
    surplus: t('equipment.noSurplusGoods'),
  }[summaryTabMode];

  const iconBtn =
    'flex items-center justify-center w-7 h-7 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors text-xs';

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100dvh - 3.5rem)' }}>
      {/* ── TOPBAR ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 h-11 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm">
        <span className="font-bold tracking-tight dark:text-neutral-100 truncate">{title}</span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 tracking-wide">BETA</span>
        <div className="flex gap-3 ml-auto text-[11px] text-neutral-500 dark:text-neutral-400 font-mono items-center flex-wrap justify-end">
          <span>
            <b className="text-neutral-800 dark:text-neutral-100">{selectedPlanUuids.size}</b>/{growthPlans.length} {t('equipment.students')}
          </span>
          {totalApUsed > 0 && (
            <span>
              <b className="text-blue-600 dark:text-blue-400">{totalApUsed.toLocaleString()}</b> AP
            </span>
          )}
          {activeStageCountByType.normal > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
              <b>{activeStageCountByType.normal}</b>
            </span>
          )}
          {activeStageCountByType.hard > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
              <b>{activeStageCountByType.hard}</b>
            </span>
          )}
        </div>
      </div>

      {/* ── PANE TAB BAR ───────────────────────────────────────────────────── */}
      <div className="lg:hidden shrink-0 flex border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
        {[
          { pane: 'input' as const, icon: <FaUsers size={13} />, label: t('equipment.tabInput') },
          { pane: 'stages' as const, icon: <FaMap size={13} />, label: t('equipment.tabStages') },
          { pane: 'results' as const, icon: <FaCalculator size={13} />, label: t('equipment.tabResults') },
        ].map(({ pane, icon, label }) => (
          <button
            key={pane}
            onClick={() => setMobilePane(pane)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
              mobilePane === pane ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
            }`}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── 3-PANE BODY ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ═══ LEFT: Input Pane ════════════════════════════════════════════════ */}
        <div
          className={`flex-col overflow-y-auto bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-700
          ${mobilePane !== 'input' ? 'hidden lg:flex' : 'flex'} w-full lg:flex-1`}
        >
          {/* Settings */}
          <div className="shrink-0 border-b border-neutral-100 dark:border-neutral-800">
            <PaneHeader>{t_ui('settings')}</PaneHeader>
            <div className="px-3 py-2 grid grid-cols-[72px_1fr] gap-x-2 gap-y-2 text-xs">
              <label className="text-neutral-500 dark:text-neutral-400 flex items-center">{t('equipment.source')}</label>
              <select
                value={campaignSource}
                onChange={(e) => setCampaignSource(e.target.value as 'kr' | 'jp')}
                className="w-full rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 text-xs ios-compact-12 py-1 px-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="kr">{t('equipment.sourceKR')}</option>
                <option value="jp">{t('equipment.sourceJPNew')}</option>
              </select>

              <label className="text-neutral-500 dark:text-neutral-400 flex items-center">{t('equipment.farmingDays')}</label>
              <NumberInput value={farmingDays} onChange={(v) => setFarmingDays(v || 1)} min={1} max={9999} />

              <label className="text-neutral-500 dark:text-neutral-400 flex items-center">{t('equipment.sourceLabelNormal')}</label>
              <MultiplierSeg value={normalMultiplier} onChange={(v) => setMultipliers('normal', v)} />

              <label className="text-neutral-500 dark:text-neutral-400 flex items-center">{t('equipment.sourceLabelHard')}</label>
              <MultiplierSeg value={hardMultiplier} onChange={(v) => setMultipliers('hard', v)} />
            </div>
          </div>

          {/* Student picker */}
          <div className="flex flex-col shrink-0 border-b border-neutral-100 dark:border-neutral-800">
            <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                <FaUsers size={10} />
                {t('equipment.studentPlanTitle')}
                <span className="font-mono text-neutral-600 dark:text-neutral-300 normal-case tracking-normal ml-0.5">
                  {selectedPlanUuids.size}/{growthPlans.length}
                </span>
              </div>
              <div className="flex gap-1">
                <button onClick={handleSelectAllPlans} className="text-[10px] px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200">
                  {t_ui('selectAll')}
                </button>
                <button
                  onClick={handleDeselectAllPlans}
                  className="text-[10px] px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-600"
                >
                  {t_ui('deselectAll')}
                </button>
              </div>
            </div>

            <div className="shrink-0 flex gap-2 px-3 py-1.5 border-b border-neutral-100 dark:border-neutral-800">
              <div className="relative flex-1">
                <FaSearch className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" style={{ fontSize: 10 }} />
                <input
                  type="text"
                  value={studentSearchQuery}
                  onChange={(e) => setStudentSearchQuery(e.target.value)}
                  placeholder={t('equipment.studentSearchPlaceholder')}
                  className="w-full pl-6 pr-5 py-1 text-xs border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {studentSearchQuery && (
                  <button onClick={() => setStudentSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 text-sm leading-none">
                    ×
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowOnlySelected((p) => !p)}
                className={`text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap transition-colors ${
                  showOnlySelected ? 'bg-blue-500 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                }`}
              >
                {t('equipment.studentFilterSelected')}
              </button>
            </div>

            <div className="overflow-y-auto p-2 max-h-48">
              {growthPlans.length === 0 ? (
                <div className="text-center py-8 text-xs text-neutral-400 dark:text-neutral-500 px-3">
                  <p className="font-semibold text-neutral-600 dark:text-neutral-300 mb-1">{t('ui.noStudentGrowthPlan')}</p>
                  <Link to={localeLink(locale, '/planner/students')} className="text-blue-500 hover:underline">
                    [{t('page.studentGrowthPlanner')}]
                  </Link>{' '}
                  {t('ui.startByAddingNewPlan')}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {filteredGrowthPlans.map((plan) => {
                      const student = plan.studentId ? mergedStudents[plan.studentId] : null;
                      const portraitSrc = plan.studentId && studentPortraits[plan.studentId] ? `data:image/webp;base64,${studentPortraits[plan.studentId]}` : null;
                      return (
                        <EquipmentStudentCard
                          key={plan.uuid}
                          plan={plan}
                          studentName={student?.Name ?? t('growthCard.selectStudentPlaceholder')}
                          portraitSrc={portraitSrc}
                          isSelected={selectedPlanUuids.has(plan.uuid)}
                          onClick={() => handleTogglePlan(plan.uuid)}
                        />
                      );
                    })}
                  </div>
                  {filteredGrowthPlans.length === 0 && <p className="text-center text-xs text-neutral-400 py-4">{t_ui('searchStudents')}</p>}
                </>
              )}
            </div>

            <div className="shrink-0 px-3 py-2 border-t border-neutral-100 dark:border-neutral-800">
              <Link to={localeLink(locale, '/planner/students')} className="flex items-center gap-1.5 text-xs text-blue-500 dark:text-blue-400 hover:underline">
                <FaPlusCircle size={11} /> {t('equipment.addEditPlans')}
              </Link>
            </div>
          </div>

          {/* Inventory matrix */}
          <div className="shrink-0 border-b border-neutral-100 dark:border-neutral-800">
            <PaneHeader>{t('equipment.ownedEquipment')}</PaneHeader>
            <EquipmentInventoryMatrix
              allFarmableItems={allFarmableItems}
              inventory={materialInventory}
              setInventoryItem={updateMaterialInventory}
              demandMap={totalEquipmentNeeds}
              onClearAll={() => {
                for (const k of allFarmableItems) updateMaterialInventory(k, 0);
              }}
              iconData={iconData}
            />
          </div>

          {/* Blueprint panel */}
          {campaignSource === 'jp' && (
            <div className="shrink-0 border-b border-neutral-100 dark:border-neutral-800">
              <PaneHeader>{t('equipment.universalBlueprint')}</PaneHeader>
              <div className="px-2 py-1 flex flex-wrap gap-1">
                {(['Hat', 'Gloves', 'Shoes', 'Bag', 'Badge', 'Hairpin', 'Charm', 'Watch', 'Necklace'] as const).map((type) => {
                  const owned = blueprints[type] || 0;
                  const used = blueprintsUsed[type] || 0;
                  const status = used === 0 ? 'none' : owned >= used ? 'full' : 'deficit';
                  return (
                    <div
                      key={type}
                      className={`flex items-center gap-1 px-1.5 py-0.5 border-l-2 ${
                        status === 'full' ? 'border-green-400 dark:border-green-500' : status === 'deficit' ? 'border-red-400 dark:border-red-500' : 'border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      {equipmentTypeToBlueprint[type] && iconData.Equipment?.[String(equipmentTypeToBlueprint[type])] && (
                        <img src={`data:image/webp;base64,${iconData.Equipment[String(equipmentTypeToBlueprint[type])]}`} alt={type} className="w-8 h-8 shrink-0" loading="lazy" />
                      )}
                      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 truncate min-w-12">{t_g(equipmentTypeLabelKey[type])}</span>
                      <CustomNumberInput
                        value={owned}
                        onChange={(e) => setBlueprint(type, Math.max(0, Math.min(9999, e || 0)))}
                        min={0}
                        max={9999}
                        className="w-12 text-center text-xs font-mono py-0.5 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      {used > 0 && <span className={`text-xs font-mono shrink-0 ${status === 'full' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>/{used}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ═══ CENTER: Stage Pane ═══════════════════════════════════════════════ */}
        <div
          className={`flex-col flex-1 min-w-0 overflow-hidden bg-white dark:bg-neutral-900
          ${mobilePane !== 'stages' ? 'hidden lg:flex' : 'flex'}`}
        >
          {/* Normal / Hard tab bar */}
          <div className="shrink-0 flex items-center border-b border-neutral-200 dark:border-neutral-700">
            {(['Normal', 'Hard'] as const).map((type) => {
              const count = resolvedStages.filter((s) => s.type === type).length;
              return (
                <button
                  key={type}
                  onClick={() => setStageFilter(type)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    stageFilter === type
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${type === 'Normal' ? 'bg-blue-400' : 'bg-red-400'}`} />
                  {type}
                  {count > 0 && <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">{count}</span>}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-1.5 pr-3">
              <button onClick={() => setIsSortedDesc((p) => !p)} className={iconBtn} title={isSortedDesc ? t('equipment.sortAsc') : t('equipment.sortDesc')}>
                {isSortedDesc ? <FaSortAmountDown size={11} /> : <FaSortAmountUp size={11} />}
              </button>
              <button onClick={() => setIsFilterModalOpen(true)} className={`${iconBtn} relative ${itemFilter.size > 0 ? 'border-blue-400 text-blue-500 bg-blue-50 dark:bg-blue-900/30' : ''}`}>
                <FaFilter size={11} />
                {itemFilter.size > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">{itemFilter.size}</span>
                )}
              </button>
            </div>
          </div>

          {/* Hard: student elephant filter */}
          {stageFilter === 'Hard' && hardElephStudents.length > 0 && (
            <div className="shrink-0 flex flex-wrap gap-1.5 items-center px-3 py-1.5 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40">
              <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 shrink-0">{t('equipment.elephStudents')}</span>
              {hardElephStudents.map((studentId) => {
                const student = mergedStudents[studentId];
                const portrait = studentPortraits[studentId];
                const isSelected = hardStudentFilter.has(studentId);
                return (
                  <button
                    key={studentId}
                    onClick={() =>
                      setHardStudentFilter((prev) => {
                        const n = new Set(prev);
                        if (isSelected) {
                          n.delete(studentId);
                        } else {
                          n.add(studentId);
                        }
                        return n;
                      })
                    }
                    title={student?.Name}
                    className={`w-7 h-7 rounded-full border-2 overflow-hidden shrink-0 transition-all ${
                      isSelected ? 'border-blue-500 ring-1 ring-blue-300 dark:ring-blue-700' : 'border-neutral-200 dark:border-neutral-600 opacity-50 hover:opacity-100'
                    }`}
                  >
                    {portrait ? (
                      <img src={`data:image/webp;base64,${portrait}`} alt={student?.Name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-[9px] text-neutral-400">?</div>
                    )}
                  </button>
                );
              })}
              {hardStudentFilter.size > 0 && (
                <button onClick={() => setHardStudentFilter(new Set())} className="text-[10px] text-neutral-400 hover:text-red-400 ml-1">
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Stage list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <StageAccordion
              type={stageFilter}
              stages={resolvedStages}
              itemFilter={itemFilter}
              isSortedDesc={isSortedDesc}
              runCounts={runCounts}
              onRunCountChange={setRunCount}
              onReset={stageFilter === 'Hard' ? handleResetHard : handleResetNormal}
              farmingDays={farmingDays}
              needsMap={totalEquipmentNeeds}
              eventDataForIcon={eventDataForIcon}
              iconData={iconData}
              // iconInfoData={iconInfoData}
              studentFilter={stageFilter === 'Hard' ? hardStudentFilter : undefined}
            />
          </div>
        </div>

        {/* ═══ RIGHT: Results Pane ═════════════════════════════════════════════ */}
        <div
          className={`flex-col overflow-y-auto bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-700
          ${mobilePane !== 'results' ? 'hidden lg:flex' : 'flex'} w-full lg:flex-1`}
        >
          {/* Stat cards */}
          <div className="shrink-0 p-3 border-b border-neutral-100 dark:border-neutral-800">
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label={t('equipment.statTotalAP')}
                value={totalApUsed.toLocaleString()}
                sub={apByType.hard > 0 ? t('equipment.statAPBreakdown', { normal: apByType.normal.toLocaleString(), hard: apByType.hard.toLocaleString() }) : undefined}
                accent
              />
              <StatCard
                label={t('equipment.statStages')}
                value={activeStageCountByType.normal + activeStageCountByType.hard}
                sub={`N:${activeStageCountByType.normal} H:${activeStageCountByType.hard}`}
              />
              <StatCard
                label={t('equipment.statRemainingEquipment')}
                value={Object.keys(remainingNeeds).length}
                sub={`/ ${Object.keys(totalEquipmentNeeds).length}`}
                warn={Object.keys(remainingNeeds).length > 0}
              />
              <StatCard label={t('equipment.statStudents')} value={selectedPlanUuids.size} sub={`/ ${growthPlans.length}`} />
            </div>
          </div>

          {/* Hard mode + Optimize */}
          <div className="shrink-0 p-3 border-b border-neutral-100 dark:border-neutral-800">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">{t('equipment.hardModeTitle')}</p>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {[
                { mode: 'aggressive' as const, label: t('equipment.hardModeAggressive'), desc: t('equipment.hardModeAggressiveDesc') },
                { mode: 'optimized' as const, label: t('equipment.hardModeOptimized'), desc: t('equipment.hardModeOptimizedDesc') },
                { mode: 'combined' as const, label: t('equipment.hardModeCombined'), desc: t('equipment.hardModeCombinedDesc') },
                { mode: 'manual' as const, label: t('equipment.hardModeManual'), desc: t('equipment.hardModeManualDesc') },
              ].map(({ mode, label, desc }) => (
                <button
                  key={mode}
                  onClick={() => setHardMode(mode)}
                  className={`text-left rounded-md p-2 border-2 transition-all ${
                    hardMode === mode ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
                  }`}
                >
                  <div className={`text-[11px] font-bold leading-tight ${hardMode === mode ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-700 dark:text-neutral-200'}`}>{label}</div>
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5 leading-tight">{desc}</div>
                </button>
              ))}
            </div>

            {/* Detailed explanation box */}
            <div className="mb-3 p-2.5 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-[10px] leading-relaxed text-blue-900 dark:text-blue-300">
                {hardMode === 'aggressive' && t('equipment.hardModeAggressiveDetail')}
                {hardMode === 'optimized' && t('equipment.hardModeOptimizedDetail')}
                {hardMode === 'combined' && t('equipment.hardModeCombinedDetail')}
                {hardMode === 'manual' && t('equipment.hardModeManualDetail')}
              </p>
            </div>

            <div className="flex gap-2">
              <SimRunButton isRunning={isOptimizing} onClick={handleOptimize} className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-md transition-colors">
                {t('equipment.optimize')}
              </SimRunButton>
              <button
                onClick={handleResetAll}
                disabled={isOptimizing}
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {t('equipment.resetAllRuns')}
              </button>
            </div>
          </div>

          {/* Summary tabs */}
          <div className="shrink-0 border-b border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-0.5 px-2 pt-2 flex-wrap">
              {[
                { mode: 'total' as const, label: t('equipment.summaryTabTotal') },
                { mode: 'farmed' as const, label: t('equipment.summaryTabFarmed') },
                { mode: 'remaining' as const, label: t('equipment.summaryTabRemaining') },
                { mode: 'surplus' as const, label: t('equipment.summaryTabSurplus') },
                ...(Object.keys(blueprintsUsedForDisplay).length > 0 ? [{ mode: 'blueprint' as const, label: t('equipment.summaryTabBlueprint') }] : []),
              ].map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => setSummaryTabMode(mode)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                    summaryTabMode === mode ? 'bg-blue-500 text-white' : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  {label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setSummarySortMode('tier')}
                  className={`${iconBtn} ${summarySortMode === 'tier' ? 'border-blue-400 text-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  title={t('equipment.sortByTierOrder')}
                >
                  <FaLayerGroup size={10} />
                </button>
                <button
                  onClick={() => setSummarySortMode('id')}
                  className={`${iconBtn} ${summarySortMode === 'id' ? 'border-blue-400 text-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  title={t('equipment.sortByIDOrder')}
                >
                  <FaSortNumericDown size={10} />
                </button>
                <button
                  onClick={() => setSummarySortMode('amount')}
                  className={`${iconBtn} ${summarySortMode === 'amount' ? 'border-blue-400 text-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  title={t('equipment.sortByAmountOrder')}
                >
                  <FaSortDesc size={10} />
                </button>
              </div>
            </div>
            <div className="pb-2" />
          </div>

          {/* Summary panel */}
          <div className="shrink-0">
            <EquipmentSummaryPanel items={sortedItems} emptyText={emptyText} eventDataForIcon={eventDataForIcon} iconData={iconData} /*iconInfoData={iconInfoData}*/ panelClassName={panelColor} />
          </div>

          {/* Blueprint exhaustion tab: detailed breakdown by item */}
          {summaryTabMode === 'blueprint' && (
            <BlueprintUsageDetail blueprintsUsedByItem={blueprintsUsedByItem} blueprintsUsed={blueprintsUsed} eventDataForIcon={eventDataForIcon} iconData={iconData} />
          )}

          {/* Farming plan */}
          {Object.values(runCounts).some((c) => c > 0) &&
            (() => {
              const active = resolvedStages.filter((s) => (runCounts[s.id] || 0) > 0).sort((a, b) => a.id - b.id);
              const normal = active.filter((s) => s.type === 'Normal');
              const hard = active.filter((s) => s.type === 'Hard');
              return (
                <div className="shrink-0 border-t border-neutral-100 dark:border-neutral-800 px-3 py-2">
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <p className="text-xs font-semibold text-neutral-400 dark:text-neutral-500">{t('equipment.farmingPlanTitle')}</p>
                    {normal.length > 0 && (
                      <span className="text-[11px] text-blue-500 font-mono">
                        {t('equipment.stageTypeNormal')} {normal.length}
                      </span>
                    )}
                    {hard.length > 0 && (
                      <span className="text-[11px] text-red-400 font-mono">
                        {t('equipment.stageTypeHard')} {hard.length}
                      </span>
                    )}
                  </div>
                  <div className="table w-full">
                    {[...normal, ...hard].map((s) => {
                      const isHard = s.type === 'Hard';
                      const allDrops = Object.entries(s.drops).filter(([k]) => {
                        if (k.startsWith('Equipment_')) {
                          return !(Number(k.split('_')[1]) in blueprintIdToType);
                        }
                        if (k.startsWith('Item_')) {
                          const id = Number(k.split('_')[1]);
                          return id >= 10000 && id <= 29999;
                        }
                        return false;
                      });
                      const topDrops = allDrops
                        .sort(([ka, va], [kb, vb]) => {
                          const aIsEleph = ka.startsWith('Item_');
                          const bIsEleph = kb.startsWith('Item_');
                          if (aIsEleph && !bIsEleph) return -1;
                          if (!aIsEleph && bIsEleph) return 1;
                          return vb - va;
                        })
                        .slice(0, 4);
                      return (
                        <div key={s.id} className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isHard ? 'bg-red-400' : 'bg-blue-400'}`} />
                          <span className="text-sm text-neutral-500 dark:text-neutral-400 font-mono shrink-0">{isHard ? `H${s.chapter}-${s.stageNum}` : `N${s.chapter}-${s.stageNum}`}</span>
                          <b className={`text-sm font-mono shrink-0 ${isHard ? 'text-red-400' : 'text-blue-500'}`}>×{runCounts[s.id]}</b>
                          <span className="text-sm text-neutral-400 dark:text-neutral-500 font-mono shrink-0">{s.ap * (runCounts[s.id] || 0)}AP</span>
                          <span className="flex gap-0.5 ml-auto">
                            {topDrops.map(([k]) => {
                              const isItem = k.startsWith('Item_');
                              const itemId = k.split('_')[1];
                              const src = isItem ? iconData.Item?.[itemId] : iconData.Equipment?.[itemId];
                              return src ? (
                                <EquipmentItemIcon
                                  key={k}
                                  type={isItem ? 'Item' : 'Equipment'}
                                  itemId={k.split('_')[1]}
                                  size={28}
                                  imageOnly
                                  iconData={iconData}
                                  amount={''}
                                  eventData={eventDataForIcon}
                                />
                              ) : // )
                              null;
                            })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
        </div>
      </div>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}
      <EquipmentFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        allFarmableItems={allFarmableItems}
        itemFilter={itemFilter}
        setItemFilter={setItemFilter}
        eventDataForIcon={eventDataForIcon}
        iconData={iconData}
        // iconInfoData={iconInfoData}
      />
    </div>
  );
}
