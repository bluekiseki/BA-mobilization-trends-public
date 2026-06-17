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

export const ToggleButtonGroup = <T,>({ label, options, selectedValue, onSelect }: ToggleButtonGroupProps<T>) => {
  return (
    <div className={'flex justify-between items-center' + (label ? ' w-full' : '')}>
      {label ? <label className="text-sm font-medium pr-2 text-neutral-600 dark:text-neutral-400 break-keep wrap-break-word">{label}</label> : <></>}
      <div className="flex items-center rounded-md border border-neutral-300 dark:border-neutral-600 p-0.5 transition-colors duration-200">
        {options.map((option, index) => (
          <button
            key={index}
            onClick={() => onSelect(option.value)}
            disabled={selectedValue === option.value}
            className={`px-3 py-1 text-xs font-semibold rounded-[5px] transition-colors duration-200
              ${
                selectedValue === option.value
                  ? 'bg-ba-btn-blue text-black shadow-sm cursor-not-allowed  ' // dark:bg-sky-600 dark:text-white
                  : 'bg-transparent text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700'
              }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};
