// app/components/gacha/PyroTimelineChartV3.tsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TimelineRangeV3 from './TimelineRangeV3';
import type { LogEntry, ProbTimelinePoint, CustomLineConfig, BannerStudentMarker } from './timelineTypes';
import { FaChevronDown, FaTimes } from 'react-icons/fa';

interface Props {
  probTimeline: ProbTimelinePoint[];
  customLines?: CustomLineConfig[];
  customPercentiles?: number[];
  onAddCustomLine?: (val: number) => void;
  onRemoveCustomLine?: (val: number) => void;
  bannerMarkers?: BannerStudentMarker[];
  hasResults: boolean;
}

// ---------------------------------------------------------------------------
// Main chart component
// ---------------------------------------------------------------------------
export default function PyroTimelineChartV3({ probTimeline, customLines = [], customPercentiles = [], onAddCustomLine, onRemoveCustomLine, bannerMarkers = [], hasResults }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.income' });
  const { t: t_ui } = useTranslation('ui');
  const { t: t_game } = useTranslation('game');
  const { t: tp } = useTranslation('planner');

  const [showDetails, setShowDetails] = useState(false);
  const [showPercentileForm, setShowPercentileForm] = useState(false);
  const [newPercentileInput, setNewPercentileInput] = useState('');
  // This stores excluded groups. Fixed daily income is hidden by default.
  const [excludedLogFilters, setExcludedLogFilters] = useState<Set<string>>(() => new Set(['log.fixed_daily']));

  const logDescription = (log: LogEntry) => {
    if (log.i18nKey === 'log.multifloor' && log.params?.name != null) return String(log.params.name);
    if (!log.i18nKey) return log.title ?? '';
    if (!log.params) return t(log.i18nKey);
    return t(log.i18nKey, log.params);
  };
  const logGroup = (log: LogEntry) => {
    if (log.i18nKey === 'log.multifloor') return 'game:multifloor';
    if (log.i18nKey === 'log.raid' || log.i18nKey === 'log.elimination') return 'game:raidAndEraid';
    if (log.i18nKey === 'log.jfd') return 'game:jfd';
    if (log.i18nKey === 'log.event') return 'game:event';
    if (log.i18nKey === 'log.fixed_daily' || log.i18nKey === 'log.fixed_daily_sunday') return 'log.fixed_daily';
    if (log.i18nKey === 'log.mainstory' || log.i18nKey === 'log.ministory') return 'game:story';
    if (log.i18nKey === 'log.term_ticket_acquired' || log.i18nKey === 'log.term_ticket_acquired_expiry' || log.i18nKey === 'log.term_ticket_expired') return 'ticket';
    return log.i18nKey ?? `custom:${log.title ?? ''}`;
  };
  const logGroupName = (log: LogEntry) => {
    if (log.i18nKey === 'log.multifloor') return t_game('multifloor');
    if (log.i18nKey === 'log.raid' || log.i18nKey === 'log.elimination') return t_game('raidAndEraid');
    if (log.i18nKey === 'log.jfd') return t_game('jfd');
    if (log.i18nKey === 'log.event') return t_game('event');
    if (log.i18nKey === 'log.fixed_daily' || log.i18nKey === 'log.fixed_daily_sunday') return t('log.fixed_daily');
    if (log.i18nKey === 'log.mainstory' || log.i18nKey === 'log.ministory') return t_game('story');
    if (log.i18nKey === 'log.monthly_extra') return t('stats.items.monthly');
    if (log.i18nKey === 'log.ap_refresh') return t('stats.items.ap_refresh');
    if (log.i18nKey === 'log.term_ticket_acquired' || log.i18nKey === 'log.term_ticket_acquired_expiry' || log.i18nKey === 'log.term_ticket_expired') return t('settings.ticket_batches_title');
    return logDescription(log);
  };

  const logFilters = useMemo(() => {
    const totals = new Map<string, number>();
    probTimeline.forEach((point) => {
      point.logs.forEach((log) => {
        const group = logGroup(log);
        totals.set(group, (totals.get(group) ?? 0) + log.amount);
      });
    });
    return Array.from(totals, ([id, total]) => {
      const log = probTimeline.flatMap((point) => point.logs).find((entry) => logGroup(entry) === id);
      return { id, name: log ? logGroupName(log) : id, total };
    });
  }, [probTimeline, t]);

  const handleAddPercentile = () => {
    const val = Number(newPercentileInput);
    if (newPercentileInput !== '' && Number.isFinite(val) && val > 0 && val < 100 && !customPercentiles.includes(val)) {
      onAddCustomLine?.(val);
      setNewPercentileInput('');
    }
  };
  const percentileValue = Number(newPercentileInput);
  const canAddPercentile = newPercentileInput !== '' && Number.isFinite(percentileValue) && percentileValue > 0 && percentileValue < 100 && !customPercentiles.includes(percentileValue);

  if (!probTimeline.length) return null;

  return (
    <div className="space-y-0">
      <div className="overflow-hidden transition-colors relative">
        <div className="v3-timeline-heading">
          <h2 className="v3-section-title">{tp('gacha.v3.timeline.title')}</h2>
          <button type="button" className="v3-percentile-toggle" aria-expanded={showPercentileForm} aria-controls="v3-percentile-panel" onClick={() => setShowPercentileForm((visible) => !visible)}>
            {customPercentiles.length > 0 ? tp('gacha.v3.chart.add_percentile_count', { count: customPercentiles.length }) : tp('gacha.v3.chart.add_percentile')}
            <FaChevronDown className={`v3-disclosure-chevron ${showPercentileForm ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>
        <div id="v3-percentile-panel" className="v3-percentile-panel" hidden={!showPercentileForm}>
          <form
            className="v3-percentile-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleAddPercentile();
            }}
          >
            <label htmlFor="v3-percentile-input">{tp('gacha.v3.chart.percentile')}</label>
            <span className="v3-percent-field">
              <input
                id="v3-percentile-input"
                type="text"
                inputMode="decimal"
                value={newPercentileInput}
                onChange={(event) => {
                  const next = event.target.value.replace(',', '.');
                  if (/^\d*(?:\.\d?)?$/.test(next)) setNewPercentileInput(next);
                }}
                placeholder="25"
                aria-label={tp('gacha.v3.chart.custom_percentile_aria')}
              />
              <span className="v3-percent-suffix" aria-hidden="true">
                %
              </span>
            </span>
            <button type="submit" className="v3-aux-button" disabled={!canAddPercentile} title={t('chart.add_btn_title')}>
              {t_ui('add')}
            </button>
          </form>
          {customPercentiles.length > 0 && (
            <div className="v3-percentile-list" aria-label={tp('gacha.v3.chart.added_percentiles')}>
              {customPercentiles.map((percentile) => (
                <button
                  key={percentile}
                  type="button"
                  onClick={() => onRemoveCustomLine?.(percentile)}
                  aria-label={`${t('chart.upper_x', { x: percentile })} ${t_ui('delete')}`}
                  className="inline-flex items-center gap-1.5 text-xs text-neutral-600 underline underline-offset-2 dark:text-neutral-300"
                >
                  {t('chart.upper_x', { x: percentile })}
                  <FaTimes size={9} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
        <TimelineRangeV3 points={probTimeline} customLines={customLines} markers={bannerMarkers} hasResults={hasResults} />

        <div className="border-t border-neutral-100 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            aria-expanded={showDetails}
            className="flex min-h-11 w-full items-center justify-between gap-2 py-3 text-xs font-semibold text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            {showDetails ? t('chart.hide_details') : t('chart.show_details')}
            <FaChevronDown className={`v3-disclosure-chevron ${showDetails ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {showDetails && (
            <div className="border-t border-neutral-100 dark:border-neutral-800">
              {logFilters.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => setExcludedLogFilters(new Set())}
                    className="shrink-0 rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                  >
                    {t_ui('all')}
                  </button>
                  {logFilters.map(({ id, name, total }) => (
                    <button
                      type="button"
                      key={name}
                      onClick={() =>
                        setExcludedLogFilters((current) => {
                          const next = new Set(current);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                      title={name}
                      className={`inline-flex max-w-full items-center gap-1 rounded border px-2 py-1 text-xs font-semibold transition-colors ${
                        !excludedLogFilters.has(id)
                          ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}
                    >
                      <span title={name} className="truncate">
                        {name}
                      </span>
                      <span
                        className={`hidden tabular-nums whitespace-nowrap md:inline ${total > 0 ? 'text-green-600 dark:text-green-400' : total < 0 ? 'text-red-500 dark:text-red-400' : 'text-neutral-400'}`}
                      >
                        {total > 0 ? '+' : ''}
                        {total.toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="max-h-80 overflow-y-auto custom-scrollbar">
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {probTimeline.map((pt, i, arr) => {
                    const prevAvg = i > 0 ? arr[i - 1].pyroxeneAvg : pt.pyroxeneAvg;
                    const netDelta = Math.round(pt.pyroxeneAvg - prevAvg);
                    const logs = pt.logs || [];
                    const filteredLogs = logs.filter((log) => !excludedLogFilters.has(logGroup(log)));
                    const hasLogs = filteredLogs.length > 0;
                    if (excludedLogFilters.size > 0 && !hasLogs) return null;
                    if (!hasLogs && Math.abs(netDelta) < 1 && i !== 0) return null;

                    const balance = Math.round(pt.pyroxeneAvg);
                    const dateLabel = pt.date.slice(5).replace('-', '/');

                    if (hasLogs) {
                      return (
                        <div key={pt.date} className="px-4 py-3 space-y-2">
                          {/* Date header row */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400 tracking-wide">{dateLabel}</span>
                            {netDelta !== 0 && (
                              <span
                                className={`text-xs font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                                  netDelta > 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                }`}
                              >
                                {netDelta > 0 ? '+' : ''}
                                {netDelta.toLocaleString()}
                              </span>
                            )}
                          </div>

                          {/* Log items */}
                          <div className="space-y-1 pl-1">
                            {filteredLogs.map((log, li) => {
                              const desc = logDescription(log);
                              const amtColor = log.amount > 0 ? 'text-green-600 dark:text-green-400' : log.amount < 0 ? 'text-red-500 dark:text-red-400' : 'text-neutral-400';
                              return (
                                <div key={li} className="flex items-baseline justify-between gap-3">
                                  <span title={desc} className="text-xs text-neutral-600 dark:text-neutral-400 leading-snug flex-1 min-w-0 truncate">
                                    {desc}
                                  </span>
                                  <span className={`text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 ${amtColor}`}>
                                    {log.amount > 0 ? '+' : ''}
                                    {log.amount.toLocaleString()}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Balance footer */}
                          <div className="flex items-center justify-between pt-1.5 border-t border-neutral-100 dark:border-neutral-800">
                            <span className="text-xs text-neutral-400 dark:text-neutral-600 uppercase tracking-wider">{t('chart.table_balance')}</span>
                            <span className="text-xs font-bold tabular-nums text-neutral-800 dark:text-neutral-100">{balance.toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    }

                    /* No-log row: daily accumulation or start */
                    const isStart = i === 0;
                    return (
                      <div key={pt.date} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xs font-bold text-neutral-400 dark:text-neutral-600 shrink-0">{dateLabel}</span>
                          <span title={isStart ? t('chart.start_balance') : t('chart.daily_calc')} className="text-xs text-neutral-400 dark:text-neutral-500 italic truncate">
                            {isStart ? t('chart.start_balance') : t('chart.daily_calc')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {!isStart && netDelta !== 0 && (
                            <span className={`text-xs font-semibold tabular-nums ${netDelta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                              {netDelta > 0 ? '+' : ''}
                              {netDelta.toLocaleString()}
                            </span>
                          )}
                          <span className="text-xs font-bold tabular-nums text-neutral-700 dark:text-neutral-300">{balance.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
