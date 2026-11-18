import React, { useState, useEffect } from 'react';

interface CustomNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'type' | 'onBlur'> {
  value: number | null;
  onChange: (newValue: number | null) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  min?: number;
  max?: number;
  // Disable ArrowUp/ArrowDown increment/decrement, e.g. when the parent already uses arrow keys for cell navigation.
  disableArrowStep?: boolean;
}

// Clamp helper reused by blur commit and arrow-key stepping.
const clamp = (num: number, min: number, max: number): number => Math.max(min, Math.min(max === Infinity ? num : max, num));

export const CustomNumberInput: React.FC<CustomNumberInputProps> = ({
  value,
  onChange,
  onBlur,
  min = 0,
  max = Infinity,
  placeholder = '',
  disabled = false,
  className = '',
  disableArrowStep = false,
  ...rest
}) => {
  // Extract onKeyDown so it composes with arrow-step instead of being silently overridden by the rest spread.
  const { onKeyDown: externalOnKeyDown, ...restProps } = rest;
  const [displayValue, setDisplayValue] = useState<string>(value !== null ? String(value) : '');

  // Synchronize when external value changes
  useEffect(() => {
    // Keep an emptied field empty when the parent coerces null to 0, otherwise Backspace on the last digit snaps back to "0".
    setDisplayValue((current) => (current === '' && (value === null || value === 0) ? current : value !== null ? String(value) : ''));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value.replace(/,/g, '');

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
      const clampedValue = clamp(num, min, max);
      setDisplayValue(String(clampedValue));
      onChange(clampedValue); // Update with clamped value
    }

    // Forward onBlur so the parent can commit the value.
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!disableArrowStep && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const delta = e.key === 'ArrowUp' ? 1 : -1;
      const next = clamp((value ?? 0) + delta, min, max);
      setDisplayValue(String(next));
      onChange(next);
    }
    externalOnKeyDown?.(e);
  };

  return (
    <input
      type="text"
      pattern="[0-9]*"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleInternalBlur} // Connect internal handlers
      onFocus={handleFocus}
      onKeyUp={handleKeyUp}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      placeholder={placeholder}
      className={`
        outline-none bg-transparent text-center font-mono font-bold p-0 m-0
        ${className}
      `}
      {...restProps}
      style={{
        MozAppearance: 'textfield',
        appearance: 'textfield',
        ...restProps.style,
      }}
    />
  );
};
