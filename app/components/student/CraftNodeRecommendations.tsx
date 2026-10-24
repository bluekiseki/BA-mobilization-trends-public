// "Recommended Crafting Nodes" — ranks the gift-producing Cafe crafting nodes by the
// expected favor EXP one craft yields for the currently selected student, grouped by tier.
// Rendered inside AffectionTab. Gift names/descriptions are omitted on purpose: the ItemIcon
// hover tooltip already shows them.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { RiInformationLine } from 'react-icons/ri';

import type { EventData, IconData } from '~/types/plannerData';
import type { CraftingGiftNode, CraftingGiftNodesData } from '~/types/crafting';
import type { Locale } from '~/utils/i18n/config';
import { getLocaleShortName } from '~/utils/i18n/config';
import { ItemIcon } from '../item/Icon';
import { getPreferenceIcon, type GiftEntry } from './GiftStudentSheet';
import { loadCraftingGiftNodes } from '../../utils/student/craftingGiftNodesData';
import { tierBestExpectedExp } from '../../utils/student/craftNodeTierBest';

interface RankedNode {
  node: CraftingGiftNode;
  gifts: CraftingGiftNode['gifts'];
  perCraft: number;
}

interface GiftInfo {
  ap: number;
  preferenceLevel: number;
  rarity: number;
}

interface Props {
  giftAffectionList: GiftEntry[];
  eventData: EventData;
  iconData: IconData;
  locale: Locale;
  /** Mirrors AffectionTab's "Convert to Favorite Gifts" toggle. */
  simulateCrafting: boolean;
}

export const CraftNodeRecommendations = ({ giftAffectionList, eventData, iconData, locale, simulateCrafting }: Props) => {
  const { t } = useTranslation('planner');
  const [data, setData] = useState<CraftingGiftNodesData | null>(null);
  const shortLocale = getLocaleShortName(locale);

  useEffect(() => {
    let alive = true;
    loadCraftingGiftNodes()
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ nodes: [], tierOtherWeights: {} }));
    return () => {
      alive = false;
    };
  }, []);

  const giftInfoById = useMemo(() => {
    const map = new Map<number, GiftInfo>();
    for (const gift of giftAffectionList) {
      map.set(Number(gift.id), { ap: gift.affectionPoints, preferenceLevel: gift.preferenceLevel, rarity: gift.rarity });
    }
    return map;
  }, [giftAffectionList]);

  // Value of the best rarity-2 (SR) gift for this student — the payoff of one gift conversion,
  // matching AffectionTab's own crafting-simulation model.
  const targetUnitValue = useMemo(() => {
    const best = giftAffectionList.filter((g) => g.rarity === 2).reduce((max, g) => Math.max(max, g.affectionPoints), 0);
    return best || 60;
  }, [giftAffectionList]);

  // tier -> { ranked nodes (desc by EXP per craft), best-pick expected EXP }
  const byTier = useMemo(() => {
    // With "Convert to Favorite Gifts" on, a low-value (fodder) gift is worth half a converted
    // gift instead of its raw EXP: 2 fodder -> 1 gift worth targetUnitValue.
    const giftValue = (itemId: number) => {
      const ap = giftInfoById.get(itemId)?.ap ?? 0;
      if (simulateCrafting && ap * 2 < targetUnitValue) return targetUnitValue / 2;
      return ap;
    };

    const groups = new Map<number, RankedNode[]>();
    for (const node of data?.nodes ?? []) {
      const gifts = node.giftsGlobal ?? node.gifts;
      const perCraft = gifts.reduce((sum, g) => sum + g.expectedCount * giftValue(g.itemId), 0);
      if (perCraft <= 0) continue;
      const list = groups.get(node.tier) ?? [];
      list.push({ node, gifts, perCraft });
      groups.set(node.tier, list);
    }

    const result: [number, { rows: RankedNode[]; bestExpected: number }][] = [];
    for (const [tier, list] of groups) {
      list.sort((a, b) => b.perCraft - a.perCraft);
      // Exact expected EXP if you always craft the best of the 5 nodes offered at this tier.
      const bestExpected = tierBestExpectedExp(
        list.map((r) => ({ weight: r.node.weight, perCraft: r.perCraft })),
        data?.tierOtherWeights[String(tier)] ?? [],
      );
      result.push([tier, { rows: list, bestExpected }]);
    }
    return result.sort((a, b) => a[0] - b[0]);
  }, [data, giftInfoById, targetUnitValue, simulateCrafting]);

  if (!data) return null;

  // Node spawn chance as a readable percentage (e.g. 0.024 -> "2.4%", 0.94 -> "94%").
  const pct = (c: number) => `${(c * 100).toFixed(c < 0.1 ? 1 : 0)}%`;

  return (
    <div className="mt-4 border-t border-neutral-200 dark:border-neutral-700 pt-6">
      <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">{t('affectionTab.craftNodes.title')}</h3>
      <p className="mt-0.5 mb-2.5 text-xs text-neutral-400">{t('affectionTab.craftNodes.help')}</p>

      {byTier.length === 0 ? (
        <p className="text-sm text-neutral-400 py-4 text-center">{t('affectionTab.craftNodes.empty')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-neutral-400 text-left border-b border-neutral-100 dark:border-neutral-800">
              <th className="font-medium pb-1 whitespace-nowrap">{t('affectionTab.craftNodes.colNode')}</th>
              <th className="font-medium pb-1 pl-2 whitespace-nowrap">
                <span className="inline-flex items-center gap-0.5">
                  {t('affectionTab.craftNodes.colSpawn')}
                  <Tooltip placement="top" overlay={<span className="text-xs leading-relaxed">{t('affectionTab.craftNodes.spawnHelp')}</span>}>
                    <span className="text-neutral-400 cursor-help">
                      <RiInformationLine size={13} />
                    </span>
                  </Tooltip>
                </span>
              </th>
              <th className="pb-1" />
              <th className="font-medium pb-1 text-right whitespace-nowrap">{t('affectionTab.craftNodes.colExp')}</th>
            </tr>
          </thead>
          <tbody>
            {byTier.map(([tier, { rows, bestExpected }], groupIndex) => (
              <Fragment key={tier}>
                <tr>
                  <td colSpan={4} className={groupIndex === 0 ? 'pt-2 pb-1' : 'pt-7 pb-1'}>
                    <span className="text-sm font-bold text-neutral-600 dark:text-neutral-300">T{tier}</span>
                    <span className="ml-2 text-[11px] font-normal text-neutral-400">
                      {t('affectionTab.craftNodes.tierBest')} <span className="font-bold tabular-nums text-neutral-500 dark:text-neutral-300">+{bestExpected.toFixed(1)}</span>
                    </span>
                  </td>
                </tr>
                {rows.map(({ node, gifts, perCraft }) => (
                  <tr key={node.nodeId} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-2 pr-2 font-medium text-neutral-700 dark:text-neutral-200 whitespace-nowrap w-0">{node.name[shortLocale]}</td>
                    <td className="py-2 pl-2 pr-2 text-neutral-400 tabular-nums whitespace-nowrap w-0">{pct(node.chance.global)}</td>
                    <td className="py-2 pr-2">
                      {node.targeted ? (
                        <div className="flex flex-wrap gap-1">
                          {gifts.map((g) => {
                            const info = giftInfoById.get(g.itemId);
                            return (
                              <div key={g.itemId} className="relative">
                                <ItemIcon type="Item" itemId={String(g.itemId)} amount={0} size={8} eventData={eventData} iconData={iconData} />
                                {info && <img src={getPreferenceIcon(info.preferenceLevel, info.rarity)} alt="" className="pointer-events-none absolute -bottom-1 -right-1 w-4 h-4 object-contain" />}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400">{t('affectionTab.craftNodes.randomPool')}</span>
                      )}
                    </td>
                    <td className="py-2 text-right font-bold tabular-nums text-neutral-700 dark:text-neutral-200 whitespace-nowrap w-0">+{perCraft.toFixed(1)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
