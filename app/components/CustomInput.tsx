import { useState, useEffect } from 'react';
interface CustomNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'type'> {
  value: number | null;
  onChange: (newValue: number | null) => void;
  min?: number;
  max?: number;
}

export const CustomNumberInput: React.FC<CustomNumberInputProps> = ({ value, onChange, min = 0, max = Infinity, placeholder = '', disabled = false, ...rest }) => {
  const [displayValue, setDisplayValue] = useState<string>(value !== null ? String(value) : '');
  const [state, setState] = useState<'standby' | 'enable'>('enable');

  // console.log('value', value)
  useEffect(() => {
    if (state == 'enable') setDisplayValue(value !== null ? String(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;

    if (inputValue === '') {
      setDisplayValue('');
      setState('standby');
      onChange(null);
      return;
    }

    if (!/^-?\d*$/.test(inputValue)) {
      return;
    }

    let num = parseInt(inputValue, 10);

    if (isNaN(num)) {
      setDisplayValue(inputValue);
      return;
    }

    setState('enable');
    if (num) {
      num = Math.max(min, Math.min(max === Infinity ? num : max, num));
      onChange(num);
    }
    setDisplayValue(String(num));
  };

  const handleBlur = () => {
    const value = Number(displayValue);
    console.log('handleBlur', { value, displayValue });
    if (value === null || isNaN(value)) {
      return;
    }
    const clampedValue = Math.max(min, Math.min(max === Infinity ? value : max, value));

    onChange(clampedValue);
    setDisplayValue(String(clampedValue));
    setState('enable');
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
      handleBlur();
    }
  };

  return (
    <input
      type="number"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyUp={handleKeyUp}
      min={min}
      max={max === Infinity ? undefined : max}
      placeholder={placeholder}
      disabled={disabled}
      {...rest}
      style={{
        MozAppearance: 'textfield', // Remove Firefox Spinner
        appearance: 'textfield', // Remove common spinners
      }}
    />
  );
};
