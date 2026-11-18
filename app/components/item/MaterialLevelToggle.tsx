import { useTranslation } from 'react-i18next';

export type MaterialDetailLevel = 'total' | 'split' | 'detail';

// Total, table and details are generic terms shared across the site; only "split" is specific to this table.
const LEVEL_LABEL_KEYS: Record<MaterialDetailLevel, string> = { total: 'ui:total', split: 'planner:materialTable.level.split', detail: 'ui:details' };

export const MATERIAL_DETAIL_LEVELS: readonly MaterialDetailLevel[] = ['total', 'split', 'detail'];

interface MaterialLevelToggleProps {
  value: MaterialDetailLevel;
  onChange: (level: MaterialDetailLevel) => void;
  className?: string;
  buttonClassName?: string;
}

/** Segmented control for how much of the obtainable amount a material table shows. */
export const MaterialLevelToggle = ({ value, onChange, className = '', buttonClassName = 'px-2 py-1' }: MaterialLevelToggleProps) => {
  const { t } = useTranslation(['planner', 'ui']);
  const tStr = t as (key: string) => string;
  return (
    <div className={`flex shrink-0 text-xs rounded border border-neutral-400 dark:border-neutral-600 overflow-hidden ${className}`}>
      {MATERIAL_DETAIL_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          aria-pressed={value === level}
          onClick={() => onChange(level)}
          className={`${buttonClassName} transition-colors ${
            value === level ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100' : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          {tStr(LEVEL_LABEL_KEYS[level])}
        </button>
      ))}
    </div>
  );
};
