// app/components/planner/ResourceEfficiencyPanel.tsx
import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import type { EventData, IconData, StudentData, StudentPortraitData } from '~/types/plannerData';
import type { MainTabId } from './event/EventPlanner';
import { ItemIcon } from './common/Icon';
import { NumberInput } from './common/NumberInput';
import { SimRunButton } from './common/SimRunButton';
import { getItemName } from './common/locale';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';
import {
  buildResourceApIndex,
  buildCumulativeCurve,
  getEventDurationDays,
  hasSimulatedResourceSource,
  type StageWithType,
  type ApSegment,
  type ResourceApIndex,
  type SourceLabelKey,
  type FarmingPlanEntry,
} from '~/utils/resourceApCost';
import { ApFlowSankeyChart } from './common/ApFlowSankeyChart';
import type { TotalBonusMap } from './BonusSelector';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { calcElephNeeded } from '~/utils/elephEligmaCalc';
import { starGrowthCost, uwGrowthCost } from '~/data/growthData';
import { runAsync } from '~/utils/runAsync';

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
const simIndexCache = new Map<number, { totalBonusKey: string; index: ResourceApIndex }>();

interface ResourceEfficiencyPanelProps {
  eventId: number;
  eventData: EventData;
  allStages: StageWithType[];
  iconData: IconData;
  allStudents: StudentData;
  studentPortraits: StudentPortraitData;
  availableAp: number;
  totalBonus: TotalBonusMap;
  onNavigateToTab?: (tabId: MainTabId) => void;
}

function renderSourceLabel(label: SourceLabelKey, t: ReturnType<typeof useTranslation>['t']): string {
  return label.parts
    .map((part) => {
      if (part.type === 'key') return t(part.value);
      return part.value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(label.params?.[key] ?? ''));
    })
    .join('');
}

// Format axis tick as compact label; keep 2 significant digits (e.g. 1.0k, 12.5k, 2M).
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

export function resolveLabel(key: string, eventData: EventData, allStudents: StudentData, locale: Locale): string {
  const sep = key.lastIndexOf('_');
  if (sep < 0) return key;
  const type = key.slice(0, sep);
  const id = key.slice(sep + 1);
  if (type === 'Character') return allStudents[Number(id)]?.Name ?? key;
  return getItemName(key, eventData.icons, locale);
}

export const ResourceEfficiencyPanel = ({ eventId, eventData, allStages, iconData, allStudents, studentPortraits, availableAp, totalBonus, onNavigateToTab }: ResourceEfficiencyPanelProps) => {
  const { t, i18n } = useTranslation(['planner', 'game']);
  const locale = i18n.language as Locale;
  const matcher = useSearchMatcher(locale);
  const [search, setSearch] = useState('');
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

  // Simulations opt-in (expensive). Computed in click handler to avoid StrictMode double-invoke.
  const [simIndex, setSimIndex] = useState<ResourceApIndex | null>(() => {
    const cached = simIndexCache.get(eventId);
    return cached && cached.totalBonusKey === JSON.stringify(totalBonus) ? cached.index : null;
  });
  const [isCalculatingSimulations, setIsCalculatingSimulations] = useState(false);
  const canIncludeSimulations = useMemo(() => hasSimulatedResourceSource(eventData), [eventData]);
  const handleIncludeSimulations = useCallback(() => {
    setIsCalculatingSimulations(true);
    void runAsync(() => buildResourceApIndex({ allStages, eventData, eventId, totalBonus, includeSimulations: true }))
      .then((index) => {
        simIndexCache.set(eventId, { totalBonusKey: JSON.stringify(totalBonus), index });
        setSimIndex(index);
      })
      .finally(() => setIsCalculatingSimulations(false));
  }, [allStages, eventData, eventId, totalBonus]);
  const includeSimulations = simIndex !== null;

  // Fast path safe as useMemo; simIndex takes over after opt-in.
  const fastIndex = useMemo(() => buildResourceApIndex({ allStages, eventData, eventId, totalBonus, includeSimulations: false }), [allStages, eventData, eventId, totalBonus]);
  const resourceApIndex = simIndex ?? fastIndex;
  const resourceKeys = resourceApIndex.resourceKeys;
  // Prefer farmable Item_id Eleph over one-time Character_id.
  const defaultKey = useMemo(() => {
    const studentElephKey = resourceKeys.find((k) => {
      if (!k.startsWith('Item_')) return false;
      const id = Number(k.slice('Item_'.length));
      if (!allStudents[id]) return false;
      return resourceApIndex.resolveProfile(k).segments.length > 0;
    });
    if (studentElephKey) return studentElephKey;
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
    if (!q) return [];
    return resourceKeys
      .map((key) => ({ key, label: resolveLabel(key, eventData, allStudents, locale) }))
      .filter((r) => {
        if (matcher(r.label, q)) return true;
        if (r.key.toLowerCase().includes(q.toLowerCase())) return true;
        // Match by student nicknames for Eleph/shard items.
        const sep = r.key.lastIndexOf('_');
        const id = Number(r.key.slice(sep + 1));
        const student = allStudents[id];
        return student?.SearchTags?.some((tag) => matcher(tag, q)) ?? false;
      });
  }, [search, resourceKeys, eventData, allStudents, locale, matcher]);

  const activeLabel = activeKey ? resolveLabel(activeKey, eventData, allStudents, locale) : null;

  const profile = useMemo(() => {
    if (!activeKey) return null;
    return resourceApIndex.resolveProfile(activeKey);
  }, [activeKey, resourceApIndex]);

  // Mark star/UW upgrade thresholds as horizontal lines for student Eleph.
  const { growthPlans, materialInventory, updateMaterialInventory } = useGlobalStore();
  // Owned-amount is global inventory; changes reflect elsewhere.
  const ownedAmount = activeKey ? (materialInventory[activeKey] ?? 0) : 0;
  const isStudentEleph = activeKey?.startsWith('Item_') && !!allStudents[Number(activeKey.slice('Item_'.length))];
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
      .map((o) => ({ apCost: o.apCost as number, amount: o.amount, source: o.source, sourceLabel: o.sourceLabel }));
    return [...profile.segments, ...extra].sort((a, b) => b.amount / b.apCost - a.amount / a.apCost);
  }, [profile]);

  // Free contributions + owned amount form baseline.
  const freeBaseline = useMemo(() => (profile?.oneTimeContributions.filter((o) => o.apCost === undefined).reduce((a, o) => a + o.amount, 0) ?? 0) + ownedAmount, [profile, ownedAmount]);

  // Graph width: max of event duration or player's AP supply.
  const maxAp = useMemo(() => {
    const finiteCost = graphSegments.filter((s) => !s.repeatsForever).reduce((a, s) => a + s.apCost, 0);
    const eventWindowAp = getEventDurationDays({ allStages, eventData, eventId }) * ESTIMATED_AP_PER_DAY;
    return Math.max(eventWindowAp, availableAp, finiteCost * 1.2, 1000);
  }, [graphSegments, availableAp, allStages, eventData, eventId]);

  const curve = useMemo(() => {
    if (graphSegments.length === 0) return [];
    const base = buildCumulativeCurve(graphSegments, maxAp);
    return freeBaseline > 0 ? base.map((p) => ({ ...p, amount: p.amount + freeBaseline })) : base;
  }, [graphSegments, maxAp, freeBaseline]);

  if (!activeKey) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('ui.resourceEfficiencyNoData')}</p>;
  }

  // Resource picker and owned-amount input are also pre-calculation UI, so the blur + no-pointer-events treatment covers them too, not just the results below.
  const awaitingSimulation = canIncludeSimulations && !includeSimulations;
  const disabledUntilCalculated = awaitingSimulation ? 'pointer-events-none blur-sm' : '';

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {t('ui.resourceEfficiencyDescriptionBefore')}
        {Object.values(totalBonus).every((v) => v === 0) &&
          (onNavigateToTab ? (
            <button type="button" onClick={() => onNavigateToTab('bonus')} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
              {t('ui.resourceEfficiencyBonusUnset')}
            </button>
          ) : (
            <strong className="font-semibold text-neutral-700 dark:text-neutral-300">{t('ui.resourceEfficiencyBonusUnset')}</strong>
          ))}
        {t('ui.resourceEfficiencyDescriptionAfter')}
      </p>

      {/* Simulated minigame opt-in (excluded until player runs calculation) */}
      {awaitingSimulation && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
          <p className="text-amber-800 dark:text-amber-300">{t('ui.resourceEfficiencySimPrompt')}</p>
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
        <div className={`space-y-6 ${disabledUntilCalculated}`}>
          {/* Resource picker */}
          <div className="relative" ref={searchRef}>
            <input
              type="text"
              placeholder={t('ui.resourceEfficiencySearchPlaceholder')}
              value={search}
              onFocus={() => setIsOpen(true)}
              onChange={(e) => {
                setSearch(e.target.value);
                setIsOpen(true);
              }}
              className="w-full max-w-sm rounded border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-800 focus:border-blue-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            {isOpen && search.trim() && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-80 w-full max-w-sm overflow-y-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
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
                        studentPortraits={studentPortraits}
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
            <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-700">
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
                studentPortraits={studentPortraits}
              />
              {/* Label is omitted (not just blurred) while awaiting calculation — the icon alone is enough of
                a placeholder, and legible text next to a blurred row reads inconsistently. */}
              {!awaitingSimulation && <span className="font-semibold text-neutral-800 dark:text-neutral-100">{activeLabel}</span>}
              <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                {t('ui.resourceEfficiencyOwned')}
                <div className="w-28">
                  <NumberInput value={ownedAmount} onChange={(v) => updateMaterialInventory(activeKey, v)} min={0} max={Infinity} narrowButtonType="plus_only" />
                </div>
              </div>
              {isStudentEleph && (
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  {t('ui.resourceEfficiencyElephHintBefore')}
                  <Link to={localeLink(locale, '/planner/students')} className="text-blue-500 hover:underline dark:text-blue-400">
                    {t('page.studentGrowthPlanner')}
                  </Link>
                  {t('ui.resourceEfficiencyElephHintAfter')}
                </span>
              )}
            </div>
          )}

          {/* Graph */}
          {curve.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={curve} margin={{ top: 12, right: 32, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                  <XAxis
                    dataKey="ap"
                    type="number"
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                    tickFormatter={formatAxisTick}
                    tickLine={false}
                    axisLine={false}
                    label={{ value: 'AP', position: 'insideBottomRight', fontSize: 10, fill: 'currentColor' }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} tickFormatter={formatAxisTick} tickLine={false} axisLine={false} width={44} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { ap: number; amount: number };
                      return (
                        <div style={{ background: 'rgba(23,23,23,0.95)', border: '1px solid #404040', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#fff' }}>
                          <div>AP {Math.round(p.ap).toLocaleString()}</div>
                          <div style={{ fontFamily: 'monospace' }}>{p.amount.toFixed(1)}</div>
                        </div>
                      );
                    }}
                  />
                  {availableAp > 0 && (
                    <ReferenceLine
                      x={availableAp}
                      stroke="#3b82f6"
                      strokeDasharray="3 2"
                      label={{ value: `${t('ui.resourceEfficiencyOwnedAp')} (${Math.round(availableAp).toLocaleString()})`, fontSize: 10, fill: '#3b82f6', position: 'top' }}
                    />
                  )}
                  {elephStarLines.map(({ label, threshold }) => (
                    <ReferenceLine
                      key={label}
                      y={threshold}
                      stroke="#f59e0b"
                      strokeDasharray="3 2"
                      label={{ value: `${label} (${Math.round(threshold).toLocaleString()})`, fontSize: 10, fill: '#f59e0b', position: 'insideRight' }}
                    />
                  ))}
                  <Line type="linear" dataKey="amount" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {/* Transparency section — every row uses the same "{amount} / {cost}" shape plus repeat/one-time + approximation tags. */}
          <div className="space-y-3 text-sm">
            {profile && profile.segments.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('ui.resourceEfficiencySegments')}</h3>
                <ul className="space-y-1">
                  {profile.segments.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-neutral-700 dark:text-neutral-300">
                      <span>{renderSourceLabel(s.sourceLabel, t)}</span>
                      <span className="text-neutral-400 dark:text-neutral-500">
                        — {s.amount.toFixed(2)}
                        {t('ui.resourceEfficiencyUnit')} / AP {s.apCost.toFixed(2)}
                      </span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                        {s.repeatsForever ? t('ui.resourceEfficiencyRepeats') : t('ui.resourceEfficiencyOneTimeTag')}
                      </span>
                      {s.isApproximated && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:bg-amber-950 dark:text-amber-400">{t('ui.resourceEfficiencyApproximated')}</span>
                      )}
                      {!!s.firstRunBonusAmount && (
                        <span className="text-neutral-400 dark:text-neutral-500">{t('ui.resourceEfficiencyFirstRunBonus', { amount: s.firstRunBonusAmount.toFixed(2) })}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {farmingPlan.length > 0 && (
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
                <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('ui.resourceEfficiencyOneTime')}</h3>
                <ul className="space-y-1">
                  {profile.oneTimeContributions.map((o, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-neutral-700 dark:text-neutral-300">
                      <span>{renderSourceLabel(o.sourceLabel, t)}</span>
                      <span className="text-neutral-400 dark:text-neutral-500">
                        — {o.amount.toFixed(2)}
                        {t('ui.resourceEfficiencyUnit')} / {o.apCost !== undefined ? `AP ${o.apCost.toFixed(2)}` : t('ui.resourceEfficiencyFree')}
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
          </div>
        </div>
      </div>

      {/* Debug: AP flow Sankey (verification tool, independent of sim gate) */}
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
    </div>
  );
};
