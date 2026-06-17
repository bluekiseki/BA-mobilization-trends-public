import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  eyebrow?: string;
  badge?: string;
  className?: string;
}

export function PageHeader({ title, description, icon, eyebrow, badge, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex gap-3 p-2 items-start mb-6 ${className}`}>
      {icon && <div className="text-2xl text-neutral-400 shrink-0 mt-0.5">{icon}</div>}
      <div className="flex-1 min-w-0">
        {eyebrow && <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-0.5">{eyebrow}</p>}
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-100 leading-tight">{title}</h1>
          {badge && <span className="rounded border border-amber-500/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">{badge}</span>}
        </div>
        {description && <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 break-keep">{description}</p>}
      </div>
    </div>
  );
}
