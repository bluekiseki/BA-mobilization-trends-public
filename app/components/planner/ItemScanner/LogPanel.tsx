import { useEffect, useRef } from 'react';
import { FaChevronDown, FaChevronUp, FaTerminal } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import type { LogEntry } from '~/scanner/types';

interface Props {
  entries: LogEntry[];
  visible: boolean;
  onToggle: () => void;
  startTime: number;
}

export function LogPanel({ entries, visible, onToggle, startTime }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, visible]);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 mb-3">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-2.5 py-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200">
        <span className="flex items-center gap-2">
          <FaTerminal className="text-xs" />
          {t('logLabel')}
          {entries.length > 0 && <span className="bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 text-xs">{entries.length}</span>}
        </span>
        {visible ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
      </button>

      {visible && (
        <div ref={scrollRef} className="max-h-40 overflow-y-auto border-t border-neutral-200 dark:border-neutral-700 p-2 font-mono text-xs">
          {entries.length === 0 ? (
            <div className="text-neutral-500 dark:text-neutral-600">{t('noLogEntries')}</div>
          ) : (
            entries.map((e, i) => (
              <div key={i} className={e.level === 'error' ? 'text-red-500 dark:text-red-400' : e.level === 'warn' ? 'text-amber-500 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400'}>
                <span className="text-neutral-400 dark:text-neutral-600 mr-2">+{((e.time - startTime) / 1000).toFixed(1)}s</span>
                {e.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
