import { useEffect, useState, memo } from 'react';
import type { IconData, IconInfo, IconInfos } from '~/types/plannerData';
import { RARITY_BG_CLASSES } from '~/utils/gameColors';

const MOBILE_ICON_SIZE = 10;
const DESKTOP_ICON_SIZE = 12;

export function useResourceIconSize(): number {
  const [size, setSize] = useState(MOBILE_ICON_SIZE);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const update = () => setSize(mq.matches ? DESKTOP_ICON_SIZE : MOBILE_ICON_SIZE);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return size;
}

export type ResourceStatus = 'ok' | 'short' | null;

interface ResourceIconButtonProps {
  itemKey: string;
  category: string;
  id: string;
  amount: number;
  icons: IconInfos;
  iconData: IconData;
  size: number;
  title: string;
  status: ResourceStatus;
  isActive?: boolean;
  onEditItem: (itemKey: string) => void;
}

function formatAmount(amount: number): string {
  if (amount >= 10_000_000) return `${(amount / 1_000_000).toFixed(0)}M`;
  if (amount >= 10_000) return `${(amount / 1_000).toFixed(0)}k`;
  if (amount >= 100) return amount.toFixed(0);
  if (amount >= 10) return `${Math.round(amount * 10) / 10}`;
  if (amount >= 1) return `${Math.round(amount * 100) / 100}`;
  if (amount > 0.01) return `${Math.round(amount * 1000) / 10}%`;
  return amount.toLocaleString();
}

function ResourceIconButtonComponent({ itemKey, category, id, amount, icons, iconData, size, title, status, isActive = false, onEditItem }: ResourceIconButtonProps) {
  const info = icons[category as keyof IconInfos]?.[id] as IconInfo | undefined;
  const src = (iconData as Record<string, Record<string, string>>)[category]?.[id];
  const plainBackground =
    category === 'Currency' || info?.ItemCategory === 2 || itemKey === 'Item_23' || (info != null && 'ExpiryChangeParcelTypeStr' in info && info.ExpiryChangeParcelTypeStr === 'Currency');
  const rarityClass = plainBackground ? 'bg-[#eee] dark:bg-transparent' : RARITY_BG_CLASSES[Math.min(Math.max(info?.Rarity ?? 0, 0), 3)];

  return (
    <button
      type="button"
      onClick={() => onEditItem(itemKey)}
      className={`relative rounded p-0.5 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-900/40 ring-1 ring-blue-400 dark:ring-blue-500' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
      title={title}
      aria-label={title}
    >
      <span className={`relative block rounded-md ${rarityClass}`} style={{ width: `${size * 0.25}rem`, height: `${size * 0.25}rem` }}>
        {src ? (
          <img src={src.startsWith('blob:') ? src : `data:image/webp;base64,${src}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-contain" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500">?</span>
        )}
        {amount !== 0 && (
          <span
            className="absolute bottom-0.5 right-0.5 text-black text-xs font-bold leading-none"
            style={{ textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff, 0 1px 0 #fff, 0 -1px 0 #fff' }}
          >
            {amount > 0 ? `×${formatAmount(amount)}` : amount}
          </span>
        )}
      </span>
      {status && <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-white dark:ring-neutral-900 ${status === 'ok' ? 'bg-green-500' : 'bg-red-400'}`} />}
    </button>
  );
}

export const ResourceIconButton = memo(ResourceIconButtonComponent);
