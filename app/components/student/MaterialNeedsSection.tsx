import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { ItemIcon } from '../item/Icon';
import { MaterialItemTable } from '../item/MaterialItemTable';
import { MaterialLevelToggle, type MaterialDetailLevel } from '../item/MaterialLevelToggle';
import { buildMaterialRows } from '~/utils/materialTable';
import type { Locale } from '~/utils/i18n/config';
import { isCoveredByIncome, type IncomeByKey } from '~/utils/itemOutlook';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { groupMaterialNeeds, FUNGIBLE_POOLS, computeSubPoolXp, compactSubPool } from '~/utils/groupMaterialNeeds';
import { localeLink } from '~/utils/localeLink';
import type { UwXpResult } from '~/utils/uwMaterialXp';
import type { EventData, IconData, IconInfos } from '~/types/plannerData';

interface MaterialNeedsSectionProps {
  calculatedNeeds: Record<string, number>;
  eventData: EventData;
  iconData: IconData;
  title?: string;
  // Weapon-type-bonus-aware unique weapon XP coverage (see ~/utils/uwMaterialXp). When given, the
  // uwGrowth category's fulfillment badge uses this instead of the plain per-series carry-up, so
  // this screen agrees with the inventory goal-comparison summary. Falls back to the plain
  // (bonus-unaware) badge when omitted, e.g. for callers with no per-student weapon type context.
  uwSummary?: UwXpResult;
  // Expected income; when given, shortages it covers turn amber.
  incomeByKey?: IncomeByKey;
}

export const CATEGORY_I18N: Record<string, string> = {
  credits: 'game:credit',
  eligma: 'game:eligma',
  eleph: 'game:eleph',
  xpReports: 'game:report',
  equipEnh: 'game:equipEnh',
  uwGrowth: 'game:uniqueWeapon',
  potential: 'game:potential',
  opart: 'game:opart',
  tacticalBD: 'label.tacticalBD',
  techNote: 'label.techNote',
  equipment: 'game:equipment',
  skill: 'game:skills',
  other: 'label.other',
};

export const RARITY_RING: Record<number, string> = {
  2: 'ring-1 ring-blue-400 dark:ring-blue-500',
  3: 'ring-1 ring-violet-500 dark:ring-violet-400',
  4: 'ring-1 ring-yellow-400 dark:ring-yellow-300',
  5: 'ring-1 ring-red-400 dark:ring-red-300',
};

export const RARITY_LABEL: Record<number, string> = { 5: 'UR', 4: 'SSR', 3: 'SR', 2: 'R', 1: 'N' };
export const RARITY_TEXT: Record<number, string> = {
  5: 'text-red-500',
  4: 'text-yellow-500',
  3: 'text-violet-500',
  2: 'text-blue-500',
  1: 'text-neutral-400 dark:text-neutral-500',
};

export const getItemRarity = (key: string, icons?: IconInfos): number => {
  const [type, id] = key.split('_');
  return (icons?.[type as keyof IconInfos] as Record<string, { Rarity?: number }> | undefined)?.[id]?.Rarity ?? 0;
};

interface NeedsGridProps {
  groups: ReturnType<typeof groupMaterialNeeds>;
  materialInventory: Record<string, number>;
  eventData: EventData;
  iconData: IconData;
  iconSize?: number;
  gap?: string;
  subgroupRarity?: boolean;
  sortBy?: 'rarity' | 'id';
  sortByDeficit?: boolean;
  showFulfillmentBadge?: boolean;
  uwSummary?: UwXpResult;
  incomeByKey?: IncomeByKey;
}

export const NeedsGrid = ({
  groups,
  materialInventory,
  eventData,
  iconData,
  iconSize = 12,
  gap = 'gap-2',
  subgroupRarity = false,
  sortBy = 'rarity',
  sortByDeficit = false,
  showFulfillmentBadge = false,
  uwSummary,
  incomeByKey,
}: NeedsGridProps) => {
  const { t } = useTranslation(['planner', 'game']);
  const tStr = t as (k: string) => string;
  const hasAnyInventory = Object.keys(materialInventory).length > 0;

  return (
    <>
      {groups.map(({ categoryKey, items }, groupIdx) => {
        const subPools = FUNGIBLE_POOLS[categoryKey] ?? null;

        // ── Fungible category: compact (carry-up) display ────────────────────
        if (subPools) {
          // Per sub-pool: compact items + pool XP stats
          const poolData = subPools
            .map((sp) => {
              const keys = sp.keys; // as readonly string[];
              const spItems = items.filter(({ key }) => keys.includes(key));
              const compacted = compactSubPool(sp, spItems);
              const neededXp = compacted.reduce((s, { key, amount }) => {
                const idx = keys.indexOf(key);
                return idx >= 0 ? s + amount * sp.xpPer[idx] : s;
              }, 0);
              const ownedXp = hasAnyInventory ? computeSubPoolXp(sp, materialInventory) : 0;
              return { sp, compacted, neededXp, ownedXp };
            })
            .filter(({ compacted }) => compacted.length > 0);

          if (poolData.length === 0) return null;

          const useUwSummary = categoryKey === 'uwGrowth' && uwSummary != null;
          let badgeClass = '';
          if (showFulfillmentBadge && hasAnyInventory) {
            if (useUwSummary) {
              badgeClass = uwSummary.deficit <= 0 ? 'bg-green-500' : uwSummary.effectiveOwned > 0 ? 'bg-yellow-400' : 'bg-red-400';
            } else {
              const allOk = poolData.every(({ ownedXp, neededXp }) => ownedXp >= neededXp);
              const anyOk = poolData.some(({ ownedXp }) => ownedXp > 0);
              badgeClass = allOk ? 'bg-green-500' : anyOk ? 'bg-yellow-400' : 'bg-red-400';
            }
          }

          return (
            <div key={categoryKey}>
              {groupIdx > 0 && <div className="border-t border-neutral-200 dark:border-neutral-700 my-2" />}
              <div className="flex items-center gap-1.5 mb-1">
                {showFulfillmentBadge && hasAnyInventory && <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${badgeClass}`} />}
                <span className="text-xs text-neutral-400 dark:text-neutral-500">{tStr(CATEGORY_I18N[categoryKey] ?? categoryKey)}</span>
              </div>

              {poolData.map(({ sp, compacted, neededXp, ownedXp }, spIdx) => {
                const topXpPer = sp.xpPer[sp.xpPer.length - 1];
                const surplusXp = ownedXp - neededXp;
                return (
                  <div key={spIdx} className={spIdx > 0 ? 'mt-2' : ''}>
                    <div className={`flex flex-wrap ${gap}`}>
                      {compacted.map(({ key, amount }) => {
                        const [type, id] = key.split('_');
                        return (
                          <div key={key} className="flex flex-col items-center gap-0.5">
                            <ItemIcon type={type} itemId={id} amount={amount} size={iconSize} eventData={eventData} iconData={iconData} />
                          </div>
                        );
                      })}
                    </div>
                    {hasAnyInventory && neededXp > 0 && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px]">
                        {surplusXp >= 0 ? (
                          <span className="text-green-500 font-semibold">✓ +{Math.floor(surplusXp / topXpPer)}</span>
                        ) : (
                          <span className="text-red-400 font-semibold">−{Math.ceil(-surplusXp / topXpPer)}</span>
                        )}
                        <span className="text-neutral-300 dark:text-neutral-700">
                          ({(ownedXp / topXpPer).toFixed(1)} / {(neededXp / topXpPer).toFixed(1)})
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        }

        // ── Non-fungible category: original rendering ────────────────────────
        let sorted: typeof items;
        if (sortByDeficit) {
          sorted = [...items].sort((a, b) => {
            const dA = a.amount - (materialInventory[a.key] ?? 0);
            const dB = b.amount - (materialInventory[b.key] ?? 0);
            return dB - dA;
          });
        } else if (sortBy === 'id') {
          sorted = [...items].sort((a, b) => {
            const idA = parseInt(a.key.split('_')[1] ?? '0', 10);
            const idB = parseInt(b.key.split('_')[1] ?? '0', 10);
            return idA - idB;
          });
        } else {
          sorted = [...items].sort((a, b) => getItemRarity(b.key, eventData.icons) - getItemRarity(a.key, eventData.icons));
        }

        let badgeClass = '';
        if (showFulfillmentBadge && hasAnyInventory) {
          const metCount = items.filter(({ key, amount }) => (materialInventory[key] ?? 0) >= amount).length;
          badgeClass = metCount === items.length ? 'bg-green-500' : metCount > 0 ? 'bg-yellow-400' : 'bg-red-400';
        }

        const byRarity: { rarity: number; items: typeof sorted }[] = [];
        if (subgroupRarity) {
          for (const item of sorted) {
            const r = getItemRarity(item.key, eventData.icons);
            const last = byRarity[byRarity.length - 1];
            if (last && last.rarity === r) last.items.push(item);
            else byRarity.push({ rarity: r, items: [item] });
          }
          if (sortByDeficit) {
            for (const group of byRarity) {
              group.items.sort((a, b) => {
                const dA = a.amount - (materialInventory[a.key] ?? 0);
                const dB = b.amount - (materialInventory[b.key] ?? 0);
                return dB - dA;
              });
            }
          }
        }

        return (
          <div key={categoryKey}>
            {groupIdx > 0 && <div className="border-t border-neutral-200 dark:border-neutral-700 my-2" />}
            <div className="flex items-center gap-1.5 mb-1">
              {showFulfillmentBadge && hasAnyInventory && <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${badgeClass}`} />}
              <span className="text-xs text-neutral-400 dark:text-neutral-500">{tStr(CATEGORY_I18N[categoryKey] ?? categoryKey)}</span>
            </div>

            {subgroupRarity ? (
              <div className="space-y-2">
                {byRarity.map(({ rarity, items: rItems }) => (
                  <div key={rarity}>
                    <span className={`text-[10px] font-bold ${RARITY_TEXT[rarity] ?? 'text-neutral-400'}`}>{RARITY_LABEL[rarity] ?? `Rarity ${rarity}`}</span>
                    <div className={`flex flex-wrap ${gap} mt-1`}>
                      {rItems.map(({ key, amount }) => (
                        <NeedsItem
                          key={key}
                          itemKey={key}
                          amount={amount}
                          materialInventory={materialInventory}
                          eventData={eventData}
                          iconData={iconData}
                          iconSize={iconSize}
                          rarity={rarity}
                          incomeByKey={incomeByKey}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`flex flex-wrap ${gap}`}>
                {sorted.map(({ key, amount }) => (
                  <NeedsItem
                    key={key}
                    itemKey={key}
                    amount={amount}
                    materialInventory={materialInventory}
                    eventData={eventData}
                    iconData={iconData}
                    iconSize={iconSize}
                    rarity={getItemRarity(key, eventData.icons)}
                    incomeByKey={incomeByKey}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};

interface NeedsItemProps {
  itemKey: string;
  amount: number;
  materialInventory: Record<string, number>;
  eventData: EventData;
  iconData: IconData;
  iconSize: number;
  rarity: number;
  incomeByKey?: IncomeByKey;
}

const NeedsItem = ({ itemKey, amount, materialInventory, eventData, iconData, iconSize, incomeByKey }: NeedsItemProps) => {
  const { i18n } = useTranslation('planner');
  const location = useLocation();
  const [type, id] = itemKey.split('_');
  const owned = materialInventory[itemKey] ?? 0;
  const deficit = amount - owned;
  const hasInventoryData = Object.keys(materialInventory).length > 0;
  const tracked = !!incomeByKey && hasInventoryData;
  const deficitColor = tracked && isCoveredByIncome(deficit, incomeByKey[itemKey]) ? 'text-amber-500' : 'text-red-500';
  const content = (
    <>
      <ItemIcon type={type} itemId={id} amount={amount} size={iconSize} eventData={eventData} iconData={iconData} />
      {hasInventoryData && (
        <span className={`text-xs font-semibold leading-none ${deficit > 0 ? deficitColor : deficit < 0 ? 'text-green-500' : 'text-neutral-400 dark:text-neutral-500'}`}>
          {deficit > 0 ? `−${deficit}` : deficit < 0 ? `+${-deficit}` : '✓'}
        </span>
      )}
    </>
  );
  if (!tracked || deficit <= 0) return <div className="flex flex-col items-center gap-0.5">{content}</div>;
  // The inventory page already has the timeline chart, event income log and farming stages for a selected item.
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const to = `${localeLink(i18n.language, '/planner/inventory')}?item=${itemKey}&showTarget=1&returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <Link to={to} className="flex flex-col items-center gap-0.5">
      {content}
    </Link>
  );
};

export const MaterialNeedsSection = ({ calculatedNeeds, eventData, iconData, title, uwSummary, incomeByKey }: MaterialNeedsSectionProps) => {
  const { materialInventory } = useGlobalStore();
  const { t, i18n } = useTranslation('planner');
  const { t: tUi } = useTranslation('ui');
  const location = useLocation();

  // 'id' keeps each material series (T1..T4) together; 'rarity' lists all top-tier items first.
  const [sortBy, setSortBy] = useState<'rarity' | 'id'>('id');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [level, setLevel] = useState<MaterialDetailLevel>('total');
  const locale = i18n.language as Locale;
  const rows = useMemo(() => buildMaterialRows({ needs: calculatedNeeds, inventory: materialInventory, incomeByKey }), [calculatedNeeds, materialInventory, incomeByKey]);

  const groups = useMemo(() => groupMaterialNeeds(calculatedNeeds), [calculatedNeeds]);
  // Fungible pools (reports etc.) render as carry-up totals and never use the amber state.
  const hasCovered = useMemo(
    () =>
      !!incomeByKey &&
      groups.some(({ categoryKey, items }) => !FUNGIBLE_POOLS[categoryKey] && items.some(({ key, amount }) => isCoveredByIncome(amount - (materialInventory[key] ?? 0), incomeByKey[key]))),
    [incomeByKey, groups, materialInventory],
  );
  if (groups.length === 0) return null;

  const sectionTitle = title ?? t('label.materialsForCurrentEvent');
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const inventoryLink = `${localeLink(i18n.language, '/planner/inventory')}?showTarget=1&returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex justify-between items-center">
        <h3 className="font-bold dark:text-neutral-200">{sectionTitle}</h3>
        <div className="flex items-center gap-2">
          <div className="flex text-xs rounded border border-neutral-400 dark:border-neutral-600 overflow-hidden">
            {(
              [
                ['grid', t('materialTable.view.grid')],
                ['table', tUi('table')],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                aria-pressed={view === value}
                className={`px-2 py-1 transition-colors ${
                  view === value ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100' : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={`flex text-xs rounded border border-neutral-400 dark:border-neutral-600 overflow-hidden ${view === 'table' ? 'hidden' : ''}`}>
            {(
              [
                ['id', t('inventory.sortByType')],
                ['rarity', t('ui.sortByRarity')],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSortBy(value)}
                aria-pressed={sortBy === value}
                className={`px-2 py-1 transition-colors ${
                  sortBy === value
                    ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100'
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Link
            to={inventoryLink}
            className="text-xs px-2 py-1 rounded border transition-colors text-neutral-500 dark:text-neutral-400 border-neutral-400 dark:border-neutral-600 hover:border-blue-400 dark:hover:border-blue-500"
          >
            {t('ui.ownedInput')}
          </Link>
        </div>
      </div>

      {view === 'table' ? (
        <div className="space-y-2">
          <MaterialLevelToggle value={level} onChange={setLevel} className="ml-auto w-fit" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 overflow-y-auto max-h-[36rem]">
            {rows.map((row) => (
              <MaterialItemTable key={row.key} row={row} eventData={eventData} iconData={iconData} locale={locale} level={level} />
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-y-auto max-h-72 p-3 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg space-y-2">
          <NeedsGrid
            groups={groups}
            materialInventory={materialInventory}
            eventData={eventData}
            iconData={iconData}
            iconSize={12}
            gap="gap-2"
            subgroupRarity={false}
            sortBy={sortBy}
            showFulfillmentBadge
            uwSummary={uwSummary}
            incomeByKey={incomeByKey}
          />
        </div>
      )}
      {hasCovered && <p className="text-xs text-neutral-400 dark:text-neutral-500">{t('itemOutlook.legendCovered')}</p>}
    </div>
  );
};
