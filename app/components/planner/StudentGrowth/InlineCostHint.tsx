// app/components/planner/StudentGrowth/InlineCostHint.tsx

import type { EventData, IconData } from '~/types/plannerData';
import { ItemIcon } from '../common/Icon';

interface InlineCostHintProps {
  needs: Record<string, number>;
  eventData?: EventData;
  iconData?: IconData;
  size?: number;
}

export const InlineCostHint = ({ needs, eventData, iconData, size = 9 }: InlineCostHintProps) => {
  const entries = Object.entries(needs).filter(([k, v]) => v > 0 && !k.startsWith('_'));
  if (entries.length === 0) return null;
  if (!eventData || !iconData) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {entries.map(([key, amount]) => {
        const sep = key.indexOf('_');
        const type = key.slice(0, sep);
        const itemId = key.slice(sep + 1);
        return <ItemIcon key={key} type={type} itemId={itemId} amount={amount} size={size} eventData={eventData} iconData={iconData} />;
      })}
    </div>
  );
};
