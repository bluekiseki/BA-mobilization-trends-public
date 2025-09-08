import React from 'react';

type ToggleOption<T> = {
  value: T;
  label: string;
};

type ToggleButtonGroupProps<T> = {
  label?: string;
  options: ToggleOption<T>[];
  selectedValue: T;
  onSelect: (value: T) => void;
};

export const ToggleButtonGroup = <T,>({
  label,
  options,
  selectedValue,
  onSelect,
}: ToggleButtonGroupProps<T>) => {
  return (
    <div className={"flex justify-between items-center" + (label ? ' w-full' : '')}>
      {
        label ? <label className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</label> : <></>
      }
      <div className="flex items-center rounded-md border border-gray-300 dark:border-gray-600 p-0.5 transition-colors duration-200">
        {options.map((option) => (
          <button
            key={`${option.value}`}
            onClick={() => onSelect(option.value)}
            disabled={selectedValue === option.value}
            className={`px-3 py-1 text-xs font-semibold rounded-[5px] transition-colors duration-200
              ${selectedValue === option.value
                ? 'bg-bluearchive-botton-blue text-black shadow-sm cursor-not-allowed dark:bg-sky-600 dark:text-white'
                : 'bg-transparent text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};
