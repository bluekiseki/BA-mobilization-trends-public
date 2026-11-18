// src/components/ApCalculator.tsx

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
// import { ChevronIcon } from '../../../components/common/SvgIcons';
import type { IconData } from '~/types/plannerData';
import { getGlobalEventDates } from '~/data/globalEventDates';
import { getDefaultApConfig, resolveApConfig } from '../../../utils/ApCalculatorConfig';
import { CustomNumberInput } from '../../../components/common/CustomInput';
import { IoIosClose } from 'react-icons/io';
import { FaRedo } from 'react-icons/fa';
import { computeDailyAp, toLocalISOString, type DailyBreakdown } from '../logic/apDaily';

interface ApCalculatorProps {
  eventId: number;
  startTime: string;
  endTime: string;
  iconData: IconData;
  onCalculate: (totalAp: number) => void;
  totalApUsed?: number;
}

interface SelectConfigItem {
  label: string;
  type: 'select';
  value: number;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: number[];
}

interface NumberConfigItem {
  label: string;
  type: 'number';
  value: number;
  onChange: (e: number | null) => void;
  options?: undefined;
}

type ConfigGridItem = SelectConfigItem | NumberConfigItem;

const formatDateTimeForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const ApCalculator = ({ eventId, startTime, endTime, iconData, onCalculate, totalApUsed = 0 }: ApCalculatorProps) => {
  // const [isCollapsed, setIsCollapsed] = useState(false);
  const [showDetails, setShowDetails] = useState(false); // Details display state

  const { setApConfig: setConfig, apConfig: savedConfig } = usePlanForEvent(eventId);
  const config = useMemo(() => resolveApConfig(savedConfig, startTime, endTime), [savedConfig, startTime, endTime]);

  const [result, setResult] = useState<{
    daily: Record<string, DailyBreakdown>;
    total: number;
  } | null>(null);

  const { t } = useTranslation(['planner', 'game']);
  const { t: t_g } = useTranslation('game');
  const { t: t_ui } = useTranslation('ui');

  const handleCalculate = useCallback(() => {
    const next = computeDailyAp(config);
    setResult(next);
    onCalculate(next.total);
  }, [config]);

  useEffect(() => {
    handleCalculate();
  }, [handleCalculate]);

  const setNumericConfig = (key: keyof typeof config, value: string, max?: number) => {
    let numValue = parseInt(value) || 0;
    console.log('[setNumericConfig] numvalue:', numValue, config, value, max);
    if (max !== undefined) {
      numValue = Math.min(numValue, max);
    }

    setConfig({ ...config, [key]: Math.max(0, numValue) });
  };

  const handleAddPackageDate = () => {
    let newDate: string;
    const currentDates = config.apPackageDates;

    if (currentDates.length === 0) {
      // If there is no package, set the calculator start date to default
      newDate = config.startDate.slice(0, 10);
    } else {
      // Find the last package date and set it to 14 days later (the day after the end date)
      const sortedDates = [...currentDates].sort();
      const lastDateStr = sortedDates[sortedDates.length - 1];

      const nextAvailableDate = new Date(lastDateStr);
      nextAvailableDate.setDate(nextAvailableDate.getDate() + 14); // After 14 days

      newDate = toLocalISOString(nextAvailableDate);
    }
    setConfig({
      ...config,
      apPackageDates: [...config.apPackageDates, newDate],
    });
  };

  const handleRemovePackageDate = (index: number) => {
    setConfig({
      ...config,
      apPackageDates: config.apPackageDates.filter((_, i) => i !== index),
    });
  };
  const handlePackageDateChange = (index: number, value: string) => {
    const newDates = [...config.apPackageDates];
    newDates[index] = value;
    setConfig({ ...config, apPackageDates: newDates });
  };

  const globalDates = getGlobalEventDates()[eventId];

  const inputClass = 'w-full p-1.5 text-sm rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200';
  const labelClass = 'text-xs font-semibold dark:text-neutral-300';
  const shortcutBtnClass = 'bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-neutral-300 px-2 py-1 rounded-md text-xs';

  return (
    <>
      <div className="flex justify-between items-center group">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
          <img src={`data:image/webp;base64,${iconData.Currency?.['5']}`} className="inline w-8 h-8 ml-0.5 object-cover rounded-full" />
          {t('page.apCalculator')}
        </h2>
        <button
          onClick={() => setConfig(getDefaultApConfig(startTime, endTime))}
          className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          <FaRedo size={9} />
          {t_ui('reset')}
        </button>
      </div>

      <div data-component-name="ApCalculator" className="mt-4 space-y-4">
        <h3 className="font-bold text-center text-lg dark:text-neutral-200">
          {t('ui.calculationResult')} {t('ui.total')} <span className="text-blue-600 dark:text-blue-400">{result ? result.total.toLocaleString() : '?'}</span> AP
        </h3>
        {result && totalApUsed > 0 && (
          <div className={`text-right text-sm font-semibold ${totalApUsed > result.total ? 'text-red-500 dark:text-red-400' : 'text-neutral-600 dark:text-neutral-400'}`}>
            {t('ui.usedAp')} {totalApUsed.toLocaleString()} / {result.total.toLocaleString()}
          </div>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>{t('placeholder.startTime')}</label>
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <button onClick={() => setConfig({ ...config, startDate: formatDateTimeForInput(new Date()) })} className={shortcutBtnClass}>
                  {t('placeholder.currentTime')}
                </button>
                <button onClick={() => setConfig({ ...config, startDate: startTime.slice(0, 16) })} className={shortcutBtnClass}>
                  {t('placeholder.eventStart')}
                </button>
                {globalDates && (
                  <button onClick={() => globalDates && setConfig({ ...config, startDate: globalDates.start })} className={shortcutBtnClass}>
                    {t('placeholder.globalStart')}
                  </button>
                )}
              </div>
              <input type="datetime-local" value={config.startDate} onChange={(e) => setConfig({ ...config, startDate: e.target.value })} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>{t('placeholder.endTime')}</label>
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <button onClick={() => setConfig({ ...config, endDate: endTime.slice(0, 16) })} className={shortcutBtnClass}>
                  {t('placeholder.eventEnd')}
                </button>
                {globalDates && (
                  <button onClick={() => globalDates && setConfig({ ...config, endDate: globalDates.end })} className={shortcutBtnClass}>
                    {t('placeholder.globalEnd')}
                  </button>
                )}
              </div>
              <input type="datetime-local" value={config.endDate} onChange={(e) => setConfig({ ...config, endDate: e.target.value })} className={inputClass} />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>
                {t('ui.cafeRank')} (Lv.<span className="text-blue-600 dark:text-blue-400">{config.cafeRank}</span>)
              </label>
              <input type="range" min="6" max="10" value={config.cafeRank} onChange={(e) => setNumericConfig('cafeRank', e.target.value)} className="w-full" />
              <div className="flex justify-between text-xs text-neutral-400 dark:text-neutral-500 px-0.5">
                {[6, 7, 8, 9, 10].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className={labelClass}>{t('label.dailyPyroRefills')}</label>
              <CustomNumberInput min={0} max={20} value={config.gemRefills} onChange={(e) => e != null && setNumericConfig('gemRefills', String(e), 20)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(
              [
                {
                  label: t('game:tacticalChallenge') + ' (x90 AP)',
                  type: 'select',
                  value: config.pvpRefills,
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setNumericConfig('pvpRefills', e.target.value, 4),
                  options: [0, 1, 2, 3, 4],
                },
                {
                  label: t('ui.hardFarming') + ' (x-20 AP)',
                  type: 'number',
                  value: config.hardStages,
                  onChange: (e: number | null) => setNumericConfig('hardStages', String(e ?? 0)),
                },
                {
                  label: t('ui.scrimmageCount'),
                  type: 'number',
                  value: config.exchangeRuns,
                  onChange: (e: number | null) => setNumericConfig('exchangeRuns', String(e ?? 0)),
                },
                {
                  label: t('ui.scrimmageCost'),
                  type: 'select',
                  value: config.exchangeCost,
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setNumericConfig('exchangeCost', e.target.value),
                  options: [0, 5, 10, 15],
                },
              ] satisfies ConfigGridItem[]
            ).map((item, index) => (
              <div key={index} className="space-y-1">
                <label className={labelClass}>{item.label}</label>
                {item.type === 'select' ? (
                  <select value={item.value} onChange={item.onChange} className={inputClass + ' bg-white dark:bg-neutral-700'}>
                    {item.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <CustomNumberInput value={item.value} onChange={item.onChange} className={inputClass} />
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className={labelClass}>{t('ui.otherDailyApConsumption')}</label>
                <div className="flex rounded overflow-hidden text-[10px] border dark:border-neutral-600">
                  <button
                    onClick={() => setConfig({ ...config, miscDailySpend: Math.abs(config.miscDailySpend) })}
                    className={`px-1.5 py-0.5 transition-colors ${config.miscDailySpend >= 0 ? 'bg-red-500 text-white' : 'text-neutral-400 dark:text-neutral-500 dark:bg-neutral-700'}`}
                  >
                    {t('ui.consumed')}
                  </button>
                  <button
                    onClick={() => setConfig({ ...config, miscDailySpend: -Math.abs(config.miscDailySpend) })}
                    className={`px-1.5 py-0.5 transition-colors ${config.miscDailySpend < 0 ? 'bg-green-500 text-white' : 'text-neutral-400 dark:text-neutral-500 dark:bg-neutral-700'}`}
                  >
                    {t_ui('acquire')}
                  </button>
                </div>
              </div>
              <CustomNumberInput
                // type="number"
                min={0}
                value={Math.abs(config.miscDailySpend)}
                onChange={(e) => {
                  const abs = Math.max(0, e || 0);
                  setConfig({ ...config, miscDailySpend: config.miscDailySpend < 0 ? -abs : abs });
                }}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>{t('ui.prefarmedAp')}</label>
              <CustomNumberInput value={config.bonusAp} onChange={(e) => e != null && setNumericConfig('bonusAp', String(e))} className={inputClass} />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>{t('ui.aronaAttendanceStartDate')}</label>
              <input type="date" value={config.attendanceStartDate} onChange={(e) => setConfig({ ...config, attendanceStartDate: e.target.value })} className={inputClass} />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>{t('ui.aronaAttendanceDay')}</label>
              <select value={config.attendanceStartDay} onChange={(e) => setNumericConfig('attendanceStartDay', e.target.value)} className={inputClass + ' bg-white dark:bg-neutral-700'}>
                <option value={1}>
                  1{t('common.day')} (20k {t_g('credit')})
                </option>
                <option value={2}>
                  2{t('common.day')} (3 {t('common.normalReport')})
                </option>
                <option value={3}>3{t('common.day')} (50 AP)</option>
                <option value={4}>
                  4{t('common.day')} (20k {t_g('credit')})
                </option>
                <option value={5}>
                  5{t('common.day')} (50 {t_g('pyroxene')})
                </option>
                <option value={6}>
                  6{t('common.day')} (40k {t_g('credit')})
                </option>
                <option value={7}>
                  7{t('common.day')} (1 {t('common.advancedReport')})
                </option>
                <option value={8}>8{t('common.day')} (100 AP)</option>
                <option value={9}>
                  9{t('common.day')} (40k {t_g('credit')})
                </option>
                <option value={10}>
                  10{t('common.day')} (100 {t_g('pyroxene')})
                </option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>{t('label.twoWeekApPackage')} (x150 AP)</label>
          <div className="space-y-2 mt-1">
            {config.apPackageDates.map((date, index) => (
              <div key={index} className="flex items-center gap-2">
                <input type="date" value={date} onChange={(e) => handlePackageDateChange(index, e.target.value)} className={inputClass} />
                <button
                  onClick={() => handleRemovePackageDate(index)}
                  aria-label="Delete"
                  className="w-7 h-7 flex items-center justify-center shrink-0 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded text-base leading-none"
                >
                  <IoIosClose />
                </button>
              </div>
            ))}
            <button
              onClick={handleAddPackageDate}
              className="w-full bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white font-semibold py-1 rounded-md text-sm transition-colors"
            >
              + {t('button.addPackageStartDate')}
            </button>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{t('ui.packageSubscriptionNotice')}</p>
        </div>

        {result && (
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg dark:text-neutral-200">
                {t('ui.calculationResult')} {t('ui.total')} <span className="text-blue-600 dark:text-blue-400">{result.total.toLocaleString()}</span> AP
              </h3>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 dark:text-neutral-300 transition-colors"
              >
                {showDetails ? t('button.hideDetails') : t('button.viewDailyDetails')}
              </button>
            </div>
            <div className="mt-2 rounded-lg max-h-72 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-700 text-sm">
              {Object.entries(result.daily).map(([date, daily]) => {
                const d = new Date(date);
                const dayOfWeek = t(`common.${DAYS[d.getUTCDay() as DayIndex]}`);

                return (
                  <div key={date} className="py-2 first:pt-0">
                    <div className="flex justify-between items-center">
                      <span className="font-bold dark:text-neutral-200">
                        {date.slice(5).replace('-', '/')} ({dayOfWeek})
                      </span>
                      <span className="font-bold text-blue-700 dark:text-blue-400">{Math.round(daily.total).toLocaleString()} AP</span>
                    </div>
                    {showDetails && (
                      <div className="mt-1.5 pt-1.5 border-t dark:border-neutral-700 text-xs space-y-0.5">
                        <div className="flex flex-wrap gap-x-3 text-green-600 dark:text-green-400">
                          <span>
                            +{Math.round(daily.natural)} {t('apBreakdown.naturalRegen')}
                          </span>
                          <span>
                            +{daily.dailyQuests} {t('apBreakdown.dailyQuests')}
                          </span>
                          <span>
                            +{Math.round(daily.cafe)} {t_ui('cafe')}
                          </span>
                          {daily.gem > 0 && (
                            <span>
                              +{daily.gem} {t_g('pyroxene')}
                            </span>
                          )}
                          {daily.pvp > 0 && (
                            <span>
                              +{daily.pvp} {t('game:tacticalChallenge')}
                            </span>
                          )}
                          {daily.apPackage > 0 && (
                            <span>
                              +{daily.apPackage} {t('apSource.apPackage')}
                            </span>
                          )}
                          {daily.weekly > 0 && (
                            <span>
                              +{daily.weekly} {t_ui('weeklyQuests')}
                            </span>
                          )}
                          {daily.attendance > 0 && (
                            <span>
                              +{daily.attendance} {t('apSource.attendance')}
                            </span>
                          )}
                          {daily.spendMisc < 0 && (
                            <span>
                              +{-daily.spendMisc} {t('apBreakdown.otherConsumption')}
                            </span>
                          )}
                        </div>
                        {(daily.spendHard > 0 || daily.spendExchange > 0 || daily.spendMisc > 0) && (
                          <div className="flex flex-wrap gap-x-3 text-red-600 dark:text-red-400">
                            {daily.spendHard > 0 && (
                              <span>
                                -{daily.spendHard} {t('apBreakdown.hardMode')}
                              </span>
                            )}
                            {daily.spendExchange > 0 && (
                              <span>
                                -{daily.spendExchange} {t('apBreakdown.scrimmage')}
                              </span>
                            )}
                            {daily.spendMisc > 0 && (
                              <span>
                                -{daily.spendMisc} {t('apBreakdown.otherConsumption')}
                              </span>
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
        )}
      </div>
    </>
  );
};
