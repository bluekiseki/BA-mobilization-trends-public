import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaExpand } from 'react-icons/fa';
import { ItemIcon } from '../common/Icon';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { groupMaterialNeeds, FUNGIBLE_POOLS, computeSubPoolXp, compactSubPool } from '~/utils/groupMaterialNeeds';
import { UnifiedMaterialModal } from './UnifiedMaterialModal';
import type { EventData, IconData, IconInfos } from '~/types/plannerData';

interface MaterialNeedsSectionProps {
  calculatedNeeds: Record<string, number>;
  eventData: EventData;
  iconData: IconData;
  title?: string;
}

export const CATEGORY_I18N: Record<string, string> = {
  credits: 'label.credits',
  eligma: 'label.eligma',
  eleph: 'item.eleph',
  xpReports: 'label.xpReports',
  equipEnh: 'label.equipEnh',
  uwGrowth: 'common.uniqueWeapon',
  potential: 'label.potential',
  opart: 'label.opart',
  tacticalBD: 'label.tacticalBD',
  techNote: 'label.techNote',
  equipment: 'label.equipment',
  skill: 'label.skill',
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
}: NeedsGridProps) => {
  const { t } = useTranslation('planner');
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

          let badgeClass = '';
          if (showFulfillmentBadge && hasAnyInventory) {
            const allOk = poolData.every(({ ownedXp, neededXp }) => ownedXp >= neededXp);
            const anyOk = poolData.some(({ ownedXp }) => ownedXp > 0);
            badgeClass = allOk ? 'bg-green-500' : anyOk ? 'bg-yellow-400' : 'bg-red-400';
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
                        <NeedsItem key={key} itemKey={key} amount={amount} materialInventory={materialInventory} eventData={eventData} iconData={iconData} iconSize={iconSize} rarity={rarity} />
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
}

const NeedsItem = ({ itemKey, amount, materialInventory, eventData, iconData, iconSize /*, rarity*/ }: NeedsItemProps) => {
  const [type, id] = itemKey.split('_');
  const owned = materialInventory[itemKey] ?? 0;
  const deficit = amount - owned;
  const hasInventoryData = Object.keys(materialInventory).length > 0;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <ItemIcon type={type} itemId={id} amount={amount} size={iconSize} eventData={eventData} iconData={iconData} />
      {hasInventoryData && (
        <span className={`text-xs font-semibold leading-none ${deficit > 0 ? 'text-red-500' : deficit < 0 ? 'text-green-500' : 'text-neutral-400 dark:text-neutral-500'}`}>
          {deficit > 0 ? `−${deficit}` : deficit < 0 ? `+${-deficit}` : '✓'}
        </span>
      )}
    </div>
  );
};

export const MaterialNeedsSection = ({ calculatedNeeds, eventData, iconData, title }: MaterialNeedsSectionProps) => {
  const [modalTab, setModalTab] = useState<'needs' | 'inventory' | null>(null);
  const { materialInventory } = useGlobalStore();
  const { t } = useTranslation('planner');

  const groups = useMemo(() => groupMaterialNeeds(calculatedNeeds), [calculatedNeeds]);
  if (groups.length === 0) return null;

  const sectionTitle = title ?? t('label.materialsForCurrentEvent');

  return (
    <div className="mt-4 space-y-2">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h3 className="font-bold dark:text-neutral-200">{sectionTitle}</h3>
          <button onClick={() => setModalTab('needs')} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors" title={t('ui.expandView')}>
            <FaExpand size={12} />
          </button>
        </div>
        <button
          onClick={() => setModalTab('inventory')}
          className="text-xs px-2 py-1 rounded border transition-colors text-neutral-500 dark:text-neutral-400 border-neutral-400 dark:border-neutral-600 hover:border-blue-400 dark:hover:border-blue-500"
        >
          {t('ui.ownedInput')}
        </button>
      </div>

      <div className="overflow-y-auto max-h-72 p-3 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg space-y-2">
        <NeedsGrid groups={groups} materialInventory={materialInventory} eventData={eventData} iconData={iconData} iconSize={12} gap="gap-2" subgroupRarity={false} showFulfillmentBadge />
      </div>

      <UnifiedMaterialModal
        isOpen={modalTab !== null}
        onClose={() => setModalTab(null)}
        calculatedNeeds={calculatedNeeds}
        eventData={eventData}
        iconData={iconData}
        title={sectionTitle}
        initialTab={modalTab ?? 'needs'}
      />
    </div>
  );
};
