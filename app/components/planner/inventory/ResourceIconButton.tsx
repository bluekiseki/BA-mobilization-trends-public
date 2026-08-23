// app/components/planner/inventory/ResourceIconButton.tsx
import { useEffect, useState } from 'react';
import { ItemIcon } from '~/components/planner/common/Icon';
import { getItemName } from '~/components/planner/common/locale';
import type { EventData, IconData } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';

// `size` on ItemIcon uses the same "N × 0.25rem" scale as Tailwind's spacing scale (so size={10}
// is the same 2.5rem/40px as `w-10`). Mobile 10 / desktop 12, switching at Tailwind's `sm` (640px).
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
  category: string;
  id: string;
  amount: number;
  eventData: EventData;
  iconData: IconData;
  locale: Locale;
  status: ResourceStatus;
  helperText?: string;
  isActive?: boolean;
  onClick: () => void;
}

// Single shared way to render a clickable resource icon (used for every resource type, including
// per-student eleph — the label always comes from icon_info via getItemName, never special-cased).
export function ResourceIconButton({ category, id, amount, eventData, iconData, locale, status, helperText, isActive = false, onClick }: ResourceIconButtonProps) {
  const label = getItemName(`${category}_${id}`, eventData.icons, locale);
  const title = helperText ? `${label} — ${helperText}` : label;
  const size = useResourceIconSize();

  return (
    <button
      onClick={onClick}
      className={`relative rounded p-0.5 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-900/40 ring-1 ring-blue-400 dark:ring-blue-500' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
      title={title}
    >
      <ItemIcon type={category} itemId={id} amount={amount} size={size} eventData={eventData} iconData={iconData} />
      {status && <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-white dark:ring-neutral-900 ${status === 'ok' ? 'bg-green-500' : 'bg-red-400'}`} />}
    </button>
  );
}
