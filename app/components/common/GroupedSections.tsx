// app/components/common/GroupedSections.tsx
import type { ReactNode } from 'react';

export interface GroupSection {
  key: string;
  header: ReactNode;
  content: ReactNode;
}

interface GroupedSectionsProps {
  sections: GroupSection[];
  emptyMessage?: string;
}

// Generic vertical group layout: each section is a header row + content, separated by a top border. Domain-agnostic — callers supply the nodes.
export function GroupedSections({ sections, emptyMessage }: GroupedSectionsProps) {
  if (sections.length === 0) {
    return emptyMessage ? <p className="text-sm text-neutral-400 dark:text-neutral-500 text-center py-10">{emptyMessage}</p> : null;
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map((section, i) => (
        <div key={section.key} className={i > 0 ? 'pt-3 border-t border-neutral-200 dark:border-neutral-700' : ''}>
          <div className="flex items-center gap-2 mb-2">{section.header}</div>
          {section.content}
        </div>
      ))}
    </div>
  );
}
