import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
}

export function StatCard({ label, value, sub, accent, warn }: StatCardProps) {
  return (
    <div className="bg-neutral-50 dark:bg-neutral-800/60 rounded-md p-2.5 border border-neutral-200 dark:border-neutral-700">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">{label}</div>
      <div
        className={`font-mono text-xl font-bold leading-none ${accent ? 'text-blue-600 dark:text-blue-400' : warn ? 'text-amber-500 dark:text-amber-400' : 'text-neutral-800 dark:text-neutral-100'}`}
      >
        {value}
      </div>
      {sub && <div className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500 mt-1">{sub}</div>}
    </div>
  );
}

export function MultiplierSeg({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex border border-neutral-200 dark:border-neutral-700 rounded overflow-hidden text-[11px]">
      {[1, 2, 3].map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 py-1 transition-colors font-semibold ${
            value === v ? 'bg-blue-500 text-white' : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700'
          }`}
        >
          {v}×
        </button>
      ))}
    </div>
  );
}

export function PaneHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 h-8 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{children}</span>
    </div>
  );
}
