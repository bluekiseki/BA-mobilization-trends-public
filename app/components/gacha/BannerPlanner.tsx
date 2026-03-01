// app/components/gacha/BannerPlanner.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCalendarAlt, FaSortNumericDown, FaGem, FaLayerGroup, FaHistory, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import type { BannerStrategy, StudentStrategyConfig } from '~/types/gacha';
import type { BannerPeriod } from '~/utils/gachaData';
import { CustomNumberInput } from '../CustomInput';

interface Props {
  banners: BannerPeriod[];
  strategies: Record<string, BannerStrategy>;
  portraitMap: Record<number, string>;
  onUpdateStrategy: (bannerId: string, updates: Partial<BannerStrategy>) => void;
  onUpdateStudentConfig: (bannerId: string, studentId: number, updates: Partial<StudentStrategyConfig>) => void;
  currentServer: 'KR' | 'JP';
}

const Badge = ({ children, variant, className }: { children: React.ReactNode; variant?: string; className?: string }) => {
  let bgClass = 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600';

  if (variant === 'purple') bgClass = 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800';
  if (variant === 'warning') bgClass = 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800';
  if (variant === 'success') bgClass = 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800';

  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${bgClass} ${className}`}>{children}</span>;
};

export default function BannerPlanner({ banners, strategies, portraitMap, onUpdateStrategy, onUpdateStudentConfig }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.banner_planner' });
  const [showOldBanners, setShowOldBanners] = useState(false);
  const bannerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const now = new Date();

  // 1. Banner filtering (6-month basis)
  const { visibleBanners, hiddenCount } = useMemo(() => {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);

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

  // 2. Scroll on initial load
  useEffect(() => {
    if (visibleBanners.length === 0) return;

    const activeBanner =
      visibleBanners.find((b) => {
        const start = new Date(b.startTime);
        const end = new Date(b.endTime);
        return now >= start && now <= end;
      }) || visibleBanners.find((b) => new Date(b.startTime) > now);

    if (activeBanner && bannerRefs.current[activeBanner.id]) {
      setTimeout(() => {
        bannerRefs.current[activeBanner.id]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleBanners]);

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header area */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-gray-700 shrink-0">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <FaCalendarAlt className="text-blue-500" /> {t('header.title')}
        </h2>

        {/* Toggle button for old banners */}
        {hiddenCount > 0 || showOldBanners ? (
          <button
            onClick={() => setShowOldBanners(!showOldBanners)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <FaHistory />
            {showOldBanners ? t('header.toggle_hide') : t('header.toggle_show', { count: hiddenCount })}
            {showOldBanners ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500">{t('header.auto_scroll_hint')}</span>
        )}
      </div>

      {/* Main list area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-4 min-h-0 max-h-[80vh]">
        {visibleBanners.map((banner) => {
          const strat = strategies[banner.id];
          if (!strat) return null;
          const isParticipating = strat.isActive;

          // Date calculation
          const start = new Date(banner.startTime);
          const end = new Date(banner.endTime);
          const isCurrent = now >= start && now <= end;
          const isPast = end < now;

          // Dark mode conditional styling
          const containerClass = isCurrent
            ? 'ring-2 ring-green-400 dark:ring-green-500 shadow-lg bg-white dark:bg-gray-800'
            : isParticipating
              ? 'ring-2 ring-blue-500 shadow-md bg-white dark:bg-gray-800'
              : 'border-slate-200 dark:border-gray-700 opacity-80 hover:opacity-100 bg-white dark:bg-gray-800';

          const headerBgClass = isCurrent ? 'bg-green-50 dark:bg-green-900/20' : isPast ? 'bg-slate-100 dark:bg-gray-700/50' : 'bg-slate-50 dark:bg-gray-700/30';

          return (
            <div
              key={banner.id}
              ref={(el) => {
                bannerRefs.current[banner.id] = el;
              }}
              className={`rounded-xl border transition-all duration-200 ${containerClass}`}
            >
              {/* Banner header */}
              <div className={`p-4 rounded-t-xl flex flex-col sm:flex-row gap-4 justify-between ${headerBgClass}`}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-mono ${isPast ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-500 dark:text-slate-400'}`}>
                      {banner.startTime.split(' ')[0]} ~ {banner.endTime.split(' ')[0]}
                    </span>
                    {isCurrent && <span className="text-[10px] font-bold bg-green-500 text-white px-1.5 rounded animate-pulse">{t('badge.now')}</span>}
                  </div>

                  <div className="flex flex-col gap-1">
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 leading-tight">{banner.pickupStudents.map((s) => s.name).join(' & ')}</h3>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {banner.isFes && <Badge variant="purple">{t('badge.fes')}</Badge>}
                      {banner.freePulls > 0 && <Badge variant="success">{t('badge.free_pulls', { count: banner.freePulls })}</Badge>}
                      {banner.isLimitedBanner && !banner.isFes && <Badge variant="warning">{t('badge.limited')}</Badge>}
                    </div>
                  </div>
                </div>

                {/* Activation toggle */}
                <div className="flex items-center shrink-0">
                  <label className="inline-flex items-center cursor-pointer group">
                    <input type="checkbox" className="hidden peer" checked={isParticipating} onChange={(e) => onUpdateStrategy(banner.id, { isActive: e.target.checked })} />
                    <div className="relative w-11 h-6 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    <span className="ms-3 text-sm font-bold text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {isParticipating ? t('toggle.include') : t('toggle.skip')}
                    </span>
                  </label>
                </div>
              </div>

              {/* Strategy body (Visible when participating) */}
              {isParticipating && (
                <div className="p-4 border-t border-slate-100 dark:border-gray-700 space-y-4 animate-fade-in">
                  {/* Banner budget settings */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* 1. Maximum budget */}
                    <div className="flex items-center gap-2 text-sm bg-blue-50/50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                      <FaSortNumericDown className="text-blue-500" />
                      <span className="font-bold text-slate-700 dark:text-slate-300">{t('settings.max_budget')}:</span>
                      <select
                        className="bg-white dark:bg-gray-700 border border-blue-200 dark:border-blue-700 rounded px-2 py-1 text-center font-bold outline-none text-slate-700 dark:text-slate-200 cursor-pointer"
                        value={strat.maxSparks}
                        onChange={(e) => onUpdateStrategy(banner.id, { maxSparks: Number(e.target.value) })}
                      >
                        {Array.from({ length: Math.max(3, banner.pickupStudents.length + 1) }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {t('settings.spark_option', { spark: n, pulls: n * 200 })}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{t('settings.max_budget_suffix')}</span>
                    </div>

                    {/* 2. Minimum guaranteed pulls */}
                    <div className="flex items-center gap-2 text-sm bg-indigo-50/50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800">
                      <FaLayerGroup className="text-indigo-500" />
                      <span className="font-bold text-slate-700 dark:text-slate-300">{t('settings.min_pulls')}:</span>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        className="w-16 bg-white dark:bg-gray-700 border border-indigo-200 dark:border-indigo-700 rounded px-1 py-1 text-center font-bold outline-none text-slate-700 dark:text-slate-200"
                        placeholder="0"
                        value={strat.minPulls || 0}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          onUpdateStrategy(banner.id, { minPulls: val });
                        }}
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400">{t('settings.min_pulls_suffix')}</span>
                    </div>
                  </div>

                  {/* Strategy per student */}
                  <div className="space-y-3">
                    {banner.pickupStudents.map((student) => {
                      const config = strat.studentConfigs[student.id];
                      if (!config) return null;
                      const isTargeting = config.mode !== 'skip';
                      const imgSrc = portraitMap[student.id] ? `data:image/webp;base64,${portraitMap[student.id]}` : null;

                      // Student card style
                      const cardClass = isTargeting
                        ? 'bg-white dark:bg-gray-700 border-blue-200 dark:border-blue-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-gray-800/50 border-slate-100 dark:border-gray-700 opacity-60';

                      return (
                        <div key={student.id} className={`p-3 rounded-lg border transition-colors ${cardClass}`}>
                          {/* Top: Student info and mode */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {/* Priority */}
                              {isTargeting && (
                                <CustomNumberInput
                                  min={1}
                                  max={5}
                                  className="w-8 text-center border border-blue-200 dark:border-blue-600 rounded text-sm font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-600"
                                  value={config.priority}
                                  onChange={(e) => onUpdateStudentConfig(banner.id, student.id, { priority: Number(e) })}
                                />
                              )}
                              {/* Portrait */}
                              <div className="relative shrink-0">
                                {imgSrc ? (
                                  <img src={imgSrc} className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-gray-600" alt={student.name} />
                                ) : (
                                  <div className="w-12 h-12 bg-slate-200 dark:bg-gray-600 rounded-full" />
                                )}
                              </div>
                              {/* Name */}
                              <div className="font-bold text-slate-800 dark:text-slate-100">{student.name}</div>
                            </div>

                            {/* Mode selection */}
                            <select
                              className={`text-sm font-bold border rounded px-2 py-1.5 outline-none cursor-pointer ${
                                config.mode === 'must'
                                  ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                                  : config.mode === 'opportunistic'
                                    ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
                                    : 'bg-slate-50 text-slate-500 dark:bg-gray-600 dark:text-gray-300 dark:border-gray-500'
                              }`}
                              value={config.mode}
                              onChange={(e) => onUpdateStudentConfig(banner.id, student.id, { mode: e.target.value as any })}
                            >
                              <option value="skip">{t('mode.skip')}</option>
                              <option value="must">{t('mode.must')}</option>
                              <option value="opportunistic">{t('mode.opportunistic')}</option>
                            </select>
                          </div>

                          {/* Bottom: Detailed settings */}
                          {isTargeting && (
                            <div className="mt-3 pl-3 ml-2 border-l-2 border-slate-100 dark:border-gray-600 text-xs space-y-3">
                              {/* Conditional settings */}
                              {config.mode === 'opportunistic' && (
                                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 p-2 rounded w-fit border border-amber-100 dark:border-amber-800">
                                  <span className="font-bold">{t('condition.label')}:</span>
                                  <span>{t('condition.remains_le')}</span>
                                  <input
                                    type="number"
                                    className="w-12 border border-amber-200 dark:border-amber-700 rounded text-center font-bold bg-white dark:bg-gray-700 p-1"
                                    value={config.opportunisticThreshold}
                                    onChange={(e) => onUpdateStudentConfig(banner.id, student.id, { opportunisticThreshold: Number(e.target.value) })}
                                  />
                                  <span>{t('condition.try_pulls')}</span>
                                </div>
                              )}

                              {/* Intentional spark settings */}
                              <div className="flex flex-wrap items-center gap-3">
                                <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer w-fit hover:text-purple-700 dark:hover:text-purple-400 transition-colors select-none">
                                  <input
                                    type="checkbox"
                                    className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer dark:bg-gray-600 dark:border-gray-500"
                                    checked={config.intentionalSpark}
                                    onChange={(e) => onUpdateStudentConfig(banner.id, student.id, { intentionalSpark: e.target.checked })}
                                  />
                                  <span className="flex items-center gap-1 font-bold">
                                    <FaGem className={config.intentionalSpark ? 'text-purple-500' : 'text-slate-400 dark:text-slate-500'} />
                                    {t('intentional_spark.label')}
                                  </span>
                                </label>

                                {config.intentionalSpark && (
                                  <div className="flex items-center gap-1 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded animate-fade-in border border-purple-100 dark:border-purple-800 ml-0 sm:ml-2">
                                    <span className="text-[10px]">{t('intentional_spark.option_prefix')}:</span>
                                    <span>{t('intentional_spark.after_obtain')}</span>
                                    <input
                                      type="number"
                                      step="10"
                                      min="10"
                                      max="190"
                                      className="w-10 border border-purple-200 dark:border-purple-700 rounded text-center font-bold text-purple-800 dark:text-purple-200 bg-white dark:bg-gray-700 text-[11px] p-0.5"
                                      value={config.intentionalSparkThreshold || 20}
                                      onChange={(e) => onUpdateStudentConfig(banner.id, student.id, { intentionalSparkThreshold: Number(e.target.value) })}
                                    />
                                    <span>{t('intentional_spark.proceed_if_remains')}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {/* When the list is empty */}
        {visibleBanners.length === 0 && (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500">
            {t('empty_state.no_banners')}
            {hiddenCount > 0 && <div className="text-xs mt-2">{t('empty_state.hint_show_old')}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
