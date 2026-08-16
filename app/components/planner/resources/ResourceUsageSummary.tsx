export interface ResourceUsageRow {
  label: string;
  monthlyAmount: number;
  weeklyLimit?: number;
}

interface Props {
  rows: ResourceUsageRow[];
}

const WEEKS_PER_MONTH = 365 / 12 / 7;

export default function ResourceUsageSummary({ rows }: Props) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-1">
      {rows.map((row) => {
        const weeklyAvg = row.weeklyLimit !== undefined ? Math.round(row.monthlyAmount / WEEKS_PER_MONTH) : null;
        const exceeded = weeklyAvg !== null && row.weeklyLimit !== undefined && weeklyAvg > row.weeklyLimit;
        return (
          <div key={row.label} className="flex items-center gap-2 text-xs">
            <span className="flex-1 text-neutral-500 dark:text-neutral-400">{row.label}</span>
            <span className={`font-mono tabular-nums ${exceeded ? 'text-red-500 dark:text-red-400' : 'text-neutral-700 dark:text-neutral-300'}`}>
              {row.monthlyAmount === 0 ? '—' : `${row.monthlyAmount.toLocaleString()}/mo`}
            </span>
            {row.weeklyLimit !== undefined && row.monthlyAmount > 0 && weeklyAvg !== null && (
              <span className={`font-mono tabular-nums text-[10px] w-40 text-right ${exceeded ? 'text-red-500 dark:text-red-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
                ~{weeklyAvg.toLocaleString()}/wk
                {exceeded ? ` — over ${row.weeklyLimit.toLocaleString()} limit` : ` (limit ${row.weeklyLimit.toLocaleString()})`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
