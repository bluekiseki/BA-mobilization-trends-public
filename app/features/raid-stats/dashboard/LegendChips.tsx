export interface LegendChipItem {
  key: string;
  label: string;
  color: string;
  // Optional number shown next to the label (e.g. player count).
  count?: number;
  active?: boolean;
  onClick?: () => void;
}

// Shared color-swatch legend row for histograms. Chips are plain when `onClick` is
// omitted, or become toggle buttons (dimmed when `active` is false) when provided.
export default function LegendChips({ items }: { items: LegendChipItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {items.map((item) => {
        const isActive = item.active ?? true;
        const className = `p-1 px-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs flex items-center gap-2 ${item.onClick ? 'cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700' : ''} ${isActive ? '' : 'opacity-40'}`;
        const content = (
          <>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <span className="font-semibold">{item.label}</span>
            {item.count !== undefined && <span className="tabular-nums text-neutral-500 dark:text-neutral-400">{item.count.toLocaleString()}</span>}
          </>
        );

        return item.onClick ? (
          <button key={item.key} type="button" onClick={item.onClick} className={className}>
            {content}
          </button>
        ) : (
          <div key={item.key} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
