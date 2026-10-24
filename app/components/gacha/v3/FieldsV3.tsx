import { useId, type ReactNode } from 'react';
import { CustomNumberInput } from '../../common/CustomInput';

export function NumberFieldV3({
  label,
  unit,
  value,
  onChange,
  min = 0,
  max,
  step,
  onBlur,
  description,
  className = '',
}: {
  label: ReactNode;
  unit: string;
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  onBlur?: () => void;
  description?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`v3-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <div className="v3-number">
        <CustomNumberInput id={id} value={value} min={min} max={max} step={step} onBlur={onBlur} onChange={(next) => onChange(next ?? 0)} className="v3-number-input" />
        <span>{unit}</span>
      </div>
      {description && <p className="text-xs text-neutral-600 dark:text-neutral-400">{description}</p>}
    </div>
  );
}

export function SelectFieldV3({ label, value, onChange, children }: { label: string; value: string | number; onChange: (value: string) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="v3-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </div>
  );
}

export function ToggleV3({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 shrink-0 accent-ba-btn-blue" />
      <span>{label}</span>
    </label>
  );
}
