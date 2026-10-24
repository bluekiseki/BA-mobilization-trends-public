import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ItemIcon } from '../../../components/item/Icon';
import type { CardShopItem, EventData, IconData } from '~/types/plannerData';
import { rarityRowBackground } from '../components/rarityColors';
import { useIsDarkState } from '~/store/isDarkState';
import { formatPercent, getCardShopRateRows, getCardShopSlotRates } from '~/features/event-planner/logic/cardShopRates';

const RARITY_LABELS: Record<number, string> = { 0: 'N', 1: 'R', 2: 'SR', 3: 'SSR' };
const RARITIES = [0, 1, 2, 3];

interface CardShopRateTableProps {
  cards: CardShopItem[];
  eventData: EventData;
  iconData: IconData;
}

// The last slot is the one reached after repeated misses on SR+; every slot before it is a normal slot
export const CardShopRateTable = ({ cards, eventData, iconData }: CardShopRateTableProps) => {
  const { t } = useTranslation('planner');
  const { isDark } = useIsDarkState();
  const theme = isDark === 'dark' ? 'dark' : 'light';
  const slots = useMemo(() => getCardShopSlotRates(cards), [cards]);
  const rows = useMemo(() => getCardShopRateRows(slots), [slots]);
  if (slots.length === 0) return null;

  const isGuaranteed = (index: number) => index === slots.length - 1 && slots.length > 1;
  const slotTitle = (index: number) => (isGuaranteed(index) ? t('cardShop.guaranteedSlot') : t('cardShop.normalSlot'));
  const slotSub = (index: number) => (isGuaranteed(index) ? t('cardShop.guaranteedSlotWhen') : t('cardShop.normalSlotWhen'));

  return (
    <div className="space-y-4">
      <table className="text-sm">
        <thead>
          <tr className="border-b border-neutral-300 dark:border-neutral-600 align-bottom">
            <th className="w-10" />
            {slots.map((slot, i) => (
              <th key={slot.groups.join('-')} className="py-1 pl-6 pr-2 text-right font-semibold dark:text-neutral-200">
                {slotTitle(i)}
                <div className="text-xs font-normal text-neutral-500 dark:text-neutral-400">{slotSub(i)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RARITIES.map((r) => (
            <tr key={r} style={{ backgroundColor: rarityRowBackground(theme, r) }}>
              <td className={`py-1 pl-2 ${r >= 2 ? 'font-semibold' : ''} dark:text-neutral-300`}>{RARITY_LABELS[r]}</td>
              {slots.map((slot) => (
                <td key={slot.groups.join('-')} className={`py-1 pl-6 pr-2 text-right tabular-nums ${r >= 2 ? 'font-semibold' : ''} dark:text-neutral-300`}>
                  {slot.byRarity[r] ? formatPercent(slot.byRarity[r]) : '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <div className="flex items-end gap-2 border-b px-2 border-neutral-300 pb-1 text-[10px] font-semibold md:text-xs dark:border-neutral-600 dark:text-neutral-200">
          <span className="w-6 shrink-0 md:w-8" />
          {slots.map((slot, i) => (
            <span key={slot.groups.join('-')} className="w-12 shrink-0 text-right md:w-14">
              {slotTitle(i)}
            </span>
          ))}
        </div>
        <div>
          {rows.map(({ key, card, percents }) => (
            <div key={key} className="flex items-center gap-2 px-2 py-2 text-xs dark:text-neutral-300" style={{ backgroundColor: rarityRowBackground(theme, card.Rarity) }}>
              <span className={`w-6 shrink-0 md:w-8 ${card.Rarity >= 2 ? 'font-semibold' : ''}`}>{RARITY_LABELS[card.Rarity]}</span>
              {percents.map((percent, i) => (
                <span key={slots[i].groups.join('-')} className="w-12 shrink-0 text-right tabular-nums md:w-14">
                  {percent === null ? '-' : formatPercent(percent)}
                </span>
              ))}
              {/* Rewards are the last column; icons wrap inside it so narrow screens keep a single row per card */}
              <div className="flex min-w-0 flex-1 flex-wrap gap-x-1.5 gap-y-1 pl-2">
                {card.RewardParcelId.map((id, idx) => (
                  <ItemIcon key={`${id}-${idx}`} type={card.RewardParcelTypeStr[idx]} itemId={String(id)} amount={card.RewardParcelAmount[idx]} size={10} eventData={eventData} iconData={iconData} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
