// components/planner/resources/ItemIncomeSection.tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import PvpCoinSection from '~/components/planner/resources/PvpCoinSection';
import { RaidConfigFields } from './RaidConfigFields';
import { calcMultifloorWBs, MULTIFLOOR_WB_KEYS } from '~/utils/resourceEventAdapters';
import { DEFAULT_RAID_CONFIG } from '~/data/raidCoinData';
import type { RaidDetailConfig } from '~/data/raidCoinData';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import type { Locale } from '~/utils/i18n/config';
import { getItemTitle } from '~/utils/scheduleDisplay';

const INPUT_CLS =
  'px-2 py-1 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PvpProps {
  pvpAverageRank: number;
  pvpDailyDefenseWins: number;
  pvpExtraWeeklyIncome: number;
  onUpdate: (patch: Record<string, unknown>) => void;
}

interface JfdProps {
  jfdDefaultDailyCoins: number;
  jfdPerPeriodCoins: Record<string, number>;
  jfdConfigItems: ScheduleItemV2[];
  onUpdate: (patch: Record<string, unknown>) => void;
}

interface RaidProps {
  isRaid: boolean;
  raidGlobalConfig: RaidDetailConfig | null;
  eraidGlobalConfig: RaidDetailConfig | null;
  raidDetailConfigs: Record<string, RaidDetailConfig>;
  raidConfigItems: ScheduleItemV2[];
  setRaidDetailConfig: (id: string, config: RaidDetailConfig | null) => void;
  onUpdate: (patch: Record<string, unknown>) => void;
}

interface ExpertPermitProps {
  expertPermitMode: 'weekly_max' | 'daily';
  expertPermitWeeklyMax: number;
  onUpdate: (patch: Record<string, unknown>) => void;
}

interface WBProps {
  multifloorDefaultMaxFloor: number;
  multifloorMaxFloors: Record<string, number>;
  mfSchedule: ScheduleItemV2[];
  onUpdate: (patch: Record<string, unknown>) => void;
}

export interface ItemIncomeSectionProps {
  selectedItemKey: string | null;
  pvp: PvpProps;
  jfd: JfdProps;
  raid: RaidProps;
  expertPermit: ExpertPermitProps;
  wb: WBProps;
}

// ─── Sub-sections ─────────────────────────────────────────────────────────────

function JfdSection({ jfd }: { jfd: JfdProps }) {
  const { t } = useTranslation('resources');
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{t('income.defaultDailyCoins')}</label>
        <input
          type="number"
          min={40}
          max={140}
          step={5}
          value={jfd.jfdDefaultDailyCoins}
          onChange={(e) => jfd.onUpdate({ jfdDefaultDailyCoins: Math.min(140, Math.max(40, Number(e.target.value) || 80)) })}
          className={`w-24 ${INPUT_CLS}`}
        />
        <span className="text-xs text-neutral-400 dark:text-neutral-500">{t('income.coinsPerDay')}</span>
      </div>

      {jfd.jfdConfigItems.length > 0 && (
        <div className="space-y-1 border-t border-neutral-100 dark:border-neutral-800 pt-3">
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-2">{t('income.perPeriodOverride')}</p>
          {jfd.jfdConfigItems.map((item) => {
            const override = jfd.jfdPerPeriodCoins[item.id];
            return (
              <div key={item.id} className="flex items-center gap-2">
                <span className="text-xs text-neutral-600 dark:text-neutral-300 shrink-0">S{item.id.replace('jfd-', '')}</span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0">
                  {item.startTime.slice(0, 10)} – {item.endTime?.slice(0, 10) ?? item.startTime.slice(0, 10)}
                </span>
                <input
                  type="number"
                  min={40}
                  max={140}
                  step={5}
                  placeholder={String(jfd.jfdDefaultDailyCoins)}
                  value={override ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : Math.min(140, Math.max(40, Number(e.target.value)));
                    const next = { ...jfd.jfdPerPeriodCoins };
                    if (v === null) delete next[item.id];
                    else next[item.id] = v;
                    jfd.onUpdate({ jfdPerPeriodCoins: next });
                  }}
                  className={`w-20 ${INPUT_CLS}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RaidSection({ raid }: { raid: RaidProps }) {
  const { t, i18n } = useTranslation('resources');
  const { t: t_ui } = useTranslation('ui');

  const { isRaid } = raid;
  const locale = i18n.language as Locale;
  const globalConfig = isRaid ? raid.raidGlobalConfig : raid.eraidGlobalConfig;
  const globalKey = isRaid ? 'raidGlobalConfig' : 'eraidGlobalConfig';
  const typePrefix = isRaid ? 'raid-' : 'eraid-';
  const filteredItems = raid.raidConfigItems.filter((it) => it.id.startsWith(typePrefix));

  return (
    <div className="space-y-3">
      {/* Global default */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">{t('income.defaultAllPeriods')}</span>
          {globalConfig && (
            <button
              onClick={() => raid.onUpdate({ [globalKey]: null })}
              className="px-2 py-0.5 text-[11px] font-semibold rounded text-neutral-400 dark:text-neutral-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              {t_ui('delete')}
            </button>
          )}
        </div>
        <RaidConfigFields config={globalConfig ?? DEFAULT_RAID_CONFIG} isRaid={isRaid} onChange={(c) => raid.onUpdate({ [globalKey]: c })} />
      </div>

      {/* Per-period overrides */}
      {filteredItems.length > 0 && (
        <div className="space-y-2 border-t border-neutral-100 dark:border-neutral-800 pt-3">
          <p className="text-xs text-neutral-400 dark:text-neutral-500">{t('income.perPeriodOverride')}</p>
          {filteredItems.map((item) => {
            const hasOverride = !!raid.raidDetailConfigs[item.id];
            const config = raid.raidDetailConfigs[item.id];
            const title = getItemTitle(item, locale, i18n);
            return (
              <div
                key={item.id}
                className={`rounded-lg border p-3 space-y-2 ${hasOverride ? 'border-neutral-300 dark:border-neutral-600' : 'border-dashed border-neutral-200 dark:border-neutral-700'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 truncate" title={title}>
                      {title}
                    </span>
                    <span className="ml-2 text-[10px] text-neutral-400 dark:text-neutral-500">{item.startTime.slice(0, 10)}</span>
                  </div>
                  <button
                    onClick={() => raid.setRaidDetailConfig(item.id, hasOverride ? null : (globalConfig ?? DEFAULT_RAID_CONFIG))}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors shrink-0 ${
                      hasOverride
                        ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {hasOverride ? t('income.removeOverride') : t('income.override')}
                  </button>
                </div>
                {!hasOverride && !globalConfig && <p className="text-[11px] text-neutral-400 dark:text-neutral-500">{t('income.noDefaultSet')}</p>}
                {!hasOverride && globalConfig && <p className="text-[11px] text-neutral-400 dark:text-neutral-500">{t('income.usingDefaultConfig')}</p>}
                {hasOverride && config && <RaidConfigFields config={config} isRaid={isRaid} onChange={(c) => raid.setRaidDetailConfig(item.id, c)} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExpertPermitSection({ expertPermit }: { expertPermit: ExpertPermitProps }) {
  const { t } = useTranslation('resources');
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(['weekly_max', 'daily'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => expertPermit.onUpdate({ expertPermitMode: mode })}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
              expertPermit.expertPermitMode === mode
                ? 'bg-blue-600 text-white dark:bg-blue-500'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            {mode === 'weekly_max' ? t('income.weeklyMax') : t('income.dailyMode')}
          </button>
        ))}
      </div>

      {expertPermit.expertPermitMode === 'weekly_max' ? (
        <div className="flex items-center gap-3">
          <label className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{t('income.weeklyIncome')}</label>
          <input
            type="number"
            min={0}
            max={12000}
            value={expertPermit.expertPermitWeeklyMax}
            onChange={(e) =>
              expertPermit.onUpdate({
                expertPermitWeeklyMax: Math.min(12000, Math.max(0, Number(e.target.value) || 0)),
              })
            }
            className={`w-28 ${INPUT_CLS}`}
          />
          <span className="text-xs text-neutral-400 dark:text-neutral-500">{t('income.permitsPerWeek')}</span>
        </div>
      ) : (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">{t('income.dailyInputHint')}</p>
      )}
    </div>
  );
}

function WBSection({ wb }: { wb: WBProps }) {
  const { t, i18n } = useTranslation('resources');
  const locale = i18n.language as Locale;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{t('income.defaultMaxFloor')}</label>
        <input
          type="number"
          min={0}
          max={97}
          value={wb.multifloorDefaultMaxFloor || ''}
          placeholder="0"
          onChange={(e) =>
            wb.onUpdate({
              multifloorDefaultMaxFloor: Math.min(97, Math.max(0, Number(e.target.value) || 0)),
            })
          }
          className={`w-16 ${INPUT_CLS}`}
        />
        {wb.multifloorDefaultMaxFloor >= 14 &&
          (() => {
            const [d0, d1, d2] = calcMultifloorWBs(wb.multifloorDefaultMaxFloor);
            return (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                → {d0}+{d1}+{d2}
              </span>
            );
          })()}
      </div>

      {wb.mfSchedule.length === 0 && <p className="text-xs text-neutral-400 dark:text-neutral-500">{t('income.noMfPeriods')}</p>}

      {wb.mfSchedule.length > 0 && (
        <div className="space-y-2">
          {wb.mfSchedule.map((item) => {
            const override = wb.multifloorMaxFloors[item.id];
            const effective = override ?? wb.multifloorDefaultMaxFloor;
            const [wb0, wb1, wb2] = effective >= 14 ? calcMultifloorWBs(effective) : [0, 0, 0];
            const total = wb0 + wb1 + wb2;
            const title = getItemTitle(item, locale, i18n);
            return (
              <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs text-neutral-700 dark:text-neutral-200 min-w-0 shrink truncate" title={title}>
                  {title}
                </span>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0">{item.startTime.slice(0, 10)}</span>
                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <label className="text-xs text-neutral-500 dark:text-neutral-400">{t('income.override')}</label>
                  <input
                    type="number"
                    min={0}
                    max={97}
                    value={override ?? ''}
                    placeholder={wb.multifloorDefaultMaxFloor > 0 ? String(wb.multifloorDefaultMaxFloor) : '—'}
                    onChange={(e) => {
                      const v = Math.min(97, Math.max(0, Number(e.target.value) || 0));
                      const next = { ...wb.multifloorMaxFloors };
                      if (v <= 0) delete next[item.id];
                      else next[item.id] = v;
                      wb.onUpdate({ multifloorMaxFloors: next });
                    }}
                    className={`w-16 ${INPUT_CLS}`}
                  />
                  {total > 0 && (
                    <span className={`text-xs ${override !== undefined ? 'text-neutral-700 dark:text-neutral-200' : 'text-neutral-400 dark:text-neutral-500'}`}>
                      → {wb0}+{wb1}+{wb2}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ItemIncomeSection({ selectedItemKey, pvp, jfd, raid, expertPermit, wb }: ItemIncomeSectionProps) {
  const { t } = useTranslation('resources');
  const { t: tGame } = useTranslation('game');
  const isRaidKey = selectedItemKey === 'Item_7' || selectedItemKey === 'Item_9';
  const isEraidKey = selectedItemKey === 'Item_70' || selectedItemKey === 'Item_71';
  const isPvpKey = selectedItemKey === 'Item_8';
  const isJfdKey = selectedItemKey === 'Item_60';
  const isExpertKey = selectedItemKey === 'Currency_18';
  const isWBKey = MULTIFLOOR_WB_KEYS.includes(selectedItemKey as (typeof MULTIFLOOR_WB_KEYS)[number]);

  const isVisible = isRaidKey || isEraidKey || isPvpKey || isJfdKey || isExpertKey || isWBKey;

  const sectionTitle = useMemo(() => {
    if (isPvpKey) return tGame('tacticalChallenge');
    if (isJfdKey) return tGame('jfd');
    if (isRaidKey) return tGame('raid');
    if (isEraidKey) return tGame('eraid');
    if (isWBKey) return tGame('multifloor');
    return tGame('expertPermit');
  }, [isPvpKey, isJfdKey, isRaidKey, isEraidKey, isWBKey, tGame]);

  if (!isVisible) return null;

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 sm:p-4 space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('income.sectionTitle', { section: sectionTitle })}</h2>

      {isPvpKey && <PvpCoinSection pvpAverageRank={pvp.pvpAverageRank} pvpDailyDefenseWins={pvp.pvpDailyDefenseWins} pvpExtraWeeklyIncome={pvp.pvpExtraWeeklyIncome} onUpdate={pvp.onUpdate} />}
      {isJfdKey && <JfdSection jfd={jfd} />}
      {(isRaidKey || isEraidKey) && <RaidSection raid={{ ...raid, isRaid: isRaidKey }} />}
      {isExpertKey && <ExpertPermitSection expertPermit={expertPermit} />}
      {isWBKey && <WBSection wb={wb} />}
    </div>
  );
}
