import { useState } from 'react';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import type { ImageScanResult } from '~/scanner/types';
import { resolveIconName } from '~/scanner/iconLoader';

interface Props {
  imageScanResults: ImageScanResult[];
}

export function ScanResultGrid({ imageScanResults }: Props) {
  const { i18n, t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const [open, setOpen] = useState(false);

  const total = imageScanResults.reduce((s, r) => s + r.results.length, 0);
  const recognized = imageScanResults.reduce((s, r) => s + r.results.filter((c) => c.icon).length, 0);

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        <span>
          {t('detectionResults')}
          <span className="ml-2 rounded bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 text-xs">{t('detectionSummary', { recognized, total })}</span>
        </span>
        {open ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
      </button>

      {open && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 p-3 space-y-4">
          {imageScanResults.map((imgResult) => (
            <div key={imgResult.fileName}>
              <p className="text-xs text-neutral-500 mb-2 font-mono">{imgResult.fileName}</p>
              <div className="flex flex-wrap gap-2">
                {imgResult.results.map((r, i) => (
                  <div
                    key={i}
                    className={[
                      'flex flex-col items-center rounded border p-1.5 w-16',
                      r.icon ? 'border-green-400/50 dark:border-green-700/50 bg-green-50 dark:bg-green-950/30' : 'border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800',
                    ].join(' ')}
                    title={r.icon ? `${resolveIconName(r.icon, i18n.language)} (${(r.similarity * 100).toFixed(0)}%)` : `unknown (${(r.similarity * 100).toFixed(0)}%)`}
                  >
                    {r.icon?.dataUrl ? (
                      <img src={r.icon.dataUrl} alt={resolveIconName(r.icon, i18n.language)} className="w-10 h-10 object-contain" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-500 text-xs">?</div>
                    )}
                    <span className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 text-center leading-tight truncate w-full">{r.quantity > 0 ? `×${r.quantity.toLocaleString()}` : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
