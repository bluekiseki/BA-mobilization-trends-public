// app/components/gacha/BannerPlanner.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCalendarAlt, FaSortNumericDown, FaLayerGroup, FaHistory, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
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

const Badge = ({ children, variant, className = '' }: { children: React.ReactNode; variant?: string; className?: string }) => {
  let bgClass = 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';

  if (variant === 'purple') bgClass = 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
  if (variant === 'warning') bgClass = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
  if (variant === 'success') bgClass = 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800';
  if (variant === 'now') bgClass = 'bg-blue-500 text-white border-blue-600';

  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold border ${bgClass} ${className}`}>{children}</span>;
};

export default function BannerPlanner({ banners, strategies, portraitMap, onUpdateStrategy, onUpdateStudentConfig }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.banner_planner' });
  const [showOldBanners, setShowOldBanners] = useState(false);
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
        bannerRefs.current[activeBanner.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [visibleBanners]);

  return (
    <div className="space-y-3 h-full flex flex-col font-sans">
      {/* Header area */}
      <div className="flex items-center justify-between pb-2 border-b border-gray-300 dark:border-gray-700 shrink-0 px-4">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <FaCalendarAlt className="text-blue-500" /> {t('header.title')}
        </h2>

        {hiddenCount > 0 || showOldBanners ? (
          <button
            onClick={() => setShowOldBanners(!showOldBanners)}
            className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          >
            <FaHistory />
            {showOldBanners ? t('header.toggle_hide') : t('header.toggle_show', { count: hiddenCount })}
            {showOldBanners ? <FaChevronUp className="text-[10px]" /> : <FaChevronDown className="text-[10px]" />}
          </button>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">{t('header.auto_scroll_hint')}</span>
        )}
      </div>

      {/* Main list area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 min-h-0 max-h-[80vh] pr-1">
        {visibleBanners.map((banner) => {
          const strat = strategies[banner.id];
          if (!strat) return null;

          const isParticipating = strat.isActive;
          const start = new Date(banner.startTime);
          const end = new Date(banner.endTime);
          const isCurrent = now >= start && now <= end;
          const isPast = end < now;

          // Organize focusing on vertical borders (border-y) to fit the sidebar environment
          const containerClass = isCurrent
            ? 'border-y border-blue-500 bg-white dark:bg-gray-800'
            : isParticipating
              ? 'border-y border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-800'
              : 'border-y border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 opacity-75 hover:opacity-100';

          return (
            <div
              key={banner.id}
              ref={(el) => {
                bannerRefs.current[banner.id] = el;
              }}
              className={`transition-opacity duration-200 ${containerClass}`}
            >
              {/* Banner header */}
              <div className="px-4 py-2 flex justify-between items-center cursor-pointer select-none" onClick={() => onUpdateStrategy(banner.id, { isActive: !isParticipating })}>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono ${isPast ? 'text-gray-400 line-through' : 'text-gray-500'}`}>
                      {banner.startTime.split(' ')[0]} ~ {banner.endTime.split(' ')[0]}
                    </span>
                    {isCurrent && <Badge variant="now">{t('badge.now')}</Badge>}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {banner.isFes && <Badge variant="purple">{t('badge.fes')}</Badge>}
                      {banner.freePulls > 0 && <Badge variant="success">{t('badge.free_pulls', { count: banner.freePulls })}</Badge>}
                      {banner.isLimitedBanner && !banner.isFes && <Badge variant="warning">{t('badge.limited')}</Badge>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {banner.pickupStudents.map((student) => {
                      const imgSrc = portraitMap[student.id] ? `data:image/webp;base64,${portraitMap[student.id]}` : null;
                      return (
                        <Tooltip key={`header-${student.id}`} placement="top" overlay={<span className="text-xs">{student.name}</span>}>
                          <div className="relative">
                            {imgSrc ? (
                              <img src={imgSrc} className="w-10 h-10 rounded-full border border-gray-300 dark:border-gray-600 object-cover" alt={student.name} />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
                            )}
                          </div>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>

                {/* Activation toggle */}
                <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                  <label className="inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={isParticipating} onChange={(e) => onUpdateStrategy(banner.id, { isActive: e.target.checked })} />
                    <div className="relative w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* Strategy body */}
              {isParticipating && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  {/* Banner budget settings */}
                  <div className="flex flex-col gap-2 px-2 py-2 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-1.5 text-xs">
                      <FaSortNumericDown className="text-gray-400" />
                      <span className="font-medium text-gray-600 dark:text-gray-300">{t('settings.max_budget')}:</span>
                      <select
                        className="bg-transparent border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 outline-none w-24"
                        value={strat.maxSparks}
                        onChange={(e) => onUpdateStrategy(banner.id, { maxSparks: Number(e.target.value) })}
                      >
                        {Array.from({ length: Math.max(3, banner.pickupStudents.length + 1) }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n} className="dark:bg-gray-800">
                            {t('settings.spark_option', { spark: n, pulls: n * 200 })}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <FaLayerGroup className="text-gray-400" />
                      <span className="font-medium text-gray-600 dark:text-gray-300">{t('settings.min_pulls')}:</span>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        className="w-16 bg-transparent border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 text-center outline-none"
                        value={strat.minPulls || 0}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          onUpdateStrategy(banner.id, { minPulls: val });
                        }}
                      />
                    </div>
                  </div>

                  {/* Strategy per student */}
                  <div className="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
                    {banner.pickupStudents.map((student) => {
                      const config = strat.studentConfigs[student.id];
                      if (!config) return null;

                      const isTargeting = config.mode !== 'skip';
                      const imgSrc = portraitMap[student.id] ? `data:image/webp;base64,${portraitMap[student.id]}` : null;
                      const rowOpacity = isTargeting ? 'opacity-100' : 'opacity-50 bg-gray-50 dark:bg-gray-800/30';

                      const handleModeChange = (newMode: 'skip' | 'must' | 'opportunistic') => {
                        const needMaxSparks = Object.entries(strategies[banner.id].studentConfigs).filter(([id, cfg]) => (student.id === Number(id) ? newMode : cfg.mode) === 'must').length;

                        if (needMaxSparks > strategies[banner.id].maxSparks) {
                          onUpdateStrategy(banner.id, {
                            ...strategies[banner.id],
                            maxSparks: needMaxSparks,
                            studentConfigs: {
                              ...strategies[banner.id].studentConfigs,
                              [student.id]: { ...strategies[banner.id].studentConfigs[student.id], mode: newMode },
                            },
                          });
                        } else {
                          onUpdateStudentConfig(banner.id, student.id, { mode: newMode });
                        }
                      };

                      return (
                        <div key={student.id} className={`px-2 py-2 flex flex-col gap-2 transition-opacity ${rowOpacity}`}>
                          {/* Student Info: Fixed layout for narrow screens */}
                          <div
                            className={`flex items-center gap-2 shrink-0 ${!isTargeting ? 'cursor-pointer hover:opacity-80' : ''}`}
                            onClick={() => {
                              if (!isTargeting) handleModeChange('must');
                            }}
                          >
                            <div className="w-7 shrink-0" onClick={(e) => e.stopPropagation()}>
                              {isTargeting && (
                                <Tooltip placement="top" overlay={<span className="text-xs">{t('priority.tooltip')}</span>}>
                                  <div className="flex flex-col items-center gap-0.5">
                                    <CustomNumberInput
                                      min={1}
                                      max={20}
                                      className="w-full text-center border border-gray-300 dark:border-gray-600 rounded text-xs font-bold bg-transparent"
                                      value={config.priority}
                                      onChange={(e) => onUpdateStudentConfig(banner.id, student.id, { priority: Number(e) })}
                                    />
                                    <span className="text-[8px] text-gray-400 dark:text-gray-500 leading-none">{t('priority.label')}</span>
                                  </div>
                                </Tooltip>
                              )}
                            </div>

                            <Tooltip placement="top" overlay={<span className="text-xs">{student.name}</span>}>
                              <div className="shrink-0 cursor-help flex flex-col items-center">
                                {imgSrc ? (
                                  <img src={imgSrc} className="w-12 h-12 rounded-md border border-gray-300 dark:border-gray-600 object-cover" alt={student.name} />
                                ) : (
                                  <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-md" />
                                )}
                                <span className="text-[9px] text-gray-500 mt-0.5 truncate w-12 text-center">{student.name}</span>
                              </div>
                            </Tooltip>

                            <div className="shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
                              <select
                                className={`text-xs font-medium border rounded px-1.5 py-1 outline-none bg-transparent ${
                                  config.mode === 'must' ? 'text-red-600 border-red-300' : config.mode === 'opportunistic' ? 'text-amber-600 border-amber-300' : 'text-gray-500 border-gray-300'
                                }`}
                                value={config.mode}
                                onChange={(e) => handleModeChange(e.target.value as any)}
                              >
                                <option value="skip" className="dark:bg-gray-800">
                                  {t('mode.skip')}
                                </option>
                                <option value="must" className="dark:bg-gray-800">
                                  {t('mode.must')}
                                </option>
                                <option value="opportunistic" className="dark:bg-gray-800">
                                  {t('mode.opportunistic')}
                                </option>
                              </select>
                            </div>
                          </div>

                          {/* Settings: Indent with padding (pl-10) equal to icon width */}
                          {isTargeting && (
                            <div className="flex flex-col gap-1.5 pl-10 text-xs text-gray-600 dark:text-gray-400">
                              {config.mode === 'opportunistic' && (
                                <div className="flex items-center gap-1">
                                  <span>{t('condition.label')}:</span>
                                  <input
                                    type="number"
                                    className="w-10 border border-gray-300 dark:border-gray-600 rounded text-center bg-transparent outline-none focus:border-amber-500"
                                    value={config.opportunisticThreshold}
                                    onChange={(e) => onUpdateStudentConfig(banner.id, student.id, { opportunisticThreshold: Number(e.target.value) })}
                                  />
                                  <span>{t('condition.try_pulls')}</span>
                                </div>
                              )}

                              <div className="flex flex-col gap-1">
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 w-3 h-3"
                                    checked={config.intentionalSpark}
                                    onChange={(e) => onUpdateStudentConfig(banner.id, student.id, { intentionalSpark: e.target.checked })}
                                  />
                                  <span className="whitespace-nowrap">{t('intentional_spark.label')}</span>
                                </label>

                                {config.intentionalSpark && (
                                  <div className="flex items-center gap-1 pl-4">
                                    <span className="text-gray-400">↳</span>
                                    <input
                                      type="number"
                                      step="10"
                                      min="10"
                                      max="190"
                                      className="w-12 border border-gray-300 dark:border-gray-600 rounded text-center bg-transparent outline-none focus:border-purple-500"
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
      </div>
    </div>
  );
}
