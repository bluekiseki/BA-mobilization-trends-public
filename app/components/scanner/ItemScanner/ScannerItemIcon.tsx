import { getRawIconInfo, getRawIconImg } from '~/scanner/iconLoader';
import { ItemIcon } from '~/components/planner/common/Icon';
import type { EventData } from '~/types/plannerData';

interface Props {
  inventoryKey: string; // e.g. "Equipment_8006", "Item_10"
  amount: number | string;
  size?: number; // passed to ItemIcon (default 8 = 2rem)
}

/** Splits "Equipment_8006" → type="Equipment", itemId="8006" */
function parseKey(key: string): { type: string; itemId: string } {
  const sep = key.indexOf('_');
  if (sep === -1) return { type: 'Item', itemId: key };
  return { type: key.slice(0, sep), itemId: key.slice(sep + 1) };
}

export function ScannerItemIcon({ inventoryKey, amount, size = 8 }: Props) {
  const { type, itemId } = parseKey(inventoryKey);
  const eventData = { icons: getRawIconInfo() } as unknown as EventData;
  const iconData = getRawIconImg(); // as IconData;

  return <ItemIcon type={type} itemId={itemId} amount={amount} size={size} eventData={eventData} iconData={iconData} />;
}
