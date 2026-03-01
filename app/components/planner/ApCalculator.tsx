// src/components/ApCalculator.tsx

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
// import { ChevronIcon } from '../Icon';
import type { IconData } from '~/types/plannerData';
import { getGlobalEventDates } from '~/data/globalEventDates';
import { CustomNumberInput } from '../CustomInput';

// AP generation per hour by cafe rank
const CAFE_AP_PER_HOUR = [0, 0, 0, 0, 0, 0, 19.49, 22.32, 25.15, 27.97, 30.8]; // Ranks 0 to 10

interface ApCalculatorProps {
  eventId: number;
  startTime: string;
  endTime: string;
  iconData: IconData;
  onCalculate: (totalAp: number) => void;
}

interface DailyBreakdown {
  natural: number;
  dailyQuests: number;
  cafe: number;
  gem: number;
  pvp: number;
  weekly: number;
  attendance: number;
  spendHard: number;
  spendExchange: number;
  spendMisc: number;
  total: number;
  apPackage: number;
}

const toLocalISOString = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateTimeForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const AP_PER_MINUTE = 1 / 6;

export const ApCalculator = ({ eventId, startTime, endTime, iconData, onCalculate }: ApCalculatorProps) => {
  // const [isCollapsed, setIsCollapsed] = useState(false);
  const [showDetails, setShowDetails] = useState(false); // Details display state

  const { setApConfig: setConfig, apConfig: config } = usePlanForEvent(eventId);
  if (config) {
    if (!config.startDate) config.startDate = startTime.slice(0, 16);
    if (!config.endDate) config.endDate = endTime.slice(0, 16);
  }

  const [result, setResult] = useState<{
    daily: Record<string, DailyBreakdown>;
    total: number;
  } | null>(null);

  const { t } = useTranslation('planner');

  if (!config) return null;

  const handleCalculate = useCallback(() => {
    const dailyBreakdown: Record<string, DailyBreakdown> = {};
    let totalAp = 0;
    if (!config) return;

    const start = new Date(config.startDate);
    const end = new Date(config.endDate);
    const attendanceBaseDate = new Date(config.attendanceStartDate);

    const apPackageEffectiveDays = new Set<string>();
    const sortedPackageDates = [...config.apPackageDates].sort();
    let lastPackageEndDate: Date | null = null;

    sortedPackageDates.forEach((startDateStr) => {
      const packageStartDate = new Date(startDateStr);
      // Adjust start date because a new package cannot be started before the previous package ends
      if (lastPackageEndDate && packageStartDate <= lastPackageEndDate) {
        packageStartDate.setTime(lastPackageEndDate.getTime() + 24 * 60 * 60 * 1000); // Start from the next day
      }

      for (let i = 0; i < 14; i++) {
        const effectiveDate = new Date(packageStartDate);
        effectiveDate.setDate(effectiveDate.getDate() + i);
        apPackageEffectiveDays.add(toLocalISOString(effectiveDate));
      }
      // Record the end date (14 days later) of the current package
      lastPackageEndDate = new Date(packageStartDate);
      lastPackageEndDate.setDate(lastPackageEndDate.getDate() + 13);
    });

    // const totalDurationMinutes = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60));
    // totalAp += totalDurationMinutes * AP_PER_MINUTE;

    totalAp = Object.values(dailyBreakdown).reduce((sum, daily) => sum + daily.total, 0);
    totalAp += config.bonusAp;

    const loopStartDate = new Date(start);
    loopStartDate.setHours(0, 0, 0, 0);

    for (let d = new Date(loopStartDate); d <= end; d.setDate(d.getDate() + 1)) {
      // const dateString = d.toISOString().slice(0, 10);
      const dateString = toLocalISOString(d);
      const isFirstDay = dateString === toLocalISOString(start);
      const isLastDay = dateString === toLocalISOString(end);

      const daily: DailyBreakdown = {
        natural: 0,
        dailyQuests: 170,
        cafe: 0,
        gem: config.gemRefills * 120,
        pvp: config.pvpRefills * 90,
        weekly: 0,
        attendance: 0,
        spendHard: config.hardStages * 20,
        spendExchange: config.exchangeRuns * config.exchangeCost,
        spendMisc: config.miscDailySpend,
        total: 0,
        apPackage: apPackageEffectiveDays.has(dateString) ? 150 : 0,
      };

      if (isFirstDay && isLastDay) {
        // If the event ends within a day
        const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
        daily.natural = durationMinutes * AP_PER_MINUTE;
        const startHour = start.getHours();
        const endHour = end.getHours();
        daily.cafe = Math.max(0, endHour - (startHour + 1) + 1) * CAFE_AP_PER_HOUR[config.cafeRank];
        daily.spendHard = 0;
        daily.spendExchange = 0;
        daily.spendMisc = 0;
      } else if (isFirstDay) {
        // First day
        const minutesInDay = 24 * 60 - (start.getHours() * 60 + start.getMinutes());
        daily.natural = minutesInDay * AP_PER_MINUTE;
        daily.cafe = (24 - (start.getHours() + 1)) * CAFE_AP_PER_HOUR[config.cafeRank];
        daily.spendHard = 0;
        daily.spendExchange = 0;
        daily.spendMisc = 0;
      } else if (isLastDay) {
        // Last day
        const minutesInDay = end.getHours() * 60 + end.getMinutes();
        daily.natural = minutesInDay * AP_PER_MINUTE;
        daily.cafe = end.getHours() * CAFE_AP_PER_HOUR[config.cafeRank];
        daily.spendHard = 0;
        daily.spendExchange = 0;
        daily.spendMisc = 0;
      } else {
        // Middle day
        daily.natural = 24 * 60 * AP_PER_MINUTE;
        daily.cafe = 24 * CAFE_AP_PER_HOUR[config.cafeRank];
      }

      const dayOfWeek = d.getDay();
      if (dayOfWeek === 2) daily.weekly = 150;
      else if (dayOfWeek === 5) daily.weekly = 200;

      const diffTime = d.getTime() - attendanceBaseDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const currentAttendanceDay = config.attendanceStartDay + diffDays;

      if (currentAttendanceDay > 0) {
        const cycleDay = (currentAttendanceDay - 1) % 10;
        if (cycleDay === 3) daily.attendance = 50;
        else if (cycleDay === 8) daily.attendance = 100;
      }

      const gains = daily.natural + daily.dailyQuests + daily.cafe + daily.gem + daily.pvp + daily.weekly + daily.attendance + daily.apPackage;
      const spends = daily.spendHard + daily.spendExchange + daily.spendMisc;
      daily.total = Math.round(gains - spends);

      dailyBreakdown[dateString] = daily;
      totalAp += daily.total;
    }

    const finalTotal = Math.round(totalAp);
    setResult({ daily: dailyBreakdown, total: finalTotal });

    onCalculate(finalTotal);
  }, [config, onCalculate]);

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

  return (
    <>
      <div className="flex justify-between items-center group" /*onClick={() => setIsCollapsed(!isCollapsed)}*/>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {/* ⚡ */}
          <img src={`data:image/webp;base64,${iconData.Currency?.['5']}`} className="inline w-8 h-8 ml-0.5 object-cover rounded-full" />
          {t('page.apCalculator')}
        </h2>
        <span className="text-2xl transition-transform duration-300 group-hover:scale-110">{/* <ChevronIcon className={isCollapsed ? 'rotate-180' : ''} /> */}</span>
      </div>

      {/* {!isCollapsed && ( */}
      <div data-component-name="ApCalculator" className="mt-4 space-y-4">
        <h3 className="font-bold text-center text-lg dark:text-gray-200">
          {t('ui.calculationResult')} {t('ui.total')} <span className="text-blue-600 dark:text-blue-400">{result ? result.total.toLocaleString() : '?'}</span> AP
        </h3>

        <div className="p-3 bg-gray-50 dark:bg-neutral-800/50 rounded-lg space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold dark:text-gray-300">{t('placeholder.startTime')}</label>
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <button
                  onClick={() =>
                    setConfig({
                      ...config,
                      startDate: formatDateTimeForInput(new Date()),
                    })
                  }
                  className="bg-gray-200 hover:bg-gray-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-gray-300 px-2 py-1 rounded-md"
                >
                  {t('placeholder.currentTime')}
                </button>
                <button
                  onClick={() =>
                    setConfig({
                      ...config,
                      startDate: startTime.slice(0, 16),
                    })
                  }
                  className="bg-gray-200 hover:bg-gray-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-gray-300 px-2 py-1 rounded-md"
                >
                  {t('placeholder.eventStart')}
                </button>
                {globalDates && (
                  <button
                    onClick={() => globalDates && setConfig({ ...config, startDate: globalDates.start })}
                    className="bg-gray-200 hover:bg-gray-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-gray-300 px-2 py-1 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('placeholder.globalStart')}
                  </button>
                )}
              </div>
              <input
                type="datetime-local"
                value={config.startDate}
                onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                className="w-full p-2 text-sm rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold dark:text-gray-300"> {t('placeholder.endTime')}</label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setConfig({ ...config, endDate: endTime.slice(0, 16) })}
                  className="bg-gray-200 hover:bg-gray-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-gray-300 px-2 py-1 rounded-md"
                >
                  {t('placeholder.eventEnd')}
                </button>

                {globalDates && (
                  <button
                    onClick={() => globalDates && setConfig({ ...config, endDate: globalDates.end })}
                    className="bg-gray-200 hover:bg-gray-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-gray-300 px-2 py-1 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('placeholder.globalEnd')}
                  </button>
                )}
              </div>
              <input
                type="datetime-local"
                value={config.endDate}
                onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                className="w-full p-2 text-sm rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold dark:text-gray-300">
                {t('ui.cafeRank')} (Lv.{config.cafeRank})
              </label>
              <input type="range" min="6" max="10" value={config.cafeRank} onChange={(e) => setNumericConfig('cafeRank', e.target.value)} className="w-full" />
            </div>
            <div>
              <label className="text-sm font-bold dark:text-gray-300">{t('label.dailyPyroRefills')}</label>
              <CustomNumberInput
                min={0}
                max={20}
                value={config.gemRefills}
                onChange={(e) => setNumericConfig('gemRefills', String(e || 0), 20)}
                className="w-full p-2 text-base scale-[0.875] rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
              />
            </div>
          </div>

          {/* Detailed settings */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: t('gameTerm.tacticalChallenge') + ' (x90 AP)',
                type: 'select',
                value: config.pvpRefills,
                onChange: (e: any) => setNumericConfig('pvpRefills', e.target.value, 4),
                options: [0, 1, 2, 3, 4],
              },
              {
                label: t('ui.hardFarming') + ' (x-20 AP)',
                type: 'number',
                value: config.hardStages,
                onChange: (e: any /*number | null */) => setNumericConfig('hardStages', String(e || 0)),
              },
              {
                label: t('ui.scrimmageCount'),
                type: 'number',
                value: config.exchangeRuns,
                onChange: (e: any /*number | null */) => setNumericConfig('exchangeRuns', String(e || 0)),
              },
              {
                label: t('ui.scrimmageCost'),
                type: 'select',
                value: config.exchangeCost,
                onChange: (e: any) => setNumericConfig('exchangeCost', e.target.value),
                options: [0, 5, 10, 15],
              },
            ].map((item, index) => (
              <div key={index}>
                <label className="text-xs font-semibold dark:text-gray-300">{item.label}</label>
                {item.type === 'select' ? (
                  <select value={item.value} onChange={item.onChange} className="w-full p-1 text-sm mt-1 rounded border bg-white dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200">
                    {item.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <CustomNumberInput
                    value={item.value}
                    onChange={item.onChange}
                    className="w-full p-1 text-base scale-[0.875] mt-1 rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold dark:text-gray-300">{t('ui.otherDailyApConsumption')}</label>
              <CustomNumberInput
                value={config.miscDailySpend}
                onChange={(e) => setNumericConfig('miscDailySpend', String(e || 0))}
                className="w-full p-1 text-base scale-[0.875] mt-1 rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs font-semibold dark:text-gray-300">{t('ui.prefarmedAp')}</label>
              <CustomNumberInput
                value={config.bonusAp}
                onChange={(e) => setNumericConfig('bonusAp', String(e || 0))}
                className="w-full p-1 text-base scale-[0.875] mt-1 rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs font-semibold dark:text-gray-300">{t('ui.aronaAttendanceStartDate')}</label>
              <input
                type="date"
                value={config.attendanceStartDate}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    attendanceStartDate: e.target.value,
                  })
                }
                className="w-full p-1 text-sm mt-1 rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs font-semibold dark:text-gray-300">{t('ui.aronaAttendanceDay')}</label>
              <select
                value={config.attendanceStartDay}
                onChange={(e) => setNumericConfig('attendanceStartDay', e.target.value)}
                className="w-full p-1 text-sm mt-1 rounded border bg-white dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
              >
                <option value={1}>
                  1{t('common.day')} (20k {t('common.credits')})
                </option>
                <option value={2}>
                  2{t('common.day')} (3 {t('common.normalReport')})
                </option>
                <option value={3}>3{t('common.day')} (50 AP)</option>
                <option value={4}>
                  4{t('common.day')} (20k {t('common.credits')})
                </option>
                <option value={5}>
                  5{t('common.day')} (50 {t('common.pyroxene')})
                </option>
                <option value={6}>
                  6{t('common.day')} (40k {t('common.credits')})
                </option>
                <option value={7}>
                  7{t('common.day')} (1 {t('common.advancedReport')})
                </option>
                <option value={8}>8{t('common.day')} (100 AP)</option>
                <option value={9}>
                  9{t('common.day')} (40k {t('common.credits')})
                </option>
                <option value={10}>
                  10{t('common.day')} (100 {t('common.pyroxene')})
                </option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-bold dark:text-gray-300">{t('label.twoWeekApPackage')} (x150 AP)</label>
          <div className="space-y-2 mt-1">
            {config.apPackageDates.map((date, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => handlePackageDateChange(index, e.target.value)}
                  className="w-full p-1 text-sm rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
                />
                <button onClick={() => handleRemovePackageDate(index)} className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white font-bold px-2 py-1 rounded-md text-xs">
                  Del
                </button>
              </div>
            ))}
            <button onClick={handleAddPackageDate} className="w-full bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white font-semibold py-1 rounded-md text-sm">
              + {t('button.addPackageStartDate')}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('ui.packageSubscriptionNotice')}</p>
        </div>
        <button onClick={handleCalculate} className="w-full bg-blue-500 text-white font-bold py-2 rounded-lg">
          {t('button.runCalculation')}
        </button>

        {result && (
          <div className="mt-4">
            <h3 className="font-bold text-center text-lg dark:text-gray-200">
              {t('ui.calculationResult')} {t('ui.total')} <span className="text-blue-600 dark:text-blue-400">{result.total.toLocaleString()}</span> AP
            </h3>
            <div className="mt-2 bg-gray-100 dark:bg-neutral-900/50 rounded-lg max-h-60 overflow-y-auto space-y-2 text-sm">
              {Object.entries(result.daily).map(([date, daily]) => {
                const d = new Date(date);
                const dayOfWeek = t(('common.' + DAYS[d.getUTCDay()]) as any);

                return (
                  <div key={date} className="bg-white dark:bg-neutral-800/70 p-2 rounded">
                    <div className="flex justify-between items-center">
                      <span className="font-bold dark:text-gray-200">
                        {date} ({dayOfWeek})
                      </span>
                      <span className="font-bold text-blue-700 dark:text-blue-400">
                        {t('ui.total')} {Math.round(daily.total).toLocaleString()} AP
                      </span>
                    </div>
                    {/* Detailed breakdown */}
                    {showDetails && (
                      <div className="mt-2 pt-2 border-t dark:border-neutral-700 text-xs">
                        <div className="grid grid-cols-2 gap-x-2">
                          <span className="text-green-600 dark:text-green-400">
                            {t('apBreakdown.naturalRegen')} +{Math.round(daily.natural)}
                          </span>
                          {daily.spendHard ? (
                            <span className="text-red-600 dark:text-red-400">
                              {t('apBreakdown.hardMode')} -{daily.spendHard}
                            </span>
                          ) : (
                            ''
                          )}
                          <span className="text-green-600 dark:text-green-400">
                            {t('apBreakdown.dailyQuests')}: +{daily.dailyQuests}
                          </span>
                          {daily.spendExchange ? (
                            <span className="text-red-600 dark:text-red-400">
                              {t('apBreakdown.scrimmage')} -{daily.spendExchange}
                            </span>
                          ) : (
                            ''
                          )}
                          <span className="text-green-600 dark:text-green-400">
                            {t('apBreakdown.cafe')} +{Math.round(daily.cafe)}
                          </span>
                          {daily.spendMisc ? (
                            <span className="text-red-600 dark:text-red-400">
                              {t('apBreakdown.otherConsumption')} -{daily.spendMisc}
                            </span>
                          ) : (
                            ''
                          )}
                          <span className="text-green-600 dark:text-green-400">
                            {t('apSource.pyroxene')} +{daily.gem}
                          </span>
                          <span className="text-green-600 dark:text-green-400">
                            {t('gameTerm.tacticalChallenge')}: +{daily.pvp}
                          </span>
                          {daily.apPackage > 0 && (
                            <span className="text-green-600 dark:text-green-400 font-semibold">
                              {t('apSource.apPackage')} +{daily.apPackage}
                            </span>
                          )}
                          {daily.weekly > 0 && (
                            <span className="text-green-600 dark:text-green-400 font-semibold">
                              {t('apSource.weeklyQuests')} +{daily.weekly}
                            </span>
                          )}
                          {daily.attendance > 0 && (
                            <span className="text-green-600 dark:text-green-400 font-semibold">
                              {t('apSource.attendance')} +{daily.attendance}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-center mt-2">
              <button onClick={() => setShowDetails(!showDetails)} className="text-sm text-blue-500 hover:underline dark:text-blue-400">
                {showDetails ? t('button.hideDetails') : t('button.viewDailyDetails')}
              </button>
            </div>
          </div>
        )}
      </div>
      {/* )} */}
    </>
  );
};
