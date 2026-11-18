// app/components/planner/resources/ResourceTimelinePanel.tsx
//
// Presentational panel for the resource-projection chart. Extracted from the
// old ResourcePanel.tsx render body — the derivation now lives in
// useResourceProjection(). Shared by planner/resources and planner/inventory.
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { meanFromDist } from '~/utils/gachaEngine';
import { getPercentileFromDist } from '~/utils/elephEligmaCalc';
import ResourceTimelineChart from './ResourceTimelineChart';
import { groupTimelineAnnotations, ResourceEventLogList } from './ResourceEventLog';
import { ItemIcon } from '~/components/item/Icon';
import type { EventData, IconData, IconInfo, IconInfos } from '~/types/plannerData';
import { getLocalizeEtcName } from '~/utils/locale';
import type { Locale } from '~/utils/i18n/config';
import { getItemTypeFromKey } from '~/utils/itemType';
import type { ResourceProjection } from './useResourceProjection';

// Weekly spend caps flagged on the chart (only the eligma-exchange coin today).
const ITEM_WEEKLY_LIMITS: Record<string, number> = {
  Currency_18: 12000,
};

interface ResourceTimelinePanelProps {
  projection: ResourceProjection;
  /** Item whose detail card + chart is shown; falls back to the first tracked item. */
  selectedKey: string | null;
  gachaEligmaPercentile: number;
  gachaEligmaUseMean: boolean;
  onSetPercentile: (v: number) => void;
  onSetUseMean: (v: boolean) => void;
  iconInfos: IconInfos | null;
  iconData: IconData | null;
  locale: string;
  /** Rendered inside the container when the selected item is a student eleph. */
  studentPlansSection?: React.ReactNode;
}

export default function ResourceTimelinePanel({
  projection,
  selectedKey,
  gachaEligmaPercentile,
  gachaEligmaUseMean,
  onSetPercentile,
  onSetUseMean,
  iconInfos,
  iconData,
  locale,
  studentPlansSection,
}: ResourceTimelinePanelProps) {
  const { t, i18n } = useTranslation('resources');
  const { t: t_ui } = useTranslation('ui');

  const { trackingItems, timelines, annotations, planningTimelines, eventItemsByKey, distEligma } = projection;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const eventData = useMemo(() => ({ icons: iconInfos ?? {} }) as unknown as EventData, [iconInfos]);

  const getLabelForKey = (key: string): string => {
    const ti = trackingItems.find((t) => t.key === key);
    if (ti) {
      const loc = getLocalizeEtcName(ti.iconInfo?.LocalizeEtc, i18n.language as Locale);
      if (loc) return loc;
      if (ti.label) return ti.label;
    }
    const idx = key.lastIndexOf('_');
    if (idx >= 0) {
      const type = key.slice(0, idx);
      const id = key.slice(idx + 1);
      const rec = iconInfos?.[type as keyof typeof iconInfos] as Record<string, IconInfo> | undefined;
      const loc = getLocalizeEtcName(rec?.[id]?.LocalizeEtc, i18n.language as Locale);
      if (loc) return loc;
    }
    return key;
  };

  const renderIcon = (key: string, twSize: 'sm' | 'md') => {
    if (!iconData) return null;
    const i = key.lastIndexOf('_');
    if (i < 0) return null;
    return <ItemIcon type={key.slice(0, i)} itemId={key.slice(i + 1)} amount={0} size={twSize === 'sm' ? 4 : 6} eventData={eventData} iconData={iconData} />;
  };

  const effectiveKey = selectedKey && timelines[selectedKey] ? selectedKey : (trackingItems[0]?.key ?? null);

  // ---------------------------------------------------------------------------
  // Selected item details
  // ---------------------------------------------------------------------------

  const isEligma = effectiveKey === 'Item_23';
  const isStudentEleph = !isEligma && getItemTypeFromKey(effectiveKey ?? '', iconInfos) === 'SecretStone';
  const eventIncomeItems = eventItemsByKey[effectiveKey ?? ''] ?? [];

  const hasGachaData = distEligma.length > 0;
  const getGachaEligmaPercentile = (pct: number) => getPercentileFromDist(distEligma, pct);
  const gachaP10 = hasGachaData ? getGachaEligmaPercentile(10) : null;
  const gachaP50 = hasGachaData ? getGachaEligmaPercentile(50) : null;
  const gachaP90 = hasGachaData ? getGachaEligmaPercentile(90) : null;
  const gachaAvg = hasGachaData ? Math.round(meanFromDist(distEligma)) : null;

  const groupedEventLog = useMemo(() => {
    if (!effectiveKey) return [];
    return groupTimelineAnnotations(annotations[effectiveKey] ?? {});
  }, [effectiveKey, annotations]);

  const selectedTimeline = effectiveKey ? timelines[effectiveKey] : undefined;
  const hasBand = selectedTimeline ? selectedTimeline.some((p) => p.probabilistic || p.p10 !== p.p90) : false;
  // When band data exists, show the planning-percentile value; otherwise fall back to p50
  const lastPlanningValue = effectiveKey ? (hasBand ? planningTimelines[effectiveKey]?.at(-1)?.p50 : timelines[effectiveKey]?.at(-1)?.p50) : undefined;
  const planningLabel = gachaEligmaUseMean ? t_ui('avg') : `P${gachaEligmaPercentile}`;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const sectionLabelCls = 'text-xs font-semibold text-neutral-500 dark:text-neutral-400';
  const noteCls = 'text-xs text-neutral-400 dark:text-neutral-500 italic';

  return (
    <>
      <div className="px-4 py-3 space-y-4">
        {studentPlansSection && <div className="pt-1">{studentPlansSection}</div>}

        {/* Selected item */}
        {effectiveKey && timelines[effectiveKey] && (
          <div className={`${studentPlansSection ? 'border-t border-neutral-100 dark:border-neutral-800 pt-3' : ''} space-y-4`}>
            {/* Header: icon + label + final balance */}
            <div className="flex items-center gap-2">
              {renderIcon(effectiveKey, 'md')}
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{getLabelForKey(effectiveKey)}</span>
              {lastPlanningValue !== undefined && (
                <span className="ml-auto font-mono text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
                  {hasBand && <span className="mr-0.5 text-neutral-300 dark:text-neutral-600">{planningLabel}</span>}
                  {lastPlanningValue.toLocaleString()}
                </span>
              )}
            </div>

            {/* Eligma: gacha simulation stats */}
            {isEligma && (
              <div className="space-y-2.5">
                <span className={sectionLabelCls}>{t('panel.gachaSimulation')}</span>
                {hasGachaData ? (
                  <div className="flex gap-6">
                    {[
                      { l: 'P10', v: gachaP10 },
                      { l: 'P50', v: gachaP50 },
                      { l: 'P90', v: gachaP90 },
                      { l: t_ui('avg'), v: gachaAvg },
                    ].map(({ l, v }) => (
                      <div key={l} className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{l}</span>
                        <span className="font-mono text-sm font-semibold text-neutral-700 dark:text-neutral-200">{v?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={noteCls}>
                    {t('panel.noSimDataPre')}{' '}
                    <Link to={`/${locale}/planner/gacha`} className="text-blue-500 hover:underline not-italic">
                      {t_ui('simulation')}
                    </Link>
                    {t('panel.noSimDataPost')}
                  </p>
                )}
              </div>
            )}

            {/* Planning percentile — shown for any item with probabilistic band data */}
            {hasBand && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('panel.planAt')}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">P</span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    step={5}
                    value={gachaEligmaPercentile}
                    disabled={gachaEligmaUseMean}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(99, Number(e.target.value)));
                      if (!Number.isNaN(v)) onSetPercentile(v);
                    }}
                    className="w-14 px-2 py-0.5 text-xs font-bold rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400 text-right tabular-nums disabled:opacity-50"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 cursor-pointer">
                  <input type="checkbox" checked={gachaEligmaUseMean} onChange={(e) => onSetUseMean(e.target.checked)} className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-600" />
                  {t_ui('avg')}
                </label>
              </div>
            )}

            {/* Event income */}
            {(isEligma || isStudentEleph) && eventIncomeItems.length === 0 && (
              <p className={noteCls}>
                {t('panel.noEventDataPre')}{' '}
                <Link to={`/${locale}/planner/event`} className="text-blue-500 hover:underline not-italic">
                  {t('panel.goToEventPlanner')}
                </Link>
                {t('panel.noEventDataPost')}
              </p>
            )}

            {/* Contextual notes */}
            {effectiveKey.startsWith('Item_') && Number(effectiveKey.slice(5)) >= 10000 && <p className={noteCls}>{t('panel.coinShopNote')}</p>}

            {/* Timeline chart — full-bleed (breaks out of px-4 via -mx-4) */}
            <div className="-mx-4">
              <ResourceTimelineChart
                label={getLabelForKey(effectiveKey)}
                data={timelines[effectiveKey]}
                weeklySpendLimit={ITEM_WEEKLY_LIMITS[effectiveKey]}
                annotations={annotations[effectiveKey]}
                planningLine={hasBand ? planningTimelines[effectiveKey] : undefined}
                planningLabel={hasBand ? planningLabel : undefined}
                resolveItemLabel={getLabelForKey}
              />
            </div>
          </div>
        )}
      </div>

      {/* Event log */}
      {groupedEventLog.length > 0 && (
        <div className="px-4 pb-3 pt-1 space-y-1.5 border-t border-neutral-100 dark:border-neutral-800">
          <ResourceEventLogList rows={groupedEventLog} resolveItemLabel={getLabelForKey} />
        </div>
      )}
    </>
  );
}
