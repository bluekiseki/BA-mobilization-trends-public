import type { SummaryPoolStat } from '~/features/inventory/types';
import { useTranslation } from 'react-i18next';
import { FaInfoCircle } from 'react-icons/fa';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import type { IconData } from '~/types/plannerData';

interface GoalSummaryRowProps {
  pools: SummaryPoolStat[];
  iconData: IconData;
}

/** XP coverage for fungible material pools, shown while comparing inventory against goals. */
export const GoalSummaryRow = ({ pools, iconData }: GoalSummaryRowProps) => {
  const { t } = useTranslation(['planner', 'game']);
  const tStr = t as (k: string) => string;
  const visible = pools.filter((p) => p.requiredXp > 0);
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-200 dark:border-neutral-700 pt-2 text-xs">
      {visible.map((p) => {
        const covered = p.ownedXp >= p.requiredXp;
        const [iconType, iconItemId] = p.iconKey.split('_');
        const rawIcon = iconData[iconType]?.[iconItemId];
        const iconSrc = rawIcon ? (rawIcon.startsWith('blob:') ? rawIcon : `data:image/webp;base64,${rawIcon}`) : undefined;
        return (
          <div key={p.labelKey} className="flex items-center gap-1.5">
            {iconSrc && <img src={iconSrc} alt="" className="w-4 h-4 inline-block align-text-bottom object-cover" />}
            <span className="text-neutral-500 dark:text-neutral-400">{tStr(p.labelKey)}</span>
            {p.tooltipKey && (
              <Tooltip placement="top" trigger={['hover', 'click']} overlay={<span className="block max-w-xs text-[11px] leading-relaxed">{tStr(p.tooltipKey)}</span>}>
                <span className="cursor-pointer text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 inline-flex items-center">
                  <FaInfoCircle size={11} />
                </span>
              </Tooltip>
            )}
            <span className={`tabular-nums font-medium ${covered ? 'text-green-500' : 'text-red-400'}`}>
              {Math.floor(Math.min(p.ownedXp, p.requiredXp)).toLocaleString()} / {Math.ceil(Math.max(p.ownedXp, p.requiredXp)).toLocaleString()} XP
            </span>
          </div>
        );
      })}
    </div>
  );
};
