import { useTranslation } from 'react-i18next';

interface MultifloorFloorInputProps {
  value: number;
  max: number;
  onChange: (floor: number) => void;
}

/** Floor the user expects to reach in every multifloor season; per-season overrides live in the income tab. */
export function MultifloorFloorInput({ value, max, onChange }: MultifloorFloorInputProps) {
  const { t } = useTranslation('resources');
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
      <span>{t('income.defaultMaxFloor')}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value || ''}
        placeholder="0"
        onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
        className="w-16 px-2 py-1 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400"
      />
    </label>
  );
}
