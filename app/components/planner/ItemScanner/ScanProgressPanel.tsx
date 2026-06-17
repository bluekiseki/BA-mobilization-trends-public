interface Props {
  step: string;
  percent: number;
}

export function ScanProgressPanel({ step, percent }: Props) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-2.5 sm:p-4 mb-3">
      <div className="flex justify-between text-sm text-neutral-700 dark:text-neutral-300 mb-2">
        <span>{step}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            backgroundColor: 'var(--color-ba-btn-blue)',
          }}
        />
      </div>
    </div>
  );
}
