interface Props<K extends string> {
  tabs: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}

export function MethodTabs<K extends string>({ tabs, value, onChange }: Props<K>) {
  return (
    <div className="flex border-b border-neutral-200 dark:border-neutral-700">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            value === key
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
