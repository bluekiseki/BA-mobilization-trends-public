import { FaDownload, FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

const FILES = [
  { name: 'cell_detect.onnx', size: '9.3 MB' },
  { name: 'embed_model.onnx', size: '9.5 MB' },
  { name: 'qty_model.onnx', size: '2.3 MB' },
  { name: 'embeddings.json', size: '4.5 MB' },
  { name: 'icon_info.json + icon_img.json', size: '5.7 MB' },
];

export function ConsentModal({ onConfirm, onCancel }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'itemScanner' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 sm:p-6 shadow-xl">
        <button onClick={onCancel} className="absolute right-4 top-4 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200">
          <FaTimes />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <FaExclamationTriangle className="text-amber-500 dark:text-amber-400 text-xl shrink-0" />
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{t('consentTitle')}</h2>
        </div>

        <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-4">{t('consentDescription')}</p>

        <ul className="mb-3 border border-neutral-200 dark:border-neutral-700 divide-y divide-neutral-200 dark:divide-neutral-700">
          {FILES.map((f) => (
            <li key={f.name} className="flex justify-between px-3 py-2 text-sm">
              <span className="text-neutral-700 dark:text-neutral-300 font-mono">{f.name}</span>
              <span className="text-neutral-500 dark:text-neutral-400">{f.size}</span>
            </li>
          ))}
          <li className="flex justify-between px-3 py-2 text-sm font-semibold">
            <span className="text-neutral-800 dark:text-neutral-200">{t('consentTotal')}</span>
            <span className="text-neutral-800 dark:text-neutral-200">{t('consentSize')}</span>
          </li>
        </ul>

        <p className="text-xs text-neutral-500 mb-5">{t('consentWarning')}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded border border-neutral-300 dark:border-neutral-600 py-1.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {t('consentCancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 flex items-center justify-center gap-2 rounded py-1.5 text-sm font-semibold text-neutral-900 transition-colors hover:opacity-90"
            style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}
          >
            <FaDownload />
            {t('consentConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
