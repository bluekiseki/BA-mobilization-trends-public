// app/routes/planner.equipment.tsx
import { useMemo, useState, useCallback, useEffect } from 'react';
import { data, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { useEquipmentPlanStore } from '~/store/planner/useEquipmentPlanStore';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { calculatedGrowthNeeds } from '~/utils/calculatedGrowthNeeds';
// import campaignData from '~/data/jp/campaigns.json'
import { createMetaDescriptor } from '~/components/head';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { getInstance } from '~/middleware/i18next';
// import iconDataInfoModule from "~/data/jp/campaign_icon_info.json"
// import iconDataAllModule from "~/data/event/icon_img.json"
import type { Route } from './+types/Equipment';
import type { CampaignData, EventData, IconData, IconInfos, Student, StudentPortraitData } from '~/types/plannerData';
import { FaFilter, FaSortAmountUp, FaSortAmountDown, FaArchive, FaCalculator, FaListAlt, FaBoxOpen, FaPlusCircle, FaLayerGroup, FaSortNumericDown } from 'react-icons/fa';
import { NumberInput } from '~/components/planner/common/NumberInput';
import { StudentGrowthSummaryCard } from '~/components/planner/StudentGrowth/StudentGrowthSummaryCard';
import { useTranslation } from 'react-i18next';
import { localeLink } from '~/utils/localeLink';
import { solveOptimalRuns } from '~/utils/solveFarmingHeuristic';
import { EquipmentItemIcon, getEquipmentTierLabel, resolveGachaGroup, type ResolvedStage } from '~/components/planner/Equipment/common';
import { PaginatedStageList } from '~/components/planner/Equipment/StageList';
import { EquipmentFilterModal } from '~/components/planner/Equipment/EquipmentFilterModal';
import { EquipmentInventoryModal } from '~/components/planner/Equipment/EquipmentInventoryModal';
import { EquipmentSummaryPanel } from '~/components/planner/Equipment/EquipmentSummaryPanel';
import { cdn } from '~/utils/cdn';

// ... loader ...
export async function loader({ context, params, request }: LoaderFunctionArgs) {
  // ... (loader logic is ) ...
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  const siteTitle = i18n.t("home:title");
  const title: string = i18n.t("planner:page.equipmentFarmingPlanner", "Equipment Farming Planner");
  const description: string = i18n.t("planner:page.description.equipmentFarmingPlanner");
  
  return data({
    siteTitle, title, description, locale,
    // campaigns: campaignData as CampaignData,
    // iconInfoData: iconDataInfoModule as unknown as IconInfos,
    // iconData: iconDataAllModule as unknown as IconData,
    // studentData,
    // studentPortraits,
  });
}
// ... meta ...
export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(
    loaderData.title + ' | ' + loaderData.siteTitle,
    loaderData.description,
    "/img/p.webp"
  );
}

export default function EquipmentPlannerPage() {
  const {
    // campaigns,
    // iconInfoData,
    // iconData,
    title
  } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation("planner"); //
  const locale = i18n.language as Locale

  // --- UI State ---
  const [stageFilter, setStageFilter] = useState<'Normal' | 'Hard'>('Normal'); // 'all' |
  const [isSortedDesc, setIsSortedDesc] = useState(false);
  const [itemFilter, setItemFilter] = useState(new Set<string>());
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [selectedPlanUuids, setSelectedPlanUuids] = useState(new Set<string>());
  const [summarySortMode, setSummarySortMode] = useState<'tier' | 'id' | 'amount'>('tier');
  const [studentData, setStudentData] = useState<Record<string, Student> | null>(null);
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData>({});
  const [iconData, setIconData] = useState<IconData>({});
  const [campaigns, setCampaignData] = useState<CampaignData>()
    const [iconInfoData, setIconInfoData] = useState<IconInfos>({
    Item: {},
    Equipment: {},
    Furniture: {},
    Currency: {},
    Emblem: {},
    GachaGroup: {},
  });

  useEffect(() => {
    fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.json`)).then(res => res.json() as any).then(setStudentData).catch(e => console.error(e));
    fetch(cdn(`/w/students_portrait.json`)).then(res => res.json() as any).then(setStudentPortraits).catch(e => console.error(e));
    fetch(cdn(`/ew/icon_img.json`)).then(res => res.json() as any).then(setIconData).catch(e => console.error(e));
    fetch(cdn(`/ew/icon_info.json`)).then(res => res.json() as any).then(setIconInfoData).catch(e => console.error(e));
    fetch(cdn(`/w/campaigns.json`)).then(res => res.json() as any).then(setCampaignData).catch(e => console.error(e));
  }, [locale]);

  // 5-2. Merge allStudents and portraits data
  const mergedStudents = useMemo(() => {
    const students = studentData;
    const portraits = studentPortraits;

    if (!students) return {}
    if (!portraits) return {}

    Object.keys(students).forEach(studentIdStr => {
      const studentId = Number(studentIdStr)
      if (portraits[studentId]) {
        students[studentIdStr].Portrait = portraits[studentId];
      }
    });
    return students;
  }, [studentData, studentPortraits]);

  // 1. Load Data/State
  const resolvedStages = useMemo((): ResolvedStage[] => {
    const stages = campaigns;
    const iconInfo = iconInfoData;
    console.log('resolvedStages return')
    if (!stages) return []

    return Object.entries(stages).map(([stageId, stageData]) => {
      const drops: Record<string, number> = {};
      const apCost = stageData.AP;
      stageData.Reward.forEach(reward => {
        const prob = reward.StageRewardProb / 10000;
        const type = reward.StageRewardParcelTypeStr;
        const id = reward.StageRewardId;
        const key = `${type}_${id}`;
        if (type === 'Equipment' || type === 'Item') {
          drops[key] = (drops[key] || 0) + prob;
        } else if (type === 'GachaGroup') {
          const gachaRewards = resolveGachaGroup(id, iconInfo);
          for (const [eqKey, eqProb] of Object.entries(gachaRewards)) {
            drops[eqKey] = (drops[eqKey] || 0) + (prob * eqProb);
          }
        }
      });

      return {
        id: Number(stageId), type: stageData.Type, name: stageData.Name,
        chapter: stageData.Chapter, stageNum: stageData.Stage,
        ap: apCost, drops: drops,
      };
    });
  }, [campaigns, iconInfoData]);


  // Load total required materials from Student Growth Plan
  const { growthPlans } = useGlobalStore();
  // --- Reflect Student Selection Logic ---
  const selectedPlans = useMemo(() => {
    console.log('selectedPlans - return')
    return growthPlans.filter(p => selectedPlanUuids.has(p.uuid));
  }, [growthPlans, selectedPlanUuids]);

  const totalEquipmentNeeds = useMemo(() => {
    //  growthPlans -> selectedPlans
    const needs = calculatedGrowthNeeds(selectedPlans, mergedStudents);
    return Object.fromEntries(
      Object.entries(needs).filter(([key]) => key.startsWith('Equipment_') && !['Equipment_1', 'Equipment_2', 'Equipment_3', 'Equipment_4'].includes(key))
    );
  }, [selectedPlans, mergedStudents]);

  // Equipment Farming Plan Store
  const {
    runCounts, farmingDays, normalMultiplier, hardMultiplier,
    setRunCount, setFarmingDays, setMultipliers, setRunCounts,
    inventory, setInventoryItem
  } = useEquipmentPlanStore();

  // 2. Core Calculation: Current Farmed Amount / Remaining Required Amount
  const farmedByPlan = useMemo(() => {
    const farmed: Record<string, number> = {};
    for (const stage of resolvedStages) {
      const runs = runCounts[stage.id] || 0;
      if (runs === 0) continue;
      const multiplier = stage.type === 'Normal' ? normalMultiplier : hardMultiplier;
      for (const [eqKey, baseDrop] of Object.entries(stage.drops)) {
        farmed[eqKey] = (farmed[eqKey] || 0) + (baseDrop * runs * multiplier);
      }
    }
    return farmed;
  }, [runCounts, resolvedStages, normalMultiplier, hardMultiplier]);

  const remainingNeeds = useMemo(() => {
    // ... (Logic same, reflect inventory) ...
    const remaining: Record<string, number> = {};
    for (const [key, amount] of Object.entries(totalEquipmentNeeds)) {
      const have = inventory[key] || 0;
      const farmed = farmedByPlan[key] || 0;
      const needed = amount - have - farmed;
      if (needed > 0) {
        remaining[key] = needed;
      }
    }
    return remaining;
  }, [totalEquipmentNeeds, farmedByPlan, inventory]);

  const surplusGoods = useMemo(() => {
    const surplus: Record<string, number> = {};
    const allFarmed = { ...farmedByPlan };

    // Add owned equipment to "Farmed" count as well
    for (const [key, amount] of Object.entries(inventory)) {
      allFarmed[key] = (allFarmed[key] || 0) + amount;
    }
    // (Owned + Farmed) - Total Required
    for (const [key, amount] of Object.entries(allFarmed)) {
      const needed = totalEquipmentNeeds[key] || 0;
      const surplusAmount = amount - needed;
      if (surplusAmount > 0) {
        surplus[key] = surplusAmount;
      }
    }
    return surplus;
  }, [totalEquipmentNeeds, farmedByPlan, inventory]);

  const totalApUsed = useMemo(() => {
    return Math.round(resolvedStages.reduce((total, stage) => {
      const runs = runCounts[stage.id] || 0;
      return total + (runs * stage.ap);
    }, 0));
  }, [runCounts, resolvedStages]);



  // --- 4. Optimizer Handler (Logic same) ---
  const handleOptimizeHard = () => {
    const newRunCounts = { ...runCounts };
    const neededItemsSet = new Set(Object.keys(remainingNeeds));
    const relevantHardStages = resolvedStages.filter(stage =>
      stage.type === 'Hard' &&
      Object.keys(stage.drops).length > 0 &&
      Object.keys(stage.drops).some(dropKey => neededItemsSet.has(dropKey))
    );
    relevantHardStages.forEach(stage => {
      const maxRuns = farmingDays * 3;
      newRunCounts[stage.id] = maxRuns;
    });
    setRunCounts(newRunCounts);
  };

  const handleOptimizeNormal = useCallback(() => {
    // 1. Optimization Target Stages (Normal)
    const optimizableStages = resolvedStages.filter(s =>
      s.type === 'Normal' &&
      Object.keys(s.drops).length > 0 &&
      s.ap > 0
    );
    if (optimizableStages.length === 0) return;

    // 2. List of remaining required materials (IDs only)
    const neededItemKeys = Object.keys(remainingNeeds);
    if (neededItemKeys.length === 0) return; // No need to optimize
    const neededAmounts = neededItemKeys.map(key => remainingNeeds[key]);

    // 3. Create data structure required for Simplex
    // const stageMap = new Map(optimizableStages.map((s, i) => [s.id, i]));
    const itemMap = new Map(neededItemKeys.map((key, i) => [key, i]));
    const numStages = optimizableStages.length;
    const numItems = neededItemKeys.length;
    const dropMatrix = Array(numStages).fill(0).map(() => Array(numItems).fill(0));
    const apCosts = Array(numStages).fill(0);
    for (let i = 0; i < numStages; i++) {
      const stage = optimizableStages[i];
      apCosts[i] = stage.ap; // Objective (Minimize)
      for (const [dropKey, dropRate] of Object.entries(stage.drops)) {
        if (itemMap.has(dropKey)) {
          const itemIndex = itemMap.get(dropKey)!;
          // Constraints (Ax >= b)
          dropMatrix[i][itemIndex] = dropRate * normalMultiplier;
        }
      }
    }

    // 4. Call Simplex Solver
    const additionalRunsArray = solveOptimalRuns({
      dropMatrix,
      apCosts,
      neededAmounts,
      priorities: Array(numStages).fill(false), // Normal optimization has no priority
    });

    // 5. Apply Results
    const newRunCounts = { ...runCounts };
    for (let i = 0; i < numStages; i++) {
      if (additionalRunsArray[i] > 0) {
        const stageId = optimizableStages[i].id;
        // *Add* the Normal value calculated by Simplex to the existing Hard/Normal values
        newRunCounts[stageId] = (newRunCounts[stageId] || 0) + Math.round(additionalRunsArray[i]);
      }
    }
    setRunCounts(newRunCounts);
  }, [resolvedStages, remainingNeeds, normalMultiplier, runCounts, setRunCounts]);
  // --- End of Optimizer ---

  // --- Reset Handler ---
  const handleResetAll = useCallback(() => { setRunCounts({}); }, [setRunCounts]);
  const handleResetHard = useCallback(() => {
    const normalRunCounts = Object.fromEntries(
      Object.entries(runCounts).filter(([stageId]) => {
        const stage = resolvedStages.find(s => s.id === Number(stageId));
        return stage && stage.type === 'Normal';
      })
    );
    setRunCounts(normalRunCounts);
  }, [runCounts, resolvedStages, setRunCounts]);
  const handleResetNormal = useCallback(() => {
    const hardRunCounts = Object.fromEntries(
      Object.entries(runCounts).filter(([stageId]) => {
        const stage = resolvedStages.find(s => s.id === Number(stageId));
        return stage && stage.type === 'Hard';
      })
    );
    setRunCounts(hardRunCounts);
  }, [runCounts, resolvedStages, setRunCounts]);
  // ---
  // eventData prop to pass to ItemIcon
  const eventDataForIcon = useMemo(() => ({
    icons: iconInfoData
  }) as EventData, [iconInfoData]);
  // --- Filtering/Sorting Logic ---
  const allFarmableItems = useMemo(() => {
    const items = new Set<string>();
    resolvedStages.forEach(stage => {
      Object.keys(stage.drops).forEach(dropKey => {
        if (!['Equipment_1', 'Equipment_2', 'Equipment_3', 'Equipment_4'].includes(dropKey)) {
          items.add(dropKey)
        }
      });
    });
    return Array.from(items).sort((keyA, keyB) => {
      const idA = parseInt(keyA.split('_')[1], 10);
      const idB = parseInt(keyB.split('_')[1], 10);
      const itemInfoA = iconInfoData.Equipment?.[idA];
      const itemInfoB = iconInfoData.Equipment?.[idB];
      const tierLabelA = getEquipmentTierLabel(itemInfoA);
      const tierLabelB = getEquipmentTierLabel(itemInfoB);
      const tierA = tierLabelA ? parseInt(tierLabelA) : 0;
      const tierB = tierLabelB ? parseInt(tierLabelB) : 0;
      if (tierA !== tierB) {
        return tierB - tierA; // High Tier First
      }
      return idA - idB; // ID Ascending

    });
  }, [resolvedStages]);


  // const filteredAndSortedStages = useMemo(() => {
  //   let stages = resolvedStages
  //     .filter(s => Object.keys(s.drops).length > 0);

  //   // Apply Currency Filter here (Remove duplicate logic in child components)
  //   if (itemFilter.size > 0) {
  //     stages = stages.filter(stage =>
  //       Object.keys(stage.drops).some(dropKey => itemFilter.has(dropKey))
  //     );
  //   }

  //   // Apply Sorting here as well (Remove duplicate logic in child components)
  //   if (isSortedDesc) {
  //     return stages.sort((a, b) => b.id - a.id);
  //   }
  //   return stages.sort((a, b) => a.id - b.id);
  // }, [resolvedStages, isSortedDesc, itemFilter]);

  const getSortedEquipmentList = useCallback((
    items: Record<string, number>,
    sortMode: 'tier' | 'id' | 'amount'
  ): [string, number][] => {
    const entries = Object.entries(items);
    entries.sort((a, b) => {
      const [keyA, amountA] = a;
      const [keyB, amountB] = b;
      if (sortMode === 'amount') {
        return amountB - amountA; // By Count Descending
      }
      const idA = parseInt(keyA.split('_')[1], 10);
      const idB = parseInt(keyB.split('_')[1], 10);
      if (sortMode === 'id') {
        return idA - idB; // ID Ascending
      }
      if (sortMode === 'tier') {
        // Tier Order (High Tier -> Low Tier -> ID Order)
        const itemInfoA = iconInfoData.Equipment?.[idA];
        const itemInfoB = iconInfoData.Equipment?.[idB];
        const tierLabelA = getEquipmentTierLabel(itemInfoA);
        const tierLabelB = getEquipmentTierLabel(itemInfoB);
        const tierA = tierLabelA ? parseInt(tierLabelA) : 0;
        const tierB = tierLabelB ? parseInt(tierLabelB) : 0;
        if (tierA !== tierB) {
          return tierB - tierA; // High Tier First
        }
        return idA - idB; // ID Ascending
      }
      return 0;
    });
    return entries;
  }, [iconInfoData.Equipment]); // iconInfoData comes from loader, so it is immutable

  const sortedTotalNeeds = useMemo(
    () => getSortedEquipmentList(totalEquipmentNeeds, summarySortMode),
    [totalEquipmentNeeds, summarySortMode, getSortedEquipmentList]
  );

  const sortedFarmedByPlan = useMemo(
    () => getSortedEquipmentList(farmedByPlan, summarySortMode),
    [farmedByPlan, summarySortMode, getSortedEquipmentList]
  );

  const sortedRemainingNeeds = useMemo(
    () => getSortedEquipmentList(remainingNeeds, summarySortMode),
    [remainingNeeds, summarySortMode, getSortedEquipmentList]
  );

  const sortedSurplusGoods = useMemo(
    () => getSortedEquipmentList(surplusGoods, summarySortMode),
    [surplusGoods, summarySortMode, getSortedEquipmentList]
  );

  // --- Student Selection Handler ---
  const handleTogglePlan = useCallback((uuid: string) => {
    setSelectedPlanUuids(prev => {
      const newSet = new Set(prev);
      if (newSet.has(uuid)) {
        newSet.delete(uuid);
      } else {
        newSet.add(uuid);
      }
      return newSet;
    });
  }, []);

  const handleSelectAllPlans = useCallback(() => {
    setSelectedPlanUuids(new Set(growthPlans.map(p => p.uuid)));
  }, [growthPlans]);

  const handleDeselectAllPlans = useCallback(() => {
    setSelectedPlanUuids(new Set());
  }, []);
  // ---


  // Define Tailwind CSS classes
  const tabButtonClass = "px-4 py-2 text-sm font-semibold rounded-md transition-colors";
  const activeTabClass = "bg-blue-600 text-white";
  const inactiveTabClass = "bg-gray-200 dark:bg-neutral-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-neutral-600";
  const resetButtonClass = "text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1";

  return (
    <div className="max-w-7xl mx-auto p-4">
      <h1 className="text-2xl font-bold dark:text-gray-100">{title} (BETA)</h1>
      {/* === Settings Panel === */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4 p-4 bg-white dark:bg-neutral-800 rounded-lg shadow">
        <label className="block">
          <span className="font-semibold text-gray-700 dark:text-gray-300">{t('equipment.farmingDays')}</span>
          <NumberInput
            value={farmingDays}
            onChange={val => setFarmingDays(val || 1)}
            min={1}
            max={999}
          />
        </label>
        <label className="block">
          <span className="font-semibold text-gray-700 dark:text-gray-300">{t('equipment.normalMultiplier')}</span>
          <select
            value={normalMultiplier}
            onChange={e => setMultipliers('normal', Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm dark:bg-neutral-700 dark:border-neutral-600 focus:border-blue-500 focus:ring-blue-500"
          >
            <option value={1}>1x</option><option value={2}>2x</option><option value={3}>3x</option>
          </select>
        </label>
        <label className="block">
          <span className="font-semibold text-gray-700 dark:text-gray-300">{t('equipment.hardMultiplier')}</span>
          <select
            value={hardMultiplier}
            onChange={e => setMultipliers('hard', Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm dark:bg-neutral-700 dark:border-neutral-600 focus:border-blue-500 focus:ring-blue-500"
          >
            <option value={1}>1x</option><option value={2}>2x</option><option value={3}>3x</option>
          </select>
        </label>
      </div>

      <div className="flex justify-end items-center gap-2 my-4">
        <span className="text-sm font-semibold dark:text-gray-300">{t('equipment.summarySort')}</span>
        <button
          onClick={() => setSummarySortMode('tier')}
          className={`${tabButtonClass} ${summarySortMode === 'tier' ? activeTabClass : inactiveTabClass}`}
        >
          <FaLayerGroup className="inline sm:mr-1" /> <span className="hidden sm:inline">{t('equipment.sortByTier')}</span>
        </button>
        <button
          onClick={() => setSummarySortMode('id')}
          className={`${tabButtonClass} ${summarySortMode === 'id' ? activeTabClass : inactiveTabClass}`}
        >
          <FaSortNumericDown className="inline sm:mr-1" /> <span className="hidden sm:inline">{t('equipment.sortById')}</span>
        </button>
        <button
          onClick={() => setSummarySortMode('amount')}
          className={`${tabButtonClass} ${summarySortMode === 'amount' ? activeTabClass : inactiveTabClass}`}
        >
          <FaSortAmountDown className="inline sm:mr-1" /> <span className="hidden sm:inline">{t('equipment.sortByAmount')}</span>
        </button>
      </div>

      {/* --- Select Student Growth Plan --- */}
      <div className="my-4 space-y-3">
        <div>
          <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-2 gap-2">
            <h2 className="text-lg font-semibold dark:text-gray-200 flex items-center gap-2">
              <FaArchive /> {t('equipment.selectPlansTitle')}
            </h2>
            <div className="flex gap-2 items-center">
              <Link
                to={localeLink(locale, "/planner/students")}
                className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <FaPlusCircle />
                {t('equipment.addEditPlans')}
              </Link>
              <div className="h-4 w-px bg-gray-300 dark:bg-neutral-600"></div> {/* Divider */}
              <button
                onClick={handleSelectAllPlans}
                className="text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 px-3 py-1 rounded-md"
              >
                {t('equipment.selectAll')}
              </button>
              <button
                onClick={handleDeselectAllPlans}
                className="text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-neutral-700 dark:text-gray-200 px-3 py-1 rounded-md"
              >
                {t('equipment.deselectAll')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {growthPlans.map(plan => (
              <StudentGrowthSummaryCard
                key={plan.uuid}
                plan={plan}
                allStudents={mergedStudents}
                studentPortraits={studentPortraits}
                isSelected={selectedPlanUuids.has(plan.uuid)}
                onClick={() => handleTogglePlan(plan.uuid)}
                showEquipment={true}
              />
            ))}
            {growthPlans.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 md:col-span-2 py-8 px-4 bg-gray-50 dark:bg-neutral-800/50 rounded-lg">
                <p className="font-semibold dark:text-gray-200">{t("ui.noStudentGrowthPlan")}</p>
                <p className="text-sm mt-2">
                  <Link to={localeLink(locale, "/planner/students")} className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                    [{t('page.studentGrowthPlanner')}]
                  </Link>
                  {" "}
                  {t("ui.startByAddingNewPlan")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* === Summary Panel === */}
      <div className="my-4 space-y-3">
        <div>
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-lg font-semibold dark:text-gray-200 flex items-center gap-2">
              <FaListAlt /> {t('equipment.totalNeeded')}
            </h2>
            <button
              onClick={() => setIsInventoryModalOpen(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline relative"
            >
              <FaBoxOpen />
              {t('equipment.editInventory')}
              {Object.keys(inventory).length > 0 && (
                <span className="absolute -top-1 -right-2 flex h-3 w-3">
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </span>
              )}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 p-3 bg-gray-100 dark:bg-neutral-800 rounded-md mt-1 max-h-80 overflow-y-scroll scrollbar-thin">
            {sortedTotalNeeds.length > 0 ? sortedTotalNeeds.map(([key, amount]) => {
              const itemType = key.split('_')[0] as keyof IconInfos;
              const itemId = key.split('_')[1];
              return (
                <EquipmentItemIcon
                  key={key} type={itemType} itemId={itemId} amount={amount} size={13}
                  eventData={eventDataForIcon} iconData={iconData} 
                />
              )
            }) : <span className="text-sm text-gray-500 dark:text-gray-400">{t('equipment.noItemsNeeded')}</span>}
          </div>
        </div>

        <EquipmentSummaryPanel
          title={t('equipment.farmedByPlan')}
          icon={FaCalculator}
          items={sortedFarmedByPlan}
          emptyText={t('equipment.noFarmingPlan')}
          eventDataForIcon={eventDataForIcon}
          iconData={iconData}
          iconInfoData={iconInfoData}
          panelClassName="bg-blue-50 dark:bg-blue-900/30"
        />

        <EquipmentSummaryPanel
          title={t('equipment.remainingNeeds')}
          icon={FaListAlt}
          items={sortedRemainingNeeds}
          emptyText={t('equipment.noRemainingNeeds')}
          eventDataForIcon={eventDataForIcon}
          iconData={iconData}
          iconInfoData={iconInfoData}
          panelClassName="bg-red-50 dark:bg-red-900/30"
        />

        <EquipmentSummaryPanel
          title={t('equipment.surplusGoods')}
          icon={FaArchive}
          items={sortedSurplusGoods}
          emptyText={t('equipment.noSurplusGoods')}
          eventDataForIcon={eventDataForIcon}
          iconData={iconData}
          iconInfoData={iconInfoData}
          panelClassName="bg-green-50 dark:bg-green-900/30"
        />
      </div>

      {/* Total Used AP Panel */}
      <div className="my-4 p-4 bg-white dark:bg-neutral-800 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{t('equipment.totalApUsed')}</h3>
        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">
          {totalApUsed.toLocaleString()} AP
        </p>
      </div>
      {/* Optimize Button */}
      <div className="flex flex-col sm:flex-row gap-4 my-4">
        <button onClick={handleOptimizeHard} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors">
          {t('equipment.optimizeHard')}
        </button>
        <button onClick={handleOptimizeNormal} className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors">
          {t('equipment.optimizeNormal')}
        </button>
        <button onClick={handleResetAll} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors">
          {t('equipment.resetAllRuns')}
        </button>
      </div>

      {/* Stage Filter Button (Remove Owned Equipment Button) */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4 justify-between">
        {/* 1. Type Filter */}
        <div className="flex gap-2">
          <button onClick={() => setStageFilter('Normal')} className={`${tabButtonClass} ${stageFilter === 'Normal' ? activeTabClass : inactiveTabClass}`}>
            Normal
          </button>
          <button onClick={() => setStageFilter('Hard')} className={`${tabButtonClass} ${stageFilter === 'Hard' ? activeTabClass : inactiveTabClass}`}>
            Hard
          </button>
        </div>

        {/* 2. Sort and Currency Filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setIsSortedDesc(prev => !prev)}
            className={`${tabButtonClass} ${inactiveTabClass} flex items-center gap-2`}
            title={t(isSortedDesc ? 'equipment.sortAsc' : 'equipment.sortDesc')}
          >
            {isSortedDesc ? <FaSortAmountDown /> : <FaSortAmountUp />}
            <span className="hidden sm:inline">
              {t(isSortedDesc ? 'equipment.sortOrderDesc' : 'equipment.sortOrderAsc')}
            </span>
          </button>
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className={`${tabButtonClass} ${itemFilter.size > 0 ? activeTabClass : inactiveTabClass} flex items-center gap-2 relative`}
          >
            <FaFilter />
            <span className="hidden sm:inline">{t('equipment.itemFilter')}</span>
            {itemFilter.size > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500 text-white text-xs items-center justify-center">
                  {itemFilter.size}
                </span>
              </span>
            )}
          </button>
        </div>
      </div>

      {/* === Stage List Panel (Hard) === */}
      <div className={stageFilter === 'Hard' ? 'mb-6' : 'hidden'}>
        <PaginatedStageList
          title="Hard Stages"
          type="Hard"
          allStages={resolvedStages} // Pass unfiltered full list
          itemFilter={itemFilter}       // Pass filter state
          isSortedDesc={isSortedDesc}   // Pass sort state
          isItemFilterActive={itemFilter.size > 0} // Pass filter active state
          runCounts={runCounts}
          onRunCountChange={setRunCount}
          onReset={handleResetHard}
          resetButtonClass={resetButtonClass}
          farmingDays={farmingDays}
          eventDataForIcon={eventDataForIcon}
          iconData={iconData}
          iconInfoData={iconInfoData}
        />
      </div>

      {/* === Stage List Panel (Normal) === */}
      <div className={stageFilter === 'Normal' ? 'mb-6' : 'hidden'}>
        <PaginatedStageList
          title="Normal Stages"
          type="Normal"
          allStages={resolvedStages} // Pass unfiltered full list
          itemFilter={itemFilter}       // Pass filter state
          isSortedDesc={isSortedDesc}   // Pass sort state
          isItemFilterActive={itemFilter.size > 0} // Pass filter active state
          runCounts={runCounts}
          onRunCountChange={setRunCount}
          onReset={handleResetNormal}
          resetButtonClass={resetButtonClass}
          farmingDays={farmingDays}
          eventDataForIcon={eventDataForIcon}
          iconData={iconData}
          iconInfoData={iconInfoData}
        />
      </div>

      {/* Render Filter Modal */}
      <EquipmentFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        allFarmableItems={allFarmableItems}
        itemFilter={itemFilter}
        setItemFilter={setItemFilter}
        eventDataForIcon={eventDataForIcon}
        iconData={iconData}
        iconInfoData={iconInfoData}
      />

      {/* Render Owned Equipment Modal */}
      <EquipmentInventoryModal
        isOpen={isInventoryModalOpen}
        onClose={() => setIsInventoryModalOpen(false)}
        allFarmableItems={allFarmableItems}
        inventory={inventory}
        setInventoryItem={setInventoryItem}
        eventDataForIcon={eventDataForIcon}
        iconData={iconData}
        iconInfoData={iconInfoData}
      />
    </div>
  );
}