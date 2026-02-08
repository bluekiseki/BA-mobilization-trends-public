import { useRef } from 'react';
import { CustomNumberInput } from '~/components/CustomInput';

// interface NumberInputProps {
interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max' | 'type'> {
  value: number;
  onChange: (newValue: number) => void;
  min: number;
  max: number;
  narrowButtonType?: 'max' | 'plus';
  disabled?: boolean;
}

const useLongPress = (onShortPress: () => void, onLongPress: () => void, disabled: boolean = false, delay: number = 600) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressTriggered = useRef(false);

  const start = (e: React.SyntheticEvent) => {
    if (disabled) return;
    // e.preventDefault();

    isLongPressTriggered.current = false;
    timeoutRef.current = setTimeout(() => {
      onLongPress();
      isLongPressTriggered.current = true;
    }, delay);
  };

  const end = (e: React.SyntheticEvent) => {
    if (disabled) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      if (!isLongPressTriggered.current) {
        // onShortPress();
      }
    }
  };

  const cancel = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  return {
    onMouseDown: start,
    onMouseUp: end,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: end,
  };
};

export const NumberInput = ({ value, onChange, min, max, disabled, narrowButtonType = 'max', ...rest }: NumberInputProps) => {
  const handleDecrement = () => {
    if (disabled) return;
    onChange(Math.max(min, value - 1));
  };

  const handleIncrement = () => {
    // console.log('handleIncrement', e)
    if (disabled) return;
    const nextValue = value + 1;
    onChange(nextValue > max ? max : nextValue);
  };

  const handleChange = (value: number | null) => {
    if (disabled) return;
    const num = value;
    // Treat as min value if the input is empty or not a number
    if (num == null || isNaN(num)) {
      onChange(min);
    } else {
      // Calibrate values within min and max ranges
      onChange(Math.max(min, Math.min(max, num)));
    }
  };

  const handleSetMin = () => {
    if (disabled) return;
    onChange(min);
  };

  const handleSetMax = () => {
    if (disabled || max === Infinity) return; // Disable if max is infinite
    onChange(max);
  };

  const minusButtonEvents = useLongPress(handleDecrement, handleSetMin, disabled || value <= min);
  const plusButtonEvents = useLongPress(handleIncrement, handleSetMax, disabled || value >= max);

  const hiding_in_narrow_width_class = 'hidden sm:block';

  return (
    <div className="flex items-center w-full h-6 border border-gray-400 dark:border-neutral-600 bg-white dark:bg-neutral-700/50">
      {/* Min btn */}
      <button
        onClick={handleSetMin}
        disabled={disabled || value === min}
        className={
          (narrowButtonType == 'plus' ? hiding_in_narrow_width_class : '') +
          ' w-8 h-full bg-gray-200 dark:bg-neutral-700 text-xs font-bold disabled:opacity-5 hover:bg-gray-300 dark:hover:bg-neutral-600 transition-colors'
        }
      >
        0
      </button>

      <button
        {...minusButtonEvents}
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        className={
          (narrowButtonType == 'max' ? hiding_in_narrow_width_class : '') +
          '  w-6 h-full bg-gray-300 dark:bg-neutral-600 text-sm font-bold disabled:opacity-5 border-r border-gray-400 dark:border-neutral-500 hover:bg-gray-400 dark:hover:bg-neutral-500'
        }
      >
        -
      </button>

      <CustomNumberInput
        // type="number"
        value={value}
        onChange={handleChange}
        min={min}
        max={max === Infinity ? undefined : max}
        disabled={disabled}
        className="w-full h-full text-center text-xs font-semibold focus:outline-none dark:text-gray-200"
        style={{ appearance: 'textfield' }}
        {...rest}
      />

      <button
        {...plusButtonEvents}
        onClick={handleIncrement}
        disabled={disabled || value >= max}
        className={
          (narrowButtonType == 'max' ? hiding_in_narrow_width_class : '') +
          ' w-6 h-full bg-gray-300 dark:bg-neutral-600 text-sm font-bold disabled:opacity-5 border-l border-gray-400 dark:border-neutral-500 hover:bg-gray-400 dark:hover:bg-neutral-500'
        }
      >
        +
      </button>

      {/* Max btn */}
      <button
        onClick={handleSetMax}
        disabled={disabled || value === max || max === Infinity}
        className={
          (narrowButtonType == 'plus' ? hiding_in_narrow_width_class : '') +
          'w-8 h-full bg-gray-200 dark:bg-neutral-700 text-xs font-bold disabled:opacity-5 hover:bg-gray-300 dark:hover:bg-neutral-600 transition-colors'
        }
      >
        M
      </button>
    </div>
  );
};
