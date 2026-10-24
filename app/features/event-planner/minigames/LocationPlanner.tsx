import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomNumberInput } from '~/components/common/CustomInput';
import { ItemIcon } from '~/components/item/Icon';
import { getItemName, getLocalizeEtcName } from '~/utils/locale';
import type { EventData, IconData } from '~/types/plannerData';
import type { LocationConfig } from '~/types/minigame/location';
import type { Locale } from '~/utils/i18n/config';
import { createLocationAutoConfig, getLocationMaxRuns, type LocationResult } from '~/features/event-planner/logic/locationPlanner';

type Props = {
  eventData: EventData;
  iconData: IconData;
  config: LocationConfig;
  result: LocationResult;
  availableCurrency: number;
  onChange: (config: LocationConfig) => void;
};

const formatExpected = (amount: number) => amount.toLocaleString(undefined, { maximumFractionDigits: 3 });

export function LocationPlanner({ eventData, iconData, config, result, availableCurrency, onChange }: Props) {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'minigame_location' });
  const { t: t_ui } = useTranslation('ui');
  const { t: tp } = useTranslation('planner');
  const locale = i18n.language as Locale;

  const [selectedRank, setSelectedRank] = useState(result.startRank ?? 1);
  const info = eventData.location?.info[0];
  const rank = result.ranks.find((entry) => entry.rank === selectedRank) ?? result.ranks[0];
  if (!info || !rank) return null;

  const cap = rank.requiredRuns;
  const rankMessage =
    rank.status === 'underfilled' ? t('statusUnderfilled') : rank.status === 'excess' ? t('statusExcess') : rank.status === 'blocked' && rank.plannedRuns > 0 ? t('statusBlocked') : null;

  const updateRuns = (key: string, value: number) => {
    const runs = { ...config.runs };
    const count = Math.max(0, Math.trunc(value));
    if (count === 0) delete runs[key];
    else runs[key] = count;
    onChange({ runs });
  };

  const resetRank = () => {
    const prefix = `${rank.rank}:`;
    const runs = Object.fromEntries(Object.entries(config.runs).filter(([key]) => !key.startsWith(prefix)));
    onChange({ runs });
  };

  const hasRankEntries = Object.keys(config.runs).some((key) => key.startsWith(`${rank.rank}:`));

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title', { name: getLocalizeEtcName(info.LocalizeEtc, locale) || '' })}</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onChange(createLocationAutoConfig(result, config));
                setSelectedRank(1);
              }}
              title={t('autoFillTooltip')}
              className="rounded border border-ba-btn-blue-dark bg-ba-btn-blue px-2 py-1 text-xs font-bold text-neutral-900 hover:bg-ba-btn-blue-dark"
            >
              {t('autoFillButton')}
            </button>
            <button
              type="button"
              onClick={() => onChange({ runs: {} })}
              disabled={Object.keys(config.runs).length === 0}
              className="rounded border border-neutral-300 bg-ba-btn-gray px-2 py-1 text-xs font-semibold text-neutral-900 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600"
            >
              {t_ui('resetAll')}
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {t('summaryLine', { cost: result.costPerRun.toLocaleString(), points: result.pointsPerRun.toLocaleString(), resetCount: info.LocationResetScheduleCount })}
        </p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t('calcNote')}</p>
      </div>

      <nav aria-label={t('rankNavLabel')} className="grid grid-cols-8 gap-1">
        {result.ranks.map((entry) => {
          const active = entry.rank === rank.rank;
          const warning = entry.status === 'excess' || entry.status === 'underfilled' || (entry.status === 'blocked' && entry.plannedRuns > 0);
          return (
            <button
              key={entry.rank}
              type="button"
              onClick={() => setSelectedRank(entry.rank)}
              aria-pressed={active}
              aria-label={
                warning
                  ? t('rankLabelWarning', { rank: entry.rank })
                  : entry.plannedRuns > 0
                    ? t('rankLabelPlanned', { rank: entry.rank, runs: entry.plannedRuns })
                    : t('rankLabel', { rank: entry.rank })
              }
              title={entry.plannedRuns > 0 ? t('rankTitlePlanned', { rank: entry.rank, runs: entry.plannedRuns }) : t('rankLabel', { rank: entry.rank })}
              className={`relative min-w-0 rounded border px-1 pb-3 pt-2 text-sm font-semibold ${
                active
                  ? 'border-ba-btn-blue-dark bg-ba-btn-blue text-neutral-900'
                  : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800'
              }`}
            >
              {entry.rank}
              {entry.plannedRuns > 0 && <span className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${warning ? 'bg-red-600' : 'bg-blue-600'}`} />}
            </button>
          );
        })}
      </nav>

      <section key={rank.rank} className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-neutral-900 dark:text-neutral-100">{t('rankLabel', { rank: rank.rank })}</h3>
          <button
            type="button"
            onClick={resetRank}
            disabled={!hasRankEntries}
            className="rounded border border-neutral-300 bg-ba-btn-gray px-2 py-1 text-xs font-semibold text-neutral-900 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600"
          >
            {t('resetRankButton')}
          </button>
        </div>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {result.startRank !== null && rank.rank < result.startRank
            ? t('statusNoInput')
            : cap === null
              ? t('statusTopRank', { runs: rank.plannedRuns })
              : t('statusProgress', {
                  runs: rank.plannedRuns,
                  cap,
                  points: (rank.carriedPoints + rank.plannedRuns * result.pointsPerRun).toLocaleString(),
                  target: rank.pointsToNextRank.toLocaleString(),
                })}
        </p>
        {rankMessage && (
          <p role="alert" className={`mt-2 text-xs ${rank.status === 'excess' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {rankMessage}
          </p>
        )}
        <div className="mt-3 border-t border-neutral-200 dark:border-neutral-700">
          {rank.rows.map((row) => (
            <div key={row.key} className="flex flex-col gap-2 border-b border-neutral-200 py-3 last:border-b-0 dark:border-neutral-700 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 sm:w-32 sm:shrink-0">
                <div className="font-medium text-neutral-900 dark:text-neutral-100" title={getLocalizeEtcName(row.localizeEtc, locale) || row.name}>
                  {getLocalizeEtcName(row.localizeEtc, locale) || row.name}
                </div>
                {row.runs > 0 && row.countedRuns === 0 && <div className="text-xs text-red-700 dark:text-red-400">{t('excludedFlag')}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2 pb-1">
                  {row.rewards.map((reward) => {
                    const separator = reward.key.lastIndexOf('_');
                    const type = reward.key.slice(0, separator);
                    const itemId = reward.key.slice(separator + 1);
                    return (
                      <div key={reward.key} title={t('rewardTooltipPerRun', { name: getItemName(reward.key, eventData.icons, locale), amount: formatExpected(reward.expected) })}>
                        <ItemIcon type={type} itemId={itemId} amount={reward.expected} forceDecimal decimalPlaces={4} size={10} eventData={eventData} iconData={iconData} />
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t('expectedVisitors', { count: formatExpected(row.visitors) })} · {t('expectedFavorExp', { count: formatExpected(row.favorExp) })} ·{' '}
                  {t('expectedEleph', { count: formatExpected(row.eleph) })}
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => updateRuns(row.key, 0)}
                  disabled={row.runs === 0}
                  className="inline-flex h-8 min-w-8 items-center justify-center rounded border border-neutral-300 bg-ba-btn-gray px-2 text-sm font-semibold leading-none text-neutral-900 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600"
                  aria-label={t('counterSetZero', { rank: rank.rank, name: row.name })}
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => updateRuns(row.key, row.runs - 1)}
                  disabled={row.runs === 0}
                  className="hidden h-8 min-w-8 items-center justify-center rounded border border-neutral-300 bg-ba-btn-gray px-2 text-sm font-semibold leading-none text-neutral-900 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 sm:inline-flex"
                  aria-label={t('counterDecrement', { rank: rank.rank, name: row.name })}
                >
                  −
                </button>
                <CustomNumberInput
                  min={0}
                  value={row.runs}
                  onChange={(value) => updateRuns(row.key, value ?? 0)}
                  className="h-8 w-16 rounded border border-neutral-300 bg-white px-2 text-center text-sm leading-none text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                  aria-label={t('counterLabel', { rank: rank.rank, name: row.name })}
                />
                <button
                  type="button"
                  onClick={() => updateRuns(row.key, row.runs + 1)}
                  disabled={cap !== null && row.runs >= getLocationMaxRuns(result, rank.rank, row.key, availableCurrency)}
                  className="hidden h-8 min-w-8 items-center justify-center rounded border border-neutral-300 bg-ba-btn-gray px-2 text-sm font-semibold leading-none text-neutral-900 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 sm:inline-flex"
                  aria-label={t('counterIncrement', { rank: rank.rank, name: row.name })}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => updateRuns(row.key, getLocationMaxRuns(result, rank.rank, row.key, availableCurrency))}
                  className="inline-flex h-8 items-center justify-center rounded border border-ba-btn-blue-dark bg-ba-btn-blue px-2 text-xs font-bold leading-none text-neutral-900 hover:bg-ba-btn-blue-dark"
                  aria-label={t('counterMax', { rank: rank.rank, name: row.name })}
                >
                  MAX
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <h3 className="font-bold text-neutral-900 dark:text-neutral-100">{t('summaryHeading')}</h3>
        <div className="mt-2 grid gap-1 text-sm text-neutral-700 dark:text-neutral-300 sm:grid-cols-2">
          <div>{t('summaryRuns', { runs: result.runs.toLocaleString() })}</div>
          <div className="flex items-center gap-1">
            <span>{tp('ui.consumed')}</span>
            <ItemIcon type={info.ScheduleEventPointCostParcelTypeStr} itemId={String(info.ScheduleEventPointCostParcelId)} amount={0} size={7} eventData={eventData} iconData={iconData} />
            <span>
              {(result.cost[result.costKey] || 0).toLocaleString()}
              {tp('ui.resourceEfficiencyUnit')}
            </span>
          </div>
          <div>{t('expectedVisitorsTotal', { count: formatExpected(result.visitors) })}</div>
          <div>{t('expectedFavorExp', { count: formatExpected(result.favorExp) })}</div>
          <div>{t('expectedElephTotal', { count: formatExpected(result.eleph) })}</div>
          {result.excludedRuns > 0 && <div className="text-red-700 dark:text-red-400">{t('excludedRunsLine', { count: result.excludedRuns })}</div>}
        </div>
        {Object.keys(result.rewards).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
            {Object.entries(result.rewards).map(([key, amount]) => {
              const separator = key.lastIndexOf('_');
              return (
                <div key={key} title={t('rewardTooltipTotal', { name: getItemName(key, eventData.icons, locale), amount: formatExpected(amount) })}>
                  <ItemIcon type={key.slice(0, separator)} itemId={key.slice(separator + 1)} amount={amount} forceDecimal decimalPlaces={4} size={10} eventData={eventData} iconData={iconData} />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
