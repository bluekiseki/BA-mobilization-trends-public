import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LuSlidersHorizontal } from 'react-icons/lu';
import { CheckboxSelect } from '~/components/common/CheckboxSelect';
import { Y_SCALES } from './yScale';
import type { YScale } from './yScale';
import type { XLabelKind } from './xLabel';

interface ChartOptionsProps {
  yScale: YScale;
  onYScaleChange: (value: YScale) => void;
  /** Omit for charts whose X axis has no score/time choice. */
  xLabels?: ReadonlySet<XLabelKind>;
  onXLabelsChange?: (value: Set<XLabelKind>) => void;
}

export default function ChartOptions({ yScale, onYScaleChange, xLabels, onXLabelsChange }: ChartOptionsProps) {
  const { t } = useTranslation('dashboard');
  const { t: t_ui } = useTranslation('ui');
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const fieldClass = 'h-7 w-full rounded bg-neutral-200 px-2 text-xs dark:bg-neutral-600';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label={t('chartOptions')}
        title={t('chartOptions')}
        className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
      >
        <LuSlidersHorizontal size={16} />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 space-y-3 rounded-md border border-neutral-300 bg-white p-3 dark:border-neutral-600 dark:bg-neutral-700">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold">{t('yAxisScale')}</span>
            <select value={yScale} onChange={(e) => onYScaleChange(e.target.value as YScale)} className={fieldClass}>
              {Y_SCALES.map((scale) => (
                <option key={scale.key} value={scale.key}>
                  {scale.key === 'linear' ? t('scaleLinear') : scale.key === 'cdf' ? t('scaleCumulative') : scale.label}
                </option>
              ))}
            </select>
          </label>
          {/* Last, so its dropdown menu opens over empty space instead of covering another field. */}
          {xLabels && onXLabelsChange && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold">{t('xAxisLabel')}</span>
              <CheckboxSelect<XLabelKind>
                ariaLabel={t('xAxisLabel')}
                options={[
                  { value: 'score', label: t('byScore') },
                  { value: 'time', label: t_ui('time') },
                ]}
                selectedValues={xLabels}
                // At least one label kind must stay on, otherwise the axis would be blank.
                onChange={(next) => next.size > 0 && onXLabelsChange(next)}
                buttonClassName="flex h-7 w-full items-center justify-between gap-2 rounded bg-neutral-200 px-2 text-xs dark:bg-neutral-600"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
