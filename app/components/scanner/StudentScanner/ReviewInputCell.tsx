import { memo } from 'react';
import { CustomNumberInput } from '~/components/CustomInput';

interface Props {
  id?: string;
  value: number | null;
  min: number;
  max: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
  className?: string;
}

// Scanner review intentionally has no table-cell or spreadsheet keyboard-navigation
// coupling. Unlike the previous table version, a missing OCR value remains editable.
function ReviewInputCellComponent({ id, value, min, max, disabled, onCommit, className }: Props) {
  return (
    <CustomNumberInput
      value={value}
      id={id}
      min={min}
      max={max}
      disabled={disabled}
      placeholder="—"
      className={className}
      onChange={(nextValue) => {
        if (nextValue !== null) onCommit(nextValue);
      }}
    />
  );
}

export const ReviewInputCell = memo(ReviewInputCellComponent);
