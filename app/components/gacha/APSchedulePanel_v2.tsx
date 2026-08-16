// app/components/gacha/APSchedulePanel_v2.tsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import type { PlannerSchedule } from '~/utils/pyroxeneCalc';

const AP_OPTIONS = [0, 3, 6, 9, 12];
const monoStyle = { fontFamily: 'inherit' };

interface Props {
  schedules: PlannerSchedule[];
  apOverrides: Record<string, number>;
  onApChange: (id: string, val: string) => void;
  apRefreshes_event: number;
  apRefreshes_normal: number;
  apRefreshes_campaigns?: Record<string, number>;
  onCampaignBulkChange: (key: string, val: number) => void;
  onApRefreshChange: (key: 'apRefreshes_event' | 'apRefreshes_normal', val: number) => void;
  apIcon?: string | null;
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center text-sm text-neutral-600 dark:text-neutral-300 whitespace-nowrap">{children}</span>;
}

function ApSelect({ value, onChange, placeholder }: { value: number | undefined; onChange: (v: number) => void; placeholder?: string }) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.income.timeline' });
  return (
    <select
      className="text-xs border border-neutral-200 dark:border-neutral-700 rounded-md py-1 px-2 bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-ba-btn-blue cursor-pointer"
      style={monoStyle}
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {AP_OPTIONS.map((v) => (
        <option key={v} value={v}>
          {v}
          {t('unit_times')}
        </option>
      ))}
    </select>
  );
}

function normalizeCampaignStorageKey(value: string | undefined): 'Normal' | 'Hard' | 'Commission' | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === 'normal') return 'Normal';
  if (normalized === 'hard') return 'Hard';
  if (normalized === 'commission') return 'Commission';
  return null;
}

function getLocalizedCampaignLabel(value: string, t: (key: string) => string): string {
  return t(`campaign.${value.toLowerCase()}`);
}

const typeStyle = (type: string, t: (k: string) => string) => {
  switch (type) {
    case 'Event':
      return { label: t('types.evt'), cls: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' };
    case 'Raid':
      return { label: t('types.raid'), cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' };
    case 'Elimination':
      return { label: t('types.elim'), cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700' };
    case 'Multifloor':
      return { label: t('types.towr'), cls: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' };
    case 'Campaign':
      return { label: t('types.camp'), cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 border-blue-100 dark:border-blue-900' };
    case 'JointFiringDrill':
      return { label: t('types.jfd') || 'JFD', cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300 border-amber-100 dark:border-amber-900' };
    default:
      return { label: t('types.etc'), cls: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700' };
  }
};

export default function APSchedulePanel_v2({
  schedules,
  apOverrides,
  onApChange,
  apRefreshes_event,
  apRefreshes_normal,
  apRefreshes_campaigns = {},
  onCampaignBulkChange,
  onApRefreshChange,
  apIcon: _apIcon,
}: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.income.timeline' });
  const { t: tCal } = useTranslation('calendar');
  const [showCampaignBulk, setShowCampaignBulk] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const CAMPAIGN_TYPES = ['Normal', 'Hard', 'Commission'];

  const sorted = useMemo(() => schedules.filter((s) => new Date(s.end) >= today).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()), [schedules]);

  const effectiveAp = (item: PlannerSchedule): number => {
    if (item.type === 'Event') return item.isApEvent ? apRefreshes_event : apRefreshes_normal;
    if (item.type === 'Campaign') {
      const campaignType = normalizeCampaignStorageKey(item.campaignType);
      const key = campaignType && item.multiplier ? `${campaignType}_${item.multiplier}` : null;
      return key ? (apRefreshes_campaigns[key] ?? apRefreshes_normal) : apRefreshes_normal;
    }
    return apRefreshes_normal;
  };

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {/* Event period */}
        <div className="flex items-center justify-between py-2.5">
          <RowLabel>{t('eventPeriod')}</RowLabel>
          <ApSelect value={apRefreshes_event} onChange={(v) => onApRefreshChange('apRefreshes_event', v)} />
        </div>

        {/* Normal period */}
        <div className="flex items-center justify-between py-2.5">
          <RowLabel>{t('normalPeriod')}</RowLabel>
          <ApSelect value={apRefreshes_normal} onChange={(v) => onApRefreshChange('apRefreshes_normal', v)} />
        </div>

        {/* Campaign bulk settings */}
        <div className="py-2.5">
          <button type="button" className="w-full flex items-center justify-between" onClick={() => setShowCampaignBulk((v) => !v)}>
            <RowLabel>{t('campaignBulkLabel')}</RowLabel>
            <span className="text-neutral-400 dark:text-neutral-500 text-xs">{showCampaignBulk ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}</span>
          </button>

          {showCampaignBulk && (
            <div className="mt-3 space-y-2">
              {/* ×2 / ×3 header */}
              <div className="grid grid-cols-[3rem_1fr_1fr] gap-2 text-[10px] text-neutral-400 dark:text-neutral-500 text-center" style={monoStyle}>
                <div />
                <div>×2</div>
                <div>×3</div>
              </div>
              {CAMPAIGN_TYPES.map((key) => (
                <div key={key} className="grid grid-cols-[3rem_1fr_1fr] gap-2 items-center">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap" style={monoStyle}>
                    {getLocalizedCampaignLabel(key, tCal as (key: string) => string)}
                  </span>
                  {[2, 3].map((mult) => {
                    const dKey = `${key}_${mult}`;
                    const val = apRefreshes_campaigns[dKey];
                    return (
                      <select
                        key={mult}
                        className="w-full text-xs border border-neutral-200 dark:border-neutral-700 rounded-md py-1 px-1.5 bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-ba-btn-blue cursor-pointer"
                        style={monoStyle}
                        value={val ?? ''}
                        onChange={(e) => {
                          if (e.target.value === '') onCampaignBulkChange(dKey, -1);
                          else onCampaignBulkChange(dKey, Number(e.target.value));
                        }}
                      >
                        <option value="">
                          {apRefreshes_normal}
                          {t('unit_times')}
                        </option>
                        {AP_OPTIONS.map((v) => (
                          <option key={v} value={v}>
                            {v}
                            {t('unit_times')}
                          </option>
                        ))}
                      </select>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Schedule list */}
        <div className="py-2.5">
          <button type="button" className="w-full flex items-center justify-between" onClick={() => setShowSchedule((v) => !v)}>
            <RowLabel>
              {t('scheduleLabel')}
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500 ml-1" style={monoStyle}>
                {t('scheduleCount', { count: sorted.length })}
              </span>
            </RowLabel>
            <span className="text-neutral-400 dark:text-neutral-500 text-xs">{showSchedule ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}</span>
          </button>

          {showSchedule && (
            <div className="mt-2 -mx-4 border-t border-neutral-100 dark:border-neutral-800">
              {/* Column headers */}
              <div
                className="flex items-center px-4 py-1.5 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-100 dark:border-neutral-800 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider"
                style={monoStyle}
              >
                <div className="w-14">{t('headers.start')}</div>
                <div className="w-14 text-center">{t('headers.type')}</div>
                <div className="flex-1 px-2">{t('headers.name')}</div>
                <div className="w-24 text-right">{t('headers.ap')}</div>
              </div>

              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 max-h-72 overflow-y-auto custom-scrollbar">
                {sorted.length === 0 ? (
                  <div className="p-5 text-center text-xs text-neutral-400 dark:text-neutral-500">{t('empty')}</div>
                ) : (
                  sorted.map((item) => {
                    const { label, cls } = typeStyle(item.type, t as (k: string) => string);
                    const isConfigurable = item.type === 'Event' || item.type === 'Campaign';
                    const customOverride = apOverrides[item.id] ?? -1;
                    const hasOverride = customOverride !== -1;
                    const autoAp = effectiveAp(item);
                    const itemName = item.type === 'Campaign' && item.campaignType ? getLocalizedCampaignLabel(item.campaignType, tCal as (key: string) => string) : item.name;

                    return (
                      <div key={item.id} className="flex items-center px-4 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
                        <div className="w-14 text-xs text-neutral-400 dark:text-neutral-500 shrink-0" style={monoStyle}>
                          {item.start.slice(5).replace('-', '/')}
                        </div>
                        <div className="w-14 shrink-0 flex justify-center">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>
                        </div>
                        <div className="flex-1 px-2 min-w-0">
                          <div className="text-xs text-neutral-700 dark:text-neutral-300 truncate" title={itemName}>
                            {itemName}
                          </div>
                        </div>
                        <div className="w-24 shrink-0 flex items-center justify-end gap-1.5">
                          {isConfigurable && (
                            <>
                              <select
                                className={`text-[10px] border rounded py-0.5 px-1 outline-none cursor-pointer transition-colors ${
                                  hasOverride
                                    ? 'bg-blue-600 dark:bg-blue-500 text-white border-blue-600'
                                    : 'bg-white dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 border-neutral-200 dark:border-neutral-700'
                                }`}
                                value={customOverride}
                                onChange={(e) => onApChange(item.id, e.target.value)}
                              >
                                <option value={-1}>{autoAp > 0 ? t('auto_ap_format', { count: autoAp }) : '-'}</option>
                                {AP_OPTIONS.map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
