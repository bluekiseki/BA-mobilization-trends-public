import type { CoinShopItem } from '~/data/elephSources';

export type PurchasePanelEntry = {
  gainItemKey: string;
  label: string;
  shopItem: CoinShopItem;
  coinKey: string;
  availableFrom?: string;
  sourceType?: string;
  isAtMax: boolean;
};

export interface SummaryPoolStat {
  // i18n key with namespace prefix, e.g. 'game:report'.
  labelKey: string;
  ownedXp: number;
  requiredXp: number;
  // i18n key for an optional hover/tap explanation, shown via an info icon next to the label.
  tooltipKey?: string;
  // Representative item ("Type_id") whose icon is shown next to the label — a single decorative
  // icon, not a breakdown (see doc comment below for why itemized icons were rejected before).
  iconKey: string;
}
