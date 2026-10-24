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

/**
 * Thin XP coverage summary — owned / required, as plain numbers — for one or more fungible
 * material pools (activity reports, equipment enhancement stones, unique weapon growth
 * materials). Shown below the inventory filter bar only while goal comparison is on.
 *
 * No separate deficit figure: owned/required already implies it, and repeating it as its own
 * signed number was redundant. Coverage is instead conveyed by coloring the owned/required pair
 * itself (green once covered, red while short).
 *
 * One representative icon per line (not a breakdown): an earlier version broke the deficit down
 * into itemized icons (and, for unique weapons, a second icon group for the firing-pin
 * alternative), but that made a single line read as two separate, unlabeled breakdowns side by
 * side. A single icon next to the label avoids that — it's purely a visual anchor for the label's
 * item type, not new information. Rendered as a plain <img> (not the ItemIcon component) since
 * only the raw icon bitmap is needed here, none of ItemIcon's border/size/fallback chrome.
 *
 * Deliberately a single row, not a card: per CLAUDE.md, no nested container repeats the page's
 * own background/padding.
 */
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
              {Math.floor(p.ownedXp).toLocaleString()} / {Math.ceil(p.requiredXp).toLocaleString()} XP
            </span>
          </div>
        );
      })}
    </div>
  );
};
