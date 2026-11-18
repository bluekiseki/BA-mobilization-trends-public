// app/components/gacha/BannerPlannerV3.tsx
import { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CustomNumberInput } from '../../common/CustomInput';
import { SheetIcon } from '../../common/SheetIcon';
import { NumberFieldV3, ToggleV3 } from './FieldsV3';
import { FaChevronDown, FaChevronUp, FaTimes } from 'react-icons/fa';

import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import type { BannerStrategy, StudentStrategyConfig } from '~/types/gacha';
import type { BannerPeriod } from '~/utils/gachaData';
import { resolveMaxPull, type GlobalAggregatedResult } from '~/utils/gachaEngine';

interface Props {
  banners: BannerPeriod[];
  strategies: Record<string, BannerStrategy>;
  pyroxeneIcon?: string | null;
  onUpdateStrategy: (bannerId: string, updates: Partial<BannerStrategy>) => void;
  onUpdateStudentConfig: (bannerId: string, studentId: number, updates: Partial<StudentStrategyConfig>) => void;
  gachaSimResult?: GlobalAggregatedResult | null;
  resultState: 'empty' | 'running' | 'stale' | 'ready';
}

const monoStyle = { fontFamily: 'inherit' };
const fmt = (n: number) => Math.round(n).toLocaleString();

type ModeKey = 'skip' | 'must' | 'opportunistic';

function opportunisticDescription(tp: TFunction<'planner'>, threshold: number, useChargeSystem: boolean) {
  return tp(useChargeSystem ? 'gacha.v3.banner.opp_desc_charge' : 'gacha.v3.banner.opp_desc_pity', { threshold });
}

type ResultStudent = BannerPeriod['pickupStudents'][number];

function StudentRates({ students, result }: { students: ResultStudent[]; result?: GlobalAggregatedResult | null }) {
  const { t: tp } = useTranslation('planner');
  if (students.length === 0) return <span className="text-neutral-500 dark:text-neutral-400">{tp('gacha.v3.banner.no_targets')}</span>;

  const description = students
    .map((student) => {
      const rate = result?.studentStats[student.id]?.obtainRate;
      return `${student.name} ${rate === undefined ? '—' : `${rate.toFixed(1)}%`}`;
    })
    .join(' · ');

  return (
    <Tooltip placement="top" trigger={['hover', 'focus', 'click']} overlay={<span className="text-xs">{description}</span>}>
      <span tabIndex={0} aria-label={description} className="inline-flex items-center gap-2 rounded-sm focus:outline-none">
        {students.slice(0, 3).map((student) => {
          const rate = result?.studentStats[student.id]?.obtainRate;
          return (
            <span key={student.id} className="inline-flex items-center gap-1 whitespace-nowrap">
              <SheetIcon
                sheet="student"
                id={student.id}
                alt=""
                className="h-6 w-6 rounded-full border border-neutral-300 dark:border-neutral-600"
                fallback={<span className="h-6 w-6 rounded-full border border-neutral-300 bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-700" aria-hidden="true" />}
              />
              <span>{rate === undefined ? '—' : `${rate.toFixed(1)}%`}</span>
            </span>
          );
        })}
        {students.length > 3 && <span className="font-semibold">+{students.length - 3}</span>}
      </span>
    </Tooltip>
  );
}

function ModeSegment({ value, onChange }: { value: ModeKey; onChange: (m: ModeKey) => void }) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.banner_planner.mode' });
  const { t: t_ui } = useTranslation('ui');
  const { t: tp } = useTranslation('planner');
  const modes = [
    { key: 'must' as const, label: t_ui('required') },
    { key: 'opportunistic' as const, label: t('opportunistic') },
  ];
  return (
    <div className="v3-segment grid grid-cols-2">
      {modes.map(({ key, label }) => {
        const isSelected = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isSelected}
            title={isSelected ? tp('gacha.v3.banner.toggle_title_undo') : tp('gacha.v3.banner.toggle_title_set', { label })}
            onClick={() => onChange(isSelected ? 'skip' : key)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function BannerBadges({ banner, t, tGame }: { banner: BannerPeriod; t: TFunction<'planner', 'gacha.banner_planner'>; tGame: TFunction<'game'> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {banner.isLimitedBanner && !banner.isFes && <span className="rounded bg-ba-btn-yellow px-1.5 py-0.5 text-xs font-bold text-[#3a3304]">{tGame('limitedShort')}</span>}
      {banner.isFes && <span className="rounded bg-ba-btn-blue px-1.5 py-0.5 text-xs font-bold text-[#06262f]">{t('badge.fes')}</span>}
      {banner.freePulls > 0 && (
        <span className="rounded border border-green-300 px-1.5 py-0.5 text-xs font-bold text-green-700 dark:border-green-700 dark:text-green-400">
          {t('free_pulls_label', { count: banner.freePulls })}
        </span>
      )}
      {!banner.useChargeSystem && (
        <span className="rounded border border-blue-300 px-1.5 py-0.5 text-xs font-bold text-blue-700 dark:border-blue-700 dark:text-blue-400">{t('badge.point_system')}</span>
      )}
    </div>
  );
}

function SimpleBannerRows({
  banners,
  strategies,
  onUpdateStrategy,
  now,
  t,
  tGame,
}: {
  banners: BannerPeriod[];
  strategies: Record<string, BannerStrategy>;
  onUpdateStrategy: Props['onUpdateStrategy'];
  now: Date;
  t: TFunction<'planner', 'gacha.banner_planner'>;
  tGame: TFunction<'game'>;
}) {
  const { t: tp } = useTranslation('planner');
  const selectStudent = (banner: BannerPeriod, strategy: BannerStrategy, studentId: number) => {
    const config = strategy.studentConfigs[studentId];
    if (!config) return;
    if (config.mode !== 'skip') {
      onUpdateStrategy(banner.id, { studentConfigs: { ...strategy.studentConfigs, [studentId]: { ...config, mode: 'skip' } } });
      return;
    }
    const mustCount = Object.entries(strategy.studentConfigs).filter(([id, candidate]) => Number(id) !== studentId && candidate.mode === 'must').length + 1;
    const requiredMax = mustCount * 200;
    const currentMax = resolveMaxPull(strategy, banner.useChargeSystem);
    const priority = Math.max(0, ...Object.values(strategy.studentConfigs).map((candidate) => candidate.priority)) + 1;
    onUpdateStrategy(banner.id, {
      isActive: true,
      maxPull: requiredMax > currentMax ? requiredMax : currentMax,
      studentConfigs: { ...strategy.studentConfigs, [studentId]: { ...config, mode: 'must', priority } },
    });
  };
  return (
    <div className="v3-simple-banners">
      {banners.map((banner) => {
        const strategy = strategies[banner.id];
        if (!strategy) return null;
        return (
          <div key={banner.id} className="v3-simple-banner">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
              <span className={new Date(banner.endTime) < now ? 'line-through' : ''}>
                {banner.startTime.slice(0, 10)} ~ {banner.endTime.slice(0, 10)}
              </span>
              <BannerBadges banner={banner} t={t} tGame={tGame} />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {banner.pickupStudents.map((student) => {
                const config = strategy.studentConfigs[student.id];
                const selected = config?.mode !== 'skip';
                const conditional = config?.mode === 'opportunistic';
                const description = conditional
                  ? `${student.name}, ${opportunisticDescription(tp, config.opportunisticThreshold, banner.useChargeSystem)}`
                  : selected
                    ? tp('gacha.v3.banner.aria_must', { name: student.name })
                    : tp('gacha.v3.banner.aria_skip', { name: student.name });
                return (
                  <button
                    key={student.id}
                    type="button"
                    title={description}
                    aria-label={description}
                    aria-pressed={selected}
                    onClick={() => selectStudent(banner, strategy, student.id)}
                    className={`relative h-14 w-14 overflow-visible rounded-md ${selected ? 'border-2 border-ba-btn-blue' : ''}`}
                  >
                    <SheetIcon
                      sheet="student"
                      id={student.id}
                      alt=""
                      className={`h-full w-full rounded-[4px] ${selected ? '' : 'opacity-40 grayscale'}`}
                      fallback={<span className="block h-full w-full rounded-[4px] bg-neutral-200 dark:bg-neutral-700" />}
                    />
                    {!selected && (
                      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 px-0.5 py-0.5 text-center text-[7px] font-normal leading-[8px] text-black dark:text-white">
                        <span className="line-clamp-2 break-words" title={student.name}>
                          {student.name}
                        </span>
                      </span>
                    )}
                    {conditional && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-800 px-1 text-[10px] text-white dark:bg-neutral-200 dark:text-neutral-900">
                        {t('mode.opportunistic')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function BannerPlannerV3({ banners, strategies, onUpdateStrategy, onUpdateStudentConfig, gachaSimResult }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.banner_planner' });
  const { t: t_g } = useTranslation('game');
  const { t: tp } = useTranslation('planner');
  const [showOldBanners, setShowOldBanners] = useState(false);
  const [view, setView] = useState<'simple' | 'standard'>('standard');
  const [showSimpleTip, setShowSimpleTip] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem('gacha_v3_banner_view');
    if (saved === 'simple' || saved === 'standard') setView(saved);
    else if (window.localStorage.getItem('gacha_v3_simple_tip_seen') !== '1') setShowSimpleTip(true);
  }, []);
  const dismissSimpleTip = () => {
    setShowSimpleTip(false);
    window.localStorage.setItem('gacha_v3_simple_tip_seen', '1');
  };
  const changeView = (next: 'simple' | 'standard') => {
    setView(next);
    window.localStorage.setItem('gacha_v3_banner_view', next);
    dismissSimpleTip();
  };
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const expand = (id: string) => setExpandedIds((prev) => new Set([...prev, id]));
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const bannerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const now = new Date();

  const { visibleBanners, hiddenCount } = useMemo(() => {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 0);
    const visible: BannerPeriod[] = [];
    let hidden = 0;
    banners.forEach((b) => {
      const endTime = new Date(b.endTime);
      if (!showOldBanners && endTime < cutoffDate) {
        hidden++;
      } else {
        visible.push(b);
      }
    });
    return { visibleBanners: visible, hiddenCount: hidden };
  }, [banners, showOldBanners]);

  const activePastBannerIds = useMemo(() => {
    return banners.filter((b) => new Date(b.endTime) < now && strategies[b.id]?.isActive).map((b) => b.id);
  }, [banners, strategies, now]);

  const bannerStatsMap = useMemo(() => {
    if (!gachaSimResult) return new Map<string, { avgCost: number; avgPulls: number }>();
    return new Map(gachaSimResult.bannerStats.map((b) => [b.bannerId, { avgCost: b.avgCost, avgPulls: b.avgPulls }]));
  }, [gachaSimResult]);

  // All pickup student IDs across all banners (for non-pickup detection)
  const handleModeChange = (banner: BannerPeriod, strat: BannerStrategy, studentId: number, newMode: ModeKey) => {
    const mustCount = Object.entries(strat.studentConfigs).filter(([id, cfg]) => (studentId === Number(id) ? newMode : cfg.mode) === 'must').length;
    const needMaxPull = mustCount * 200; // one hard-pity guarantee (200 pulls) per must-target
    const curMaxPull = resolveMaxPull(strat, banner.useChargeSystem);
    const autoEnable = newMode !== 'skip' && !strat.isActive;
    if (autoEnable || needMaxPull > curMaxPull) {
      onUpdateStrategy(banner.id, {
        ...strat,
        isActive: autoEnable ? true : strat.isActive,
        maxPull: Math.max(curMaxPull, needMaxPull),
        studentConfigs: {
          ...strat.studentConfigs,
          [studentId]: { ...strat.studentConfigs[studentId], mode: newMode },
        },
      });
      if (autoEnable) expand(banner.id);
    } else {
      onUpdateStudentConfig(banner.id, studentId, { mode: newMode });
    }
  };

  return (
    <div className="space-y-2">
      {/* Toggle old banners + deactivate past banners + reset planner data */}
      <div className="v3-plan-header flex flex-wrap items-center gap-2">
        <h2 className="v3-section-title mr-auto">
          {tp('gacha.v3.banner.plan_title')}{' '}
          <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">
            · {tp('gacha.v3.banner.active_count', { count: Object.values(strategies).filter((strategy) => strategy.isActive).length })}
          </span>
        </h2>
        <div className="v3-view-control">
          <div role="group" aria-label={tp('gacha.v3.banner.view_aria')} className="v3-view-toggle flex">
            <button type="button" aria-pressed={view === 'simple'} aria-describedby={showSimpleTip ? 'v3-simple-view-tip' : undefined} onClick={() => changeView('simple')}>
              {tp('gacha.mode.simple')}
            </button>
            <button type="button" aria-pressed={view === 'standard'} onClick={() => changeView('standard')}>
              {tp('gacha.mode.expert')}
            </button>
          </div>
          {showSimpleTip && (
            <aside id="v3-simple-view-tip" className="v3-onboarding-tip v3-simple-view-tip" aria-label={tp('gacha.v3.banner.simple_tip_aria')}>
              <p>{tp('gacha.v3.banner.simple_tip')}</p>
              <button type="button" onClick={dismissSimpleTip} aria-label={tp('gacha.v3.banner.simple_tip_close')}>
                <FaTimes aria-hidden="true" />
              </button>
            </aside>
          )}
        </div>

        {expandedIds.size > 1 && (
          <button type="button" onClick={() => setExpandedIds(new Set())} className="v3-aux-button">
            {tp('gacha.v3.banner.collapse_all')}
          </button>
        )}

        {activePastBannerIds.length > 0 && (
          <button onClick={() => activePastBannerIds.forEach((id) => onUpdateStrategy(id, { isActive: false }))} className="v3-text-action">
            {t('header.deactivate_past', { count: activePastBannerIds.length })}
          </button>
        )}
        {(hiddenCount > 0 || showOldBanners) && (
          <button onClick={() => setShowOldBanners(!showOldBanners)} className="v3-text-action">
            {showOldBanners ? t('header.toggle_hide') : t('header.toggle_show', { count: hiddenCount })}
            <FaChevronDown className={`v3-disclosure-chevron ${showOldBanners ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}
      </div>
      {view === 'standard' && expandedIds.size > 0 && <p className="text-xs text-neutral-600 dark:text-neutral-400">{tp('gacha.v3.banner.reselect_hint')}</p>}

      {view === 'simple' ? (
        <SimpleBannerRows banners={visibleBanners} strategies={strategies} onUpdateStrategy={onUpdateStrategy} now={now} t={t} tGame={t_g} />
      ) : (
        <>
          {/* Full-bleed on mobile (page wraps content in px-2) so the row padding isn't doubled up against
          the screen edge; a plain white surface in light mode. */}
          <div className="v3-standard-banners divide-y divide-neutral-200 dark:divide-neutral-800">
            {visibleBanners.map((banner) => {
              const strat = strategies[banner.id];
              if (!strat) return null;

              const isParticipating = strat.isActive;
              const end = new Date(banner.endTime);
              const isPast = end < now;
              const isExpanded = expandedIds.has(banner.id);
              const bannerSim = bannerStatsMap.get(banner.id);

              // Students with active strategies
              const activeStudents = banner.pickupStudents.filter((s) => {
                const cfg = strat.studentConfigs[s.id];
                return cfg && cfg.mode !== 'skip';
              });

              // Sorted for display: targeting first (by priority asc), skip students at end
              const sortedPickupStudents = [...banner.pickupStudents].sort((a, b) => {
                const cfgA = strat.studentConfigs[a.id];
                const cfgB = strat.studentConfigs[b.id];
                const skipA = !cfgA || cfgA.mode === 'skip';
                const skipB = !cfgB || cfgB.mode === 'skip';
                if (skipA !== skipB) return skipA ? 1 : -1;
                return (cfgA?.priority ?? 99) - (cfgB?.priority ?? 99);
              });

              const targetingIds = sortedPickupStudents.filter((s) => strat.studentConfigs[s.id]?.mode !== 'skip').map((s) => s.id);

              // Deterministic budget check: each "must" pick needs one hard-pity guarantee (200 pulls). If the
              // max budget can't cover them all, the plan cannot guarantee every "must" student (no sim needed).
              const mustCount = sortedPickupStudents.filter((s) => strat.studentConfigs[s.id]?.mode === 'must').length;
              const budgetBelowPity = mustCount > 0 && mustCount * 200 > resolveMaxPull(strat, banner.useChargeSystem);

              const swapPriority = (idA: number, idB: number) => {
                const pA = strat.studentConfigs[idA]?.priority ?? 1;
                const pB = strat.studentConfigs[idB]?.priority ?? 1;
                onUpdateStrategy(banner.id, {
                  studentConfigs: {
                    ...strat.studentConfigs,
                    [idA]: { ...strat.studentConfigs[idA], priority: pB },
                    [idB]: { ...strat.studentConfigs[idB], priority: pA },
                  },
                });
              };

              return (
                <div
                  key={banner.id}
                  ref={(el) => {
                    bannerRefs.current[banner.id] = el;
                  }}
                  className="v3-banner"
                >
                  {/* Banner header row */}
                  <div className="v3-banner-header">
                    <button
                      type="button"
                      aria-label={tp(isExpanded ? 'gacha.v3.banner.aria_collapse' : 'gacha.v3.banner.aria_expand', { names: banner.pickupStudents.map((student) => student.name).join(', ') })}
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpanded(banner.id)}
                      className="v3-banner-title flex min-w-0 items-center gap-4 text-left"
                    >
                      {/* Student portraits — selected students first, up to 3, fixed width via dynamic overlap */}
                      {(() => {
                        const sortedPortraits = [
                          ...banner.pickupStudents.filter((s) => strat?.studentConfigs?.[s.id]?.mode !== 'skip'),
                          ...banner.pickupStudents.filter((s) => !strat?.studentConfigs?.[s.id] || strat.studentConfigs[s.id].mode === 'skip'),
                        ].slice(0, 3);
                        const spaceClass = '-space-x-7';
                        return (
                          <div className={`flex ${spaceClass} w-16 shrink-0 items-center`}>
                            {sortedPortraits.map((s, i) => {
                              const isSelected = strat?.studentConfigs?.[s.id]?.mode !== 'skip' && !!strat?.studentConfigs?.[s.id];
                              const ringClass = `w-10 h-10 rounded-full border-2 ${isSelected ? 'border-ba-btn-blue' : 'border-neutral-300 dark:border-neutral-600'}`;
                              return (
                                <Tooltip key={i} placement="top" overlay={<span className="text-xs">{s.name}</span>}>
                                  <div className="relative" style={{ zIndex: sortedPortraits.length - i }}>
                                    <SheetIcon sheet="student" id={s.id} alt={s.name} className={ringClass} fallback={<div className={`${ringClass} bg-neutral-200 dark:bg-neutral-700`} />} />
                                  </div>
                                </Tooltip>
                              );
                            })}
                          </div>
                        );
                      })()}

                      <div className="v3-banner-info min-w-0 flex-1">
                        <span className="min-w-0 flex-1 line-clamp-2 font-semibold leading-5 sm:line-clamp-1" title={banner.pickupStudents.map((student) => student.name).join(' · ')}>
                          {banner.pickupStudents.map((student, index) => (
                            <span
                              key={student.id}
                              className={
                                strat.studentConfigs[student.id]?.mode !== 'skip'
                                  ? 'bg-[linear-gradient(transparent_62%,rgba(37,99,235,0.3)_62%)] dark:bg-[linear-gradient(transparent_62%,rgba(96,165,250,0.35)_62%)]'
                                  : ''
                              }
                            >
                              {index > 0 ? ' · ' : ''}
                              {student.name}
                            </span>
                          ))}
                        </span>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                          <span className={isPast ? 'line-through whitespace-nowrap' : 'whitespace-nowrap'}>
                            {banner.startTime.slice(0, 10)} ~ {banner.endTime.slice(0, 10)}
                          </span>
                          <div className="flex flex-wrap gap-1 empty:hidden">
                            {banner.isLimitedBanner && !banner.isFes && <span className="rounded bg-ba-btn-yellow px-1.5 py-0.5 text-xs font-bold text-[#3a3304]">{t_g('limitedShort')}</span>}
                            {banner.isFes && <span className="rounded bg-ba-btn-blue px-1.5 py-0.5 text-xs font-bold text-[#06262f]">{t('badge.fes')}</span>}
                            {banner.freePulls > 0 && (
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400">
                                {t('free_pulls_label', { count: banner.freePulls })}
                              </span>
                            )}
                            {!banner.useChargeSystem && (
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400">{t('badge.point_system')}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <FaChevronDown size={12} aria-hidden="true" className={`shrink-0 text-neutral-500 transition-transform dark:text-neutral-400 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Right controls */}
                    <div className="v3-banner-actions flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {/* Activate toggle */}
                      <button
                        type="button"
                        onClick={() => {
                          const newActive = !isParticipating;
                          onUpdateStrategy(banner.id, { isActive: newActive });
                          if (newActive) expand(banner.id);
                        }}
                        role="switch"
                        aria-checked={isParticipating}
                        aria-label={tp('gacha.v3.banner.aria_select', { names: banner.pickupStudents.map((student) => student.name).join(', ') })}
                        className="relative h-6 w-11 rounded-full transition-colors self-center v3-switch"
                        style={{ background: isParticipating ? '#77e0ff' : '#737373' }}
                      >
                        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: isParticipating ? 22 : 2 }} />
                      </button>
                    </div>
                  </div>

                  {isParticipating && !isExpanded && (
                    <div className="space-y-2 pb-4 text-sm">
                      <p className="text-xs font-normal text-neutral-600 dark:text-neutral-400">
                        {tp('gacha.v3.banner.max_prefix')}{' '}
                        <span className="font-medium">
                          {resolveMaxPull(strat, banner.useChargeSystem).toLocaleString()}
                          {tp('gacha.income.timeline.unit_times')}
                        </span>{' '}
                        · {tp('gacha.v3.banner.avg_cost_prefix')} <span className="font-medium">{bannerSim ? `${fmt(bannerSim.avgCost)} ${t_g('pyroxene')}` : '—'}</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal text-neutral-600 dark:text-neutral-400">
                        <span>{tp('gacha.v3.banner.plan_rate')}</span>
                        <StudentRates students={activeStudents} result={gachaSimResult} />
                      </div>
                    </div>
                  )}

                  {/* Expanded strategy editor */}
                  {isExpanded && (
                    <div className="v3-banner-editor @container space-y-3">
                      {/* Per-student strategy — sorted by priority */}
                      <h3 className="font-semibold">{tp('gacha.v3.banner.targets_title')}</h3>
                      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                        {sortedPickupStudents.map((student) => {
                          const config = strat.studentConfigs[student.id];
                          if (!config) return null;
                          const isTargeting = config.mode !== 'skip';
                          const tIdx = targetingIds.indexOf(student.id);
                          const canUp = isTargeting && tIdx > 0;
                          const canDown = isTargeting && tIdx < targetingIds.length - 1;
                          return (
                            <div key={student.id} className="v3-student-editor py-2">
                              <div className="v3-student-identity flex items-center gap-2">
                                <SheetIcon
                                  sheet="student"
                                  id={student.id}
                                  alt={student.name}
                                  className="w-7 h-7 rounded-full border border-neutral-300 dark:border-neutral-600 shrink-0"
                                  fallback={<div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 shrink-0" />}
                                />
                                <div className="flex min-w-0 flex-wrap items-center gap-1">
                                  <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100">{student.name}</span>
                                  {!isTargeting && <span className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">{tp('gacha.v3.banner.skip')}</span>}
                                  {student.isRerun && (
                                    <span className="rounded-sm border border-blue-300 bg-blue-50 px-1 text-xs font-black text-blue-700 whitespace-nowrap dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                      {t_g('rerun')}
                                    </span>
                                  )}
                                  {student.isFes && (
                                    <span className="rounded-sm border border-ba-btn-blue-dark bg-ba-btn-blue/15 px-1 text-xs font-black text-[#15566a] whitespace-nowrap dark:text-ba-btn-blue">
                                      {t_g('fest')}
                                    </span>
                                  )}
                                  {!student.isFes && student.isLimited && (
                                    <span className="rounded-sm border border-[#d8ca25] bg-ba-btn-yellow/20 px-1 text-xs font-black text-[#6b5f00] whitespace-nowrap dark:text-ba-btn-yellow">
                                      {t_g('limitedShort')}
                                    </span>
                                  )}
                                </div>
                                {isTargeting && (
                                  <div className="flex items-center gap-2 ml-auto">
                                    <span className="text-xs font-bold text-neutral-400 tabular-nums" style={monoStyle}>
                                      {t('rank_label', { priority: config.priority })}
                                    </span>
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        aria-label={tp('gacha.v3.banner.aria_priority_up', { name: student.name })}
                                        disabled={!canUp}
                                        onClick={() => swapPriority(student.id, targetingIds[tIdx - 1])}
                                        className="h-5 w-7 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-ba-btn-blue/20 hover:text-[#06262f] dark:hover:text-[#06262f] disabled:opacity-20 disabled:cursor-not-allowed transition-colors border-b border-neutral-200 dark:border-neutral-700"
                                      >
                                        <FaChevronUp size={9} />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={tp('gacha.v3.banner.aria_priority_down', { name: student.name })}
                                        disabled={!canDown}
                                        onClick={() => swapPriority(student.id, targetingIds[tIdx + 1])}
                                        className="h-5 w-7 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-ba-btn-blue/20 hover:text-[#06262f] dark:hover:text-[#06262f] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                      >
                                        <FaChevronDown size={9} />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="v3-student-mode">
                                <ModeSegment value={config.mode} onChange={(newMode) => handleModeChange(banner, strat, student.id, newMode)} />
                              </div>
                              {config.mode === 'opportunistic' && (
                                <NumberFieldV3
                                  className="v3-student-condition v3-inline-condition mt-2"
                                  label={tp(banner.useChargeSystem ? 'gacha.v3.banner.try_cap_charge' : 'gacha.v3.banner.try_cap')}
                                  unit={tp('gacha.income.timeline.unit_times')}
                                  value={config.opportunisticThreshold}
                                  onChange={(value) => onUpdateStudentConfig(banner.id, student.id, { opportunisticThreshold: value })}
                                  description={opportunisticDescription(tp, config.opportunisticThreshold, banner.useChargeSystem)}
                                />
                              )}
                              {isTargeting && !banner.useChargeSystem && (
                                <div className="v3-student-condition mt-2 space-y-2">
                                  <ToggleV3
                                    label={t('intentional_spark.label')}
                                    checked={config.intentionalSpark}
                                    onChange={(checked) => onUpdateStudentConfig(banner.id, student.id, { intentionalSpark: checked })}
                                  />
                                  {config.intentionalSpark && (
                                    <label className="v3-intentional-spark">
                                      <span>{t('intentional_spark.after_obtain')}</span>
                                      <CustomNumberInput
                                        aria-label={tp('gacha.v3.banner.spark_aria')}
                                        min={10}
                                        max={190}
                                        value={config.intentionalSparkThreshold || 20}
                                        onChange={(value) => onUpdateStudentConfig(banner.id, student.id, { intentionalSparkThreshold: value ?? 20 })}
                                      />
                                      <span>{tp('gacha.v3.banner.spark_proceed')}</span>
                                    </label>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="border-t border-neutral-200 pt-4 dark:border-neutral-700">
                        <h3 className="mb-3 text-sm font-semibold">{tp('gacha.v3.banner.limits_title')}</h3>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <NumberFieldV3
                              label={tp('gacha.v3.banner.max_pulls')}
                              unit={t('unit_pulls')}
                              value={resolveMaxPull(strat, banner.useChargeSystem)}
                              step={10}
                              onChange={(value) => onUpdateStrategy(banner.id, { maxPull: Math.max(0, value) })}
                              onBlur={() => onUpdateStrategy(banner.id, { maxPull: Math.round(resolveMaxPull(strat, banner.useChargeSystem) / 10) * 10 })}
                            />
                            {budgetBelowPity && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t('settings.budget_below_pity')}</p>}
                          </div>
                          <NumberFieldV3
                            label={tp('gacha.v3.banner.min_pulls')}
                            unit={t('unit_pulls')}
                            value={strat.minPulls || 0}
                            onChange={(value) => onUpdateStrategy(banner.id, { minPulls: Math.max(0, value) })}
                          />
                          <div className="v3-segment v3-presets col-span-2 mt-1 grid w-full grid-cols-4 sm:w-80">
                            {[100, 200, 300, 400].map((value) => (
                              <button type="button" key={value} aria-pressed={resolveMaxPull(strat, banner.useChargeSystem) === value} onClick={() => onUpdateStrategy(banner.id, { maxPull: value })}>
                                {value}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {banner.useChargeSystem && (
                        <div className="space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-700">
                          <h3 className="text-sm font-semibold">{tp('gacha.v3.banner.bonus_title')}</h3>
                          <ToggleV3
                            label={t('recruit_bonus_claim.label')}
                            checked={strat.claimRecruitBonus ?? false}
                            onChange={(checked) => onUpdateStrategy(banner.id, { claimRecruitBonus: checked })}
                          />
                          {strat.claimRecruitBonus && (
                            <label className="v3-recruit-bonus-line">
                              <span>{t('recruit_bonus_claim.remains_le')}</span>
                              <CustomNumberInput
                                aria-label={tp('gacha.v3.banner.bonus_aria')}
                                min={0}
                                value={strat.recruitBonusThreshold ?? 10}
                                onChange={(value) => onUpdateStrategy(banner.id, { recruitBonusThreshold: value ?? 0 })}
                              />
                              <span>{t('recruit_bonus_claim.proceed_if_remains')}</span>
                            </label>
                          )}
                        </div>
                      )}

                      {isParticipating && (
                        <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 space-y-2 text-sm">
                          <div className="grid gap-2 sm:grid-cols-2 sm:gap-6">
                            <div className="flex justify-between gap-3">
                              <span>{tp('gacha.v3.banner.this_avg_cost')}</span>
                              <b>{bannerSim ? `${fmt(bannerSim.avgCost)} ${t_g('pyroxene')}` : '—'}</b>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span>{tp('gacha.v3.banner.avg_pulls')}</span>
                              <b>{bannerSim ? `${Math.round(bannerSim.avgPulls)}${tp('gacha.income.timeline.unit_times')}` : '—'}</b>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>{tp('gacha.v3.banner.plan_rate')}</span>
                            <StudentRates students={activeStudents} result={gachaSimResult} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
