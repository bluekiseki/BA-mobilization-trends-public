// app/components/planner/StudentGrowth/PlannerJsonExchange.tsx

import { useRef, type ChangeEvent } from 'react';
import { FaFileImport, FaFileExport } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { exportPlannerData, importPlannerData } from '~/components/planner/ExportImportPanel';

export const PlannerJsonExchange = () => {
  const { t } = useTranslation(['planner']);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleJsonImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmMsg = t('confirmImport', 'Are you sure you want to erase all existing data and import the data?');
    if (!window.confirm(confirmMsg)) {
      e.target.value = '';
      return;
    }

    try {
      await importPlannerData(file);
      window.location.reload();
    } catch (error) {
      console.error('JSON Import Failed', error);
      alert(t('error.errorFileFormatOrParsingFailed', 'Invalid file format or parsing failed.'));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Export Button (Green Hover) */}
      <button
        onClick={exportPlannerData}
        title={t('ui.exportCsv', 'Export')}
        className="flex items-center justify-center p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 dark:text-gray-400 dark:hover:text-green-400 dark:hover:bg-green-900/20 rounded-md transition-all border border-transparent hover:border-green-200 dark:hover:border-green-800/50"
      >
        <FaFileExport size={14} />
        <span className="ml-1.5 text-[11px] font-medium hidden sm:inline">{t('ui.exportCsv', 'Export')}</span>
      </button>

      {/* Vertical Divider */}
      <div className="w-px h-3 bg-gray-200 dark:bg-neutral-700 mx-0.5" />

      {/* Import Button (Amber Hover) */}
      <label
        title={t('ui.importCsv', 'Import')}
        className="flex items-center justify-center p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:text-gray-400 dark:hover:text-amber-400 dark:hover:bg-amber-900/20 rounded-md transition-all border border-transparent hover:border-amber-200 dark:hover:border-amber-800/50 cursor-pointer"
      >
        <FaFileImport size={14} />
        <span className="ml-1.5 text-[11px] font-medium hidden sm:inline">{t('ui.importCsv', 'Import')}</span>
        {}
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleJsonImport} className="hidden" />
      </label>
    </div>
  );
};
