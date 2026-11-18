import { useTranslation } from 'react-i18next';
import { COIN_SHOP_DEFS } from '~/data/elephSources';
import type { CoinShopMonthly } from '~/utils/itemOutlook';

const PLANNED_SHOP_KEYS = new Set(COIN_SHOP_DEFS.flatMap((def) => def.items.map((item) => item.gainItemKey)));

/** Coin shops that sell the item and whose purchases are not already planned through the purchase panel. */
export function findAutoBuyShops(monthly: CoinShopMonthly | null, itemKey: string): string[] {
  if (!monthly || PLANNED_SHOP_KEYS.has(itemKey)) return [];
  return Object.entries(monthly).flatMap(([coinKey, items]) => (itemKey in items ? [coinKey] : []));
}

interface ShopAutoBuyToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ShopAutoBuyToggle({ checked, onChange }: ShopAutoBuyToggleProps) {
  const { t } = useTranslation('resources');
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {t('autoBuy.jfd')}
    </label>
  );
}
