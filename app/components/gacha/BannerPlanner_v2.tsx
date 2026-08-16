// app/components/gacha/BannerPlanner_v2.tsx
import { useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomNumberInput } from '../CustomInput';
import { FaHistory, FaChevronDown, FaChevronUp, FaGem } from 'react-icons/fa';
import { TbCalendarOff } from 'react-icons/tb';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import type { BannerStrategy, StudentStrategyConfig } from '~/types/gacha';
import type { BannerPeriod } from '~/utils/gachaData';
import type { GlobalAggregatedResult } from '~/utils/gachaEngine';

interface Props {
  banners: BannerPeriod[];
  strategies: Record<string, BannerStrategy>;
  portraitMap: Record<number, string>;
  pyroxeneIcon?: string | null;
  onUpdateStrategy: (bannerId: string, updates: Partial<BannerStrategy>) => void;
  onUpdateStudentConfig: (bannerId: string, studentId: number, updates: Partial<StudentStrategyConfig>) => void;
  gachaSimResult?: GlobalAggregatedResult | null;
}

const monoStyle = { fontFamily: 'inherit' };
const fmt = (n: number) => Math.round(n).toLocaleString();

type ModeKey = 'skip' | 'must' | 'opportunistic';

function ModeSegment({ value, onChange }: { value: ModeKey; onChange: (m: ModeKey) => void }) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.banner_planner.mode' });
  const modes: ModeKey[] = ['must', 'opportunistic', 'skip'];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-1">
      {modes.map((m) => {
        const on = value === m;
        const sty = on
          ? m === 'must'
            ? { background: '#77e0ff', color: '#06262f' }
            : m === 'opportunistic'
              ? { background: '#f6e94b', color: '#3a3304' }
              : { background: '#525252', color: '#fafafa' }
          : {};
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            style={sty}
            className={`rounded-md py-1.5 text-xs font-bold transition whitespace-nowrap ${on ? '' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
          >
            {t(m)}
          </button>
        );
      })}
    </div>
  );
}

function GameImg({ src, size = 24 }: { src: string; size?: number }) {
  return (
    <span className="shrink-0 inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <img src={`data:image/webp;base64,${src}`} className="max-w-full max-h-full object-cover" />
    </span>
  );
}

export default function BannerPlanner_v2({ banners, strategies, portraitMap, pyroxeneIcon, onUpdateStrategy, onUpdateStudentConfig, gachaSimResult }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.banner_planner' });
  const { t: tResultView } = useTranslation('planner', { keyPrefix: 'gacha.result_view' });
  const [showOldBanners, setShowOldBanners] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    const needMaxSparks = Object.entries(strat.studentConfigs).filter(([id, cfg]) => (studentId === Number(id) ? newMode : cfg.mode) === 'must').length;
    const needMaxHalfCharges = needMaxSparks * 2; // 1 spark == 200 pulls == 2 half-charges
    const autoEnable = newMode !== 'skip' && !strat.isActive;
    if (autoEnable || needMaxSparks > strat.maxSparks || needMaxHalfCharges > strat.maxHalfCharges) {
      onUpdateStrategy(banner.id, {
        ...strat,
        isActive: autoEnable ? true : strat.isActive,
        maxSparks: Math.max(strat.maxSparks, needMaxSparks),
        maxHalfCharges: Math.max(strat.maxHalfCharges, needMaxHalfCharges),
        studentConfigs: {
          ...strat.studentConfigs,
          [studentId]: { ...strat.studentConfigs[studentId], mode: newMode },
        },
      });
      if (autoEnable) setExpandedId(banner.id);
    } else {
      onUpdateStudentConfig(banner.id, studentId, { mode: newMode });
    }
  };

  return (
    <div className="space-y-2">
      {/* Toggle old banners + deactivate past banners */}
      {(hiddenCount > 0 || showOldBanners || activePastBannerIds.length > 0) && (
        <div className="flex justify-end gap-2">
          {activePastBannerIds.length > 0 && (
            <button
              onClick={() => activePastBannerIds.forEach((id) => onUpdateStrategy(id, { isActive: false }))}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 transition-colors"
            >
              <TbCalendarOff size={13} />
              {t('header.deactivate_past', { count: activePastBannerIds.length })}
            </button>
          )}
          {(hiddenCount > 0 || showOldBanners) && (
            <button
              onClick={() => setShowOldBanners(!showOldBanners)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 transition-colors"
            >
              <FaHistory size={11} />
              {showOldBanners ? t('header.toggle_hide') : t('header.toggle_show', { count: hiddenCount })}
              {showOldBanners ? <FaChevronUp className="text-[10px]" /> : <FaChevronDown className="text-[10px]" />}
            </button>
          )}
        </div>
      )}

      <div className="rounded-md border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-700 overflow-hidden">
        {visibleBanners.map((banner) => {
          const strat = strategies[banner.id];
          if (!strat) return null;

          const isParticipating = strat.isActive;
          const start = new Date(banner.startTime);
          const end = new Date(banner.endTime);
          const isCurrent = now >= start && now <= end;
          const isPast = end < now;
          const isExpanded = expandedId === banner.id;
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

          const rateColor = (rate: number) => (rate > 80 ? '#16a34a' : rate > 50 ? '#77e0ff' : rate > 20 ? '#d97706' : '#dc2626');

          return (
            <div
              key={banner.id}
              ref={(el) => {
                bannerRefs.current[banner.id] = el;
              }}
              className={`transition ${!isParticipating && !isCurrent ? 'opacity-60 hover:opacity-100' : ''}`}
            >
              {/* Banner header row */}
              <div className="flex items-start gap-2 px-3 py-3 cursor-pointer select-none" onClick={() => setExpandedId(isExpanded ? null : banner.id)}>
                {/* Student portraits — selected students first, up to 3, fixed width via dynamic overlap */}
                {(() => {
                  const sortedPortraits = [
                    ...banner.pickupStudents.filter((s) => strat?.studentConfigs?.[s.id]?.mode !== 'skip'),
                    ...banner.pickupStudents.filter((s) => !strat?.studentConfigs?.[s.id] || strat.studentConfigs[s.id].mode === 'skip'),
                  ].slice(0, 3);
                  const spaceClass = sortedPortraits.length >= 3 ? '-space-x-6' : '-space-x-2';
                  return (
                    <div className={`flex ${spaceClass} pt-0.5 shrink-0`}>
                      {sortedPortraits.map((s, i) => {
                        const imgSrc = portraitMap[s.id] ? `data:image/webp;base64,${portraitMap[s.id]}` : null;
                        const isSelected = strat?.studentConfigs?.[s.id]?.mode !== 'skip' && !!strat?.studentConfigs?.[s.id];
                        return (
                          <Tooltip key={i} placement="top" overlay={<span className="text-xs">{s.name}</span>}>
                            <div className="relative" style={{ zIndex: sortedPortraits.length - i }}>
                              {imgSrc ? (
                                <img
                                  src={imgSrc}
                                  className={`w-10 h-10 rounded-full object-cover border-2 ${isSelected ? 'border-ba-btn-blue' : 'border-neutral-300 dark:border-neutral-600'}`}
                                  alt={s.name}
                                />
                              ) : (
                                <div
                                  className={`w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 border-2 ${isSelected ? 'border-ba-btn-blue' : 'border-neutral-300 dark:border-neutral-600'}`}
                                />
                              )}
                            </div>
                          </Tooltip>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Banner info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-neutral-900 dark:text-neutral-100 truncate" title={banner.pickupStudents.map((s) => s.name).join(' · ')}>
                      {banner.pickupStudents.map((s) => s.name).join(' · ')}
                    </span>
                    {banner.isLimitedBanner && !banner.isFes && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#f6e94b', color: '#3a3304' }}>
                        {t('badge.limited')}
                      </span>
                    )}
                    {banner.isFes && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-[#06262f]" style={{ background: '#77e0ff' }}>
                        {t('badge.fes')}
                      </span>
                    )}
                    {banner.freePulls > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400">
                        {t('free_pulls_label', { count: banner.freePulls })}
                      </span>
                    )}
                    {banner.useChargeSystem && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400">{t('badge.charge_system')}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-neutral-500 dark:text-neutral-400" style={monoStyle}>
                    <span className={isPast ? 'line-through text-neutral-400' : ''}>{banner.startTime.split(' ')[0]}</span>
                    <span className="text-neutral-300 dark:text-neutral-700">~</span>
                    <span className={isPast ? 'line-through text-neutral-400' : ''}>{banner.endTime.split(' ')[0]}</span>
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex flex-col items-end gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {/* Activate toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const newActive = !isParticipating;
                      onUpdateStrategy(banner.id, { isActive: newActive });
                      if (newActive) setExpandedId(banner.id);
                    }}
                    className="relative h-6 w-11 rounded-full transition-colors"
                    style={{ background: isParticipating ? '#77e0ff' : '#d4d4d8 ' }}
                  >
                    <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: isParticipating ? 22 : 2 }} />
                  </button>
                  <FaChevronDown size={14} className={`text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Summary strip (active banners) */}
              {isParticipating && (
                <div className="px-3 pb-2 -mt-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs" style={monoStyle}>
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 mr-1">
                      {t('max_pity_label', { count: banner.useChargeSystem ? strat.maxHalfCharges / 2 : strat.maxSparks })}
                    </span>
                    {activeStudents.map((s) => {
                      const cfg = strat.studentConfigs[s.id];
                      return (
                        <span
                          key={s.id}
                          className="font-bold px-1.5 py-0.5 rounded flex items-center gap-1 whitespace-nowrap text-[10px]"
                          style={cfg.mode === 'must' ? { background: '#77e0ff22', color: '#77e0ff' } : { background: '#f6e94b22', color: '#9a8a06' }}
                        >
                          {s.name} {cfg.mode === 'must' ? '★' : cfg.mode === 'opportunistic' ? '◎' : ''}
                        </span>
                      );
                    })}
                    {bannerSim && (
                      <span className="ml-auto flex items-center gap-1 text-neutral-700 dark:text-neutral-300 font-bold">
                        {pyroxeneIcon ? <GameImg src={pyroxeneIcon} size={16} /> : <FaGem size={11} style={{ color: '#77e0ff' }} />}
                        {fmt(bannerSim.avgCost)}
                      </span>
                    )}
                  </div>
                  {gachaSimResult && activeStudents.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]" style={monoStyle}>
                      {activeStudents.map((s) => {
                        const stat = gachaSimResult.studentStats[s.id];
                        if (!stat) return null;
                        return (
                          <span key={s.id} className="text-neutral-500 dark:text-neutral-400">
                            {s.name} <b style={{ color: rateColor(stat.obtainRate) }}>{stat.obtainRate.toFixed(0)}%</b>
                            {stat.avgEleph > 0 && (
                              <span className="text-neutral-400">
                                {' '}
                                +{Math.round(stat.avgEleph)}
                                {tResultView('student_stats.chart_x_eleph')}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Expanded strategy editor */}
              {isExpanded && (
                <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 space-y-3">
                  {/* Banner-level: maxSparks + minPulls */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5" style={monoStyle}>
                        {t('settings.max_budget')}
                      </div>
                      {banner.useChargeSystem ? (
                        <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-1">
                          {Array.from({ length: Math.max(4, banner.pickupStudents.length * 2) }, (_, i) => i + 1).map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => onUpdateStrategy(banner.id, { maxHalfCharges: n })}
                              className={`rounded-md py-1.5 text-xs font-bold transition ${strat.maxHalfCharges === n ? 'text-[#06262f]' : 'text-neutral-500'}`}
                              style={strat.maxHalfCharges === n ? { background: '#77e0ff' } : {}}
                            >
                              {t('pity_format', { pity: n / 2, pulls: n * 100 })}
                            </button>
                          ))}
                          <div
                            className="rounded-md px-2 py-1.5 flex items-center justify-center gap-2 text-xs font-bold transition"
                            style={strat.maxHalfCharges > Math.max(4, banner.pickupStudents.length * 2) ? { background: '#77e0ff', color: '#06262f' } : { color: '#737373' }}
                          >
                            <span className="whitespace-nowrap">{t('settings.manual_sparks')}</span>
                            <CustomNumberInput
                              min={0}
                              aria-label={t('settings.manual_sparks')}
                              className="w-12 rounded border border-neutral-300 bg-white px-1.5 py-1 text-center font-bold text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                              style={monoStyle}
                              value={strat.maxHalfCharges || 0}
                              onChange={(val) => onUpdateStrategy(banner.id, { maxHalfCharges: Math.max(0, val || 0) })}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-1">
                          {Array.from({ length: Math.max(2, banner.pickupStudents.length) }, (_, i) => i + 1).map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => onUpdateStrategy(banner.id, { maxSparks: n })}
                              className={`rounded-md py-1.5 text-xs font-bold transition ${strat.maxSparks === n ? 'text-[#06262f]' : 'text-neutral-500'}`}
                              style={strat.maxSparks === n ? { background: '#77e0ff' } : {}}
                            >
                              {t('pity_format', { pity: n, pulls: n * 200 })}
                            </button>
                          ))}
                          <div
                            className="rounded-md px-2 py-1.5 flex items-center justify-center gap-2 text-xs font-bold transition"
                            style={strat.maxSparks > Math.max(2, banner.pickupStudents.length) ? { background: '#77e0ff', color: '#06262f' } : { color: '#737373' }}
                          >
                            <span className="whitespace-nowrap">{t('settings.manual_sparks')}</span>
                            <CustomNumberInput
                              min={0}
                              aria-label={t('settings.manual_sparks')}
                              className="w-12 rounded border border-neutral-300 bg-white px-1.5 py-1 text-center font-bold text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                              style={monoStyle}
                              value={strat.maxSparks || 0}
                              onChange={(val) => onUpdateStrategy(banner.id, { maxSparks: Math.max(0, val || 0) })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5" style={monoStyle}>
                        {t('settings.min_pulls')}
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5">
                        <CustomNumberInput
                          min={0}
                          className="w-full bg-transparent text-sm font-bold text-neutral-800 dark:text-neutral-100 outline-none"
                          style={monoStyle}
                          value={strat.minPulls || 0}
                          onChange={(val) => onUpdateStrategy(banner.id, { minPulls: Math.max(0, val || 0) })}
                        />
                        <span className="text-xs text-neutral-400">{t('unit_pulls')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Claim "Recruitment Count Bonus" — new recruit charge system only, at banner level (mirrors
                      above, but keyed to ticket milestones instead of pity checkpoints). */}
                  {banner.useChargeSystem && (
                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-neutral-600 dark:text-neutral-300">
                        <input
                          type="checkbox"
                          className="rounded border-neutral-300 w-3 h-3 accent-ba-btn-blue"
                          checked={strat.claimRecruitBonus ?? false}
                          onChange={(e) => onUpdateStrategy(banner.id, { claimRecruitBonus: e.target.checked })}
                        />
                        {t('recruit_bonus_claim.label')}
                      </label>
                      {(strat.claimRecruitBonus ?? false) && (
                        <div className="flex items-center gap-1 pl-5 text-xs">
                          <span className="text-neutral-400">↳</span>
                          <span className="text-neutral-400">{t('recruit_bonus_claim.remains_le')}</span>
                          <CustomNumberInput
                            min={0}
                            className="w-12 border border-neutral-300 dark:border-neutral-600 rounded bg-transparent outline-none focus:border-ba-btn-blue"
                            value={strat.recruitBonusThreshold ?? 10}
                            onChange={(val) => onUpdateStrategy(banner.id, { recruitBonusThreshold: Math.max(0, val ?? 10) })}
                          />
                          <span className="text-neutral-400">{t('recruit_bonus_claim.proceed_if_remains')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Per-student strategy — sorted by priority */}
                  <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {sortedPickupStudents.map((student) => {
                      const config = strat.studentConfigs[student.id];
                      if (!config) return null;
                      const imgSrc = portraitMap[student.id] ? `data:image/webp;base64,${portraitMap[student.id]}` : null;
                      const isTargeting = config.mode !== 'skip';
                      const tIdx = targetingIds.indexOf(student.id);
                      const canUp = isTargeting && tIdx > 0;
                      const canDown = isTargeting && tIdx < targetingIds.length - 1;
                      return (
                        <div key={student.id} className={`pt-3 first:pt-0 ${!isTargeting ? 'opacity-50' : ''}`}>
                          <div className="flex items-center gap-2.5 mb-2">
                            {imgSrc ? (
                              <img src={imgSrc} className="w-7 h-7 rounded-full object-cover border border-neutral-300 dark:border-neutral-600 shrink-0" alt={student.name} />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 shrink-0" />
                            )}
                            <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100">{student.name}</span>
                            {isTargeting && (
                              <div className="flex items-center gap-2 ml-auto">
                                <span className="text-[10px] font-bold text-neutral-400 tabular-nums" style={monoStyle}>
                                  {t('rank_label', { priority: config.priority })}
                                </span>
                                <div className="flex flex-col rounded-md overflow-hidden border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800">
                                  <button
                                    type="button"
                                    disabled={!canUp}
                                    onClick={() => swapPriority(student.id, targetingIds[tIdx - 1])}
                                    className="h-5 w-7 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:bg-ba-btn-blue/20 hover:text-[#06262f] dark:hover:text-[#06262f] disabled:opacity-20 disabled:cursor-not-allowed transition-colors border-b border-neutral-200 dark:border-neutral-700"
                                  >
                                    <FaChevronUp size={9} />
                                  </button>
                                  <button
                                    type="button"
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
                          <ModeSegment value={config.mode} onChange={(newMode) => handleModeChange(banner, strat, student.id, newMode)} />
                          {config.mode === 'opportunistic' && (
                            <div className="mt-2 items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                              <span>{banner.useChargeSystem ? t('condition.label_charge') : t('condition.label')}</span>
                              <CustomNumberInput
                                className="inline-block w-12 border border-neutral-300 dark:border-neutral-600 rounded bg-transparent outline-none focus:border-amber-400"
                                value={config.opportunisticThreshold}
                                onChange={(val) => onUpdateStudentConfig(banner.id, student.id, { opportunisticThreshold: val || 0 })}
                              />
                              <span>{banner.useChargeSystem ? t('condition.try_pulls_charge') : t('condition.try_pulls')}</span>
                            </div>
                          )}
                          {/* "Intentional spark" has no equivalent under the new recruit charge system —
                              its checkpoints (100/200 pulls) trigger automatically. */}
                          {isTargeting && !banner.useChargeSystem && (
                            <div className="mt-2 space-y-1">
                              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-neutral-600 dark:text-neutral-300">
                                <input
                                  type="checkbox"
                                  className="rounded border-neutral-300 w-3 h-3 accent-ba-btn-blue"
                                  checked={config.intentionalSpark}
                                  onChange={(e) => onUpdateStudentConfig(banner.id, student.id, { intentionalSpark: e.target.checked })}
                                />
                                {t('intentional_spark.label')}
                              </label>
                              {config.intentionalSpark && (
                                <div className="flex items-center gap-1 pl-5 text-xs">
                                  <span className="text-neutral-400">↳</span>
                                  <span className="text-neutral-400">{t('intentional_spark.after_obtain')}</span>
                                  <CustomNumberInput
                                    min={10}
                                    max={190}
                                    className="w-12 border border-neutral-300 dark:border-neutral-600 rounded bg-transparent outline-none focus:border-ba-btn-blue"
                                    value={config.intentionalSparkThreshold || 20}
                                    onChange={(val) => onUpdateStudentConfig(banner.id, student.id, { intentionalSparkThreshold: val || 20 })}
                                  />
                                  <span className="text-neutral-400">{t('intentional_spark.proceed_if_remains')}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Sim stats strip */}
                  {gachaSimResult && isParticipating && (
                    <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3 space-y-2">
                      {/* Banner avg cost */}
                      {bannerSim && (
                        <div className="flex items-center gap-4 text-xs flex-wrap" style={monoStyle}>
                          <span className="text-neutral-400 uppercase tracking-wider text-[10px]">{t('banner_avg_cost')}</span>
                          <span className="flex items-center gap-1 font-bold text-neutral-800 dark:text-neutral-100">
                            {pyroxeneIcon ? <GameImg src={pyroxeneIcon} size={16} /> : <FaGem size={11} style={{ color: '#77e0ff' }} />}
                            {fmt(bannerSim.avgCost)}
                            <span className="text-neutral-400 font-normal">
                              ({Math.round(bannerSim.avgPulls)}
                              {t('unit_pulls')})
                            </span>
                          </span>
                        </div>
                      )}
                      {/* Recruit count bonus progress — reward table applied via getRecruitCountReward */}
                      {banner.useChargeSystem && bannerSim && (
                        <div className="text-[10px] text-neutral-400" style={monoStyle}>
                          {t('recruit_count_bonus_note', { count: Math.round(bannerSim.avgPulls) })}
                        </div>
                      )}
                      {/* Per-pickup student obtain rates */}
                      {banner.pickupStudents.some((s) => {
                        const cfg = strat.studentConfigs[s.id];
                        return cfg && cfg.mode !== 'skip' && gachaSimResult.studentStats[s.id];
                      }) && (
                        <div className="flex flex-wrap items-center gap-3 text-xs" style={monoStyle}>
                          <span className="text-neutral-400 uppercase tracking-wider text-[10px]">{tResultView('student_stats.rate_obtain')}</span>
                          {banner.pickupStudents.map((s) => {
                            const cfg = strat.studentConfigs[s.id];
                            if (!cfg || cfg.mode === 'skip') return null;
                            const stat = gachaSimResult.studentStats[s.id];
                            if (!stat) return null;
                            return (
                              <span key={s.id} className="flex items-center gap-1.5 whitespace-nowrap">
                                {portraitMap[s.id] ? <img src={`data:image/webp;base64,${portraitMap[s.id]}`} alt={s.name} className="w-4 h-4 rounded-full object-cover" /> : null}
                                <span className="text-neutral-600 dark:text-neutral-300">{s.name}</span>
                                <b style={{ color: rateColor(stat.obtainRate) }}>{stat.obtainRate.toFixed(1)}%</b>
                                {stat.avgEleph > 0 && (
                                  <span className="text-neutral-400">
                                    +{Math.round(stat.avgEleph)}
                                    {tResultView('student_stats.chart_x_eleph')}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
