import { useState } from 'react';
import { FaChevronLeft, FaChevronRight, FaImage } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import type { ImageScanResult } from '~/scanner/types';

interface Props {
  imageScanResults: ImageScanResult[];
}

export function UploadedImageViewer({ imageScanResults }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const [selected, setSelected] = useState(0);

  if (imageScanResults.length === 0) return null;

  const current = imageScanResults[Math.min(selected, imageScanResults.length - 1)];

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900 mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
        <span className="flex items-center gap-2 text-sm text-neutral-400">
          <FaImage className="text-xs" />
          {t('uploadedImages')}
          <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-xs">{imageScanResults.length}</span>
        </span>
        {imageScanResults.length > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setSelected((i) => Math.max(0, i - 1))} disabled={selected === 0} className="p-1.5 rounded text-neutral-400 hover:text-neutral-200 disabled:opacity-30">
              <FaChevronLeft className="text-xs" />
            </button>
            <span className="text-xs text-neutral-500 w-16 text-center">
              {selected + 1} / {imageScanResults.length}
            </span>
            <button
              onClick={() => setSelected((i) => Math.min(imageScanResults.length - 1, i + 1))}
              disabled={selected === imageScanResults.length - 1}
              className="p-1.5 rounded text-neutral-400 hover:text-neutral-200 disabled:opacity-30"
            >
              <FaChevronRight className="text-xs" />
            </button>
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {imageScanResults.length > 1 && (
        <div className="flex gap-1.5 p-2 border-b border-neutral-700 overflow-x-auto">
          {imageScanResults.map((r, i) => (
            <button
              key={r.fileName}
              onClick={() => setSelected(i)}
              className={['shrink-0 rounded border-2 overflow-hidden transition-colors', i === selected ? 'border-sky-400' : 'border-neutral-700 hover:border-neutral-500'].join(' ')}
            >
              <img src={r.objectUrl} alt={r.fileName} className="h-12 w-auto object-contain" />
            </button>
          ))}
        </div>
      )}

      {/* Main image */}
      <div className="p-3">
        <p className="text-xs text-neutral-500 font-mono mb-2 truncate">{current.fileName}</p>
        <img src={current.objectUrl} alt={current.fileName} className="w-full rounded object-contain max-h-80" />
        <p className="text-xs text-neutral-600 mt-1">{t('itemsRecognized', { count: current.results.filter((r) => r.icon).length, total: current.results.length })}</p>
      </div>
    </div>
  );
}
