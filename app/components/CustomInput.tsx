import React, { useState, useEffect } from 'react';

interface CustomNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'type' | 'onBlur'> {
  value: number | null;
  onChange: (newValue: number | null) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  min?: number;
  max?: number;
}

export const CustomNumberInput: React.FC<CustomNumberInputProps> = ({ value, onChange, onBlur, min = 0, max = Infinity, placeholder = '', disabled = false, className = '', ...rest }) => {
  const [displayValue, setDisplayValue] = useState<string>(value !== null ? String(value) : '');

  // Synchronize when external value changes
  useEffect(() => {
    if (value !== null) {
      setDisplayValue(String(value));
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;

    if (inputValue === '') {
      setDisplayValue('');
      onChange(null);
      return;
    }

    if (!/^-?\d*$/.test(inputValue)) {
      return;
    }

    const num = parseInt(inputValue, 10);

    if (isNaN(num)) {
      setDisplayValue(inputValue);
      return;
    }

    setDisplayValue(inputValue);
    onChange(num);
  };

  const handleInternalBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const num = parseInt(displayValue, 10);

    // Revert if not a number
    if (isNaN(num)) {
      if (value !== null) setDisplayValue(String(value));
      else setDisplayValue('');
    } else {
      // Range clamping (performed on final confirmation)
      const clampedValue = Math.max(min, Math.min(max === Infinity ? num : max, num));
      setDisplayValue(String(clampedValue));
      onChange(clampedValue); // Update with clamped value
    }

    // Important: Execute external onBlur if provided (triggers commit in RenderRow)
    if (onBlur) {
      onBlur(e);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select(); // Select all
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['Enter'].includes(e.key)) {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="number"
      pattern="[0-9]*"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleInternalBlur} // Connect internal handlers
      onFocus={handleFocus}
      onKeyUp={handleKeyUp}
      disabled={disabled}
      placeholder={placeholder}
      className={`
        outline-none bg-transparent text-center font-mono font-bold p-0 m-0
        ${className}
      `}
      {...rest}
      style={{
        MozAppearance: 'textfield',
        appearance: 'textfield',
        ...rest.style,
      }}
    />
  );
};
