import { useState } from 'react';
import { MdImportExport } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import { ExportImportPanel } from '~/components/planner/ExportImportPanel';

export const PlannerJsonExchange = () => {
  const { t } = useTranslation('planner');
  const { t: t_ui } = useTranslation('ui');
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={t('dataExchange.title')}
        className="flex items-center justify-center p-2 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-neutral-400 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/20 rounded-md transition-all border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800/50"
      >
        <MdImportExport size={14} />
        <span className="ml-1.5 text-[11px] font-medium">{t('dataExchange.title')}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 " onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg relative border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setOpen(false)}
              aria-label={t_ui('close')}
              className="absolute top-3.5 right-4 z-10 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 text-base leading-none"
            >
              ✕
            </button>
            <ExportImportPanel />
          </div>
        </div>
      )}
    </>
  );
};
