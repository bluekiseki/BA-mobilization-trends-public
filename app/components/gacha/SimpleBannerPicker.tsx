// app/components/gacha/SimpleBannerPicker.tsx
// Simple-mode replacement for BannerPlanner_v2: one row per banner, tap a student's portrait to target
// them. Everything else (banner activation, priority order, pull budget) is derived from that single
// action — see handleToggleStudent below — so a newcomer never has to touch a banner-level control.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaHistory, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { TbAlertTriangle, TbCalendarOff } from 'react-icons/tb';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { SheetIcon } from '~/components/common/SheetIcon';
import type { BannerStrategy, StudentStrategyConfig } from '~/types/gacha';
import type { BannerPeriod } from '~/utils/gachaData';

interface Props {
  banners: BannerPeriod[];
  strategies: Record<string, BannerStrategy>;
  onUpdateStrategy: (bannerId: string, updates: Partial<BannerStrategy>) => void;
  onUpdateStudentConfig: (bannerId: string, studentId: number, updates: Partial<StudentStrategyConfig>) => void;
  onResetPlannerData?: () => void;
}

const monoStyle = { fontFamily: 'inherit' };

export default function SimpleBannerPicker({ banners, strategies, onUpdateStrategy, onResetPlannerData }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.banner_planner' });
  const { t: t_g } = useTranslation('game');
  const [showOldBanners, setShowOldBanners] = useState(false);

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

  // Toggling a student is the only interaction this component offers. It derives everything else a
  // banner needs: activation (any non-skip pick), and budget (200 pulls per "must" pick — same unit
  // BannerPlanner_v2's handleModeChange uses). Untouched banners/students are left exactly as they
  // were configured in expert mode, so switching modes never discards a setting.
  const handleToggleStudent = (banner: BannerPeriod, strat: BannerStrategy, studentId: number, select: boolean) => {
    const current = strat.studentConfigs[studentId];
    const nextConfigs: Record<number, StudentStrategyConfig> = {
      ...strat.studentConfigs,
      [studentId]: select ? { ...current, mode: 'must', priority: nextClickPriority(strat.studentConfigs) } : { ...current, mode: 'skip' },
    };
    const mustCount = Object.values(nextConfigs).filter((cfg) => cfg.mode === 'must').length;
    const anySelected = Object.values(nextConfigs).some((cfg) => cfg.mode !== 'skip');
    const updates: Partial<BannerStrategy> = { isActive: anySelected, studentConfigs: nextConfigs };
    if (mustCount > 0) updates.maxPull = mustCount * 200;
    onUpdateStrategy(banner.id, updates);
  };

  return (
    <div className="space-y-2">
      {(hiddenCount > 0 || showOldBanners || activePastBannerIds.length > 0 || onResetPlannerData) && (
        <div className="flex justify-end gap-2">
          {onResetPlannerData && (
            <button
              onClick={onResetPlannerData}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-500 dark:text-red-400 hover:border-red-400 dark:hover:border-red-600 hover:text-red-600 dark:hover:text-red-300 transition-colors"
            >
              <TbAlertTriangle size={13} />
              {t('header.reset_planner')}
            </button>
          )}
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

      {/* Full-bleed on mobile (page wraps content in px-2) so the row padding isn't doubled up against
          the screen edge; a plain white surface in light mode. */}
      <div className="-mx-2 overflow-hidden border-y border-neutral-200 bg-white divide-y divide-neutral-200 sm:mx-0 dark:border-neutral-800 dark:bg-neutral-900 dark:divide-neutral-700">
        {visibleBanners.map((banner) => {
          const strat = strategies[banner.id];
          if (!strat) return null;
          const isPast = new Date(banner.endTime) < now;

          return (
            <div key={banner.id} className={`px-3 py-3 transition ${isPast ? 'opacity-60 hover:opacity-100' : ''}`}>
              {/* Period + badges */}
              <div className="flex items-center gap-2 flex-wrap text-xs text-neutral-500 dark:text-neutral-400 mb-2" style={monoStyle}>
                <span className={isPast ? 'line-through text-neutral-400' : ''}>{banner.startTime.split(' ')[0]}</span>
                <span className="text-neutral-300 dark:text-neutral-700">~</span>
                <span className={isPast ? 'line-through text-neutral-400' : ''}>{banner.endTime.split(' ')[0]}</span>
                {banner.isLimitedBanner && !banner.isFes && <span className="rounded bg-ba-btn-yellow px-1.5 py-0.5 text-[10px] font-bold text-[#3a3304]">{t_g('limitedShort')}</span>}
                {banner.isFes && <span className="rounded bg-ba-btn-blue px-1.5 py-0.5 text-[10px] font-bold text-[#06262f]">{t('badge.fes')}</span>}
                {banner.freePulls > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400">
                    {t('free_pulls_label', { count: banner.freePulls })}
                  </span>
                )}
                {!banner.useChargeSystem && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400">{t('badge.point_system')}</span>
                )}
              </div>

              {/* Pickup students — click a portrait to target it */}
              <div className="flex flex-wrap gap-2">
                {banner.pickupStudents.map((student) => {
                  const cfg = strat.studentConfigs[student.id];
                  const selected = !!cfg && cfg.mode !== 'skip';
                  return (
                    <Tooltip key={student.id} placement="top" overlay={<span className="text-xs font-bold">{student.name}</span>} mouseEnterDelay={0.05}>
                      <button
                        type="button"
                        onClick={() => handleToggleStudent(banner, strat, student.id, !selected)}
                        className={`relative w-14 h-14 shrink-0 overflow-hidden rounded-lg transition ${
                          selected ? 'ring-2 ring-ba-btn-blue' : 'opacity-40 grayscale hover:opacity-70 hover:grayscale-0'
                        }`}
                      >
                        <SheetIcon sheet="student" id={student.id} alt={student.name} fallback={<div className="w-full h-full bg-neutral-200 dark:bg-neutral-700" />} />
                        <div className="absolute top-0 -left-0.5 -right-0.5 flex justify-between px-0.5 pointer-events-none">
                          {student.isRerun ? <span className="rounded-sm bg-blue-600/90 px-1 text-[9px] font-black text-white backdrop-blur-[1px] whitespace-nowrap">{t_g('rerun')}</span> : <span />}
                          <div className="flex gap-px">
                            {student.isFes && <span className="rounded-sm bg-ba-btn-blue/90 px-1 text-[8px] font-black text-[#06262f] whitespace-nowrap">{t_g('fest')}</span>}
                            {!student.isFes && student.isLimited && (
                              <span className="rounded-sm bg-ba-btn-yellow/90 px-1 text-[8px] font-black text-[#3a3304] whitespace-nowrap">{t_g('limitedShort')}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Click order becomes pull priority (BannerPlanner_v2's swap-priority control is hidden in simple mode) —
// the next click always lands one past the highest priority already claimed by a targeted student.
function nextClickPriority(configs: Record<number, StudentStrategyConfig>): number {
  const claimed = Object.values(configs)
    .filter((cfg) => cfg.mode !== 'skip')
    .map((cfg) => cfg.priority);
  return claimed.length > 0 ? Math.max(...claimed) + 1 : 1;
}
