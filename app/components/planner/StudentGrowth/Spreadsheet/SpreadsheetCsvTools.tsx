import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MdCheckCircle, MdError, MdDownload, MdUpload } from 'react-icons/md';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import { plansToCsv, csvToPlans, downloadCsv, type CsvMetadata, type StudentData } from '~/utils/plannerCsvExchange';

interface Props {
  growthPlans: GrowthPlan[];
  allStudents: StudentData;
  setGrowthPlans: (plans: GrowthPlan[]) => void;
}

export function SpreadsheetCsvTools({ growthPlans, allStudents, setGrowthPlans }: Props) {
  const { t } = useTranslation(['planner', 'game']);
  const { t: t_g } = useTranslation('game');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const notify = (msg: string, error = false) => {
    setMessage(msg);
    setIsError(error);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleExport = () => {
    try {
      const now = new Date();
      const isoDate = now.toISOString().split('T')[0];
      const isoTime = now.toISOString().split('T')[1].substring(0, 8);

      // Prepare translated header labels (must match HEADER_IDS order in plannerCsvExchange.ts)
      const headerLabels = [
        'Student ID',
        t('spreadsheet.headerField.name') || 'Name',
        // Base stats (Current)
        t_g('level') || 'Level',
        t_g('rank') || 'Rank',
        t('spreadsheet.headerField.ueLevel') || 'UE Lv',
        t('game:affection') || 'Bond Lv',
        t('spreadsheet.headerField.experience') || 'Bond exp',
        // Base stats (Target)
        t_g('level') || 'Level',
        t_g('rank') || 'Rank',
        t('spreadsheet.headerField.ueLevel') || 'UE Lv',
        t('game:affection') || 'Bond Lv',
        // Skills (Current)
        t('game:skill.ex') || 'EX',
        t('game:skill.normal') || 'Normal',
        t('game:skill.passive') || 'Passive',
        t('game:skill.sub') || 'Sub',
        // Skills (Target)
        t('game:skill.ex') || 'EX',
        t('game:skill.normal') || 'Normal',
        t('game:skill.passive') || 'Passive',
        t('game:skill.sub') || 'Sub',
        // Equipment (Current)
        t('spreadsheet.headerField.equipment1') || 'Equip. 1',
        t('spreadsheet.headerField.equipment2') || 'Equip. 2',
        t('spreadsheet.headerField.equipment3') || 'Equip. 3',
        t_g('gear') || 'Bond Gear',
        // Equipment (Target)
        t('spreadsheet.headerField.equipment1') || 'Equip. 1',
        t('spreadsheet.headerField.equipment2') || 'Equip. 2',
        t('spreadsheet.headerField.equipment3') || 'Equip. 3',
        t_g('gear') || 'Bond Gear',
        // Others
        t('spreadsheet.headerField.acquiredDate') || 'Acquired Date',
        t('spreadsheet.headerField.useEligma') || 'Use Eligma',
        t('spreadsheet.headerField.eligmaPrice') || 'Eligma Price',
        t('spreadsheet.headerField.eligmaStock') || 'Eligma Stock',
      ];

      // Prepare translated metadata
      const metadata: CsvMetadata = {
        title: t('dataExchange.csvMetadataTitle') || 'BA Planner CSV Export',
        generated: t('dataExchange.csvMetadataGenerated', { date: `${isoDate} ${isoTime}` }) || `Generated: ${isoDate} ${isoTime}`,
        version: t('dataExchange.csvMetadataVersion') || 'Version: 1.0',
        warning: t('dataExchange.csvMetadataWarning') || 'WARNING: Do not delete or modify the first 6 lines (metadata and headers)',
        notes: t('dataExchange.csvMetadataNotes') || 'Notes: First header row contains field IDs (for parsing), second contains display labels (translated)',
      };

      const csv = plansToCsv(growthPlans, allStudents, headerLabels, metadata);
      downloadCsv(csv, `BA_Planner_${isoDate}.csv`);
      notify(t('dataExchange.csvExportSuccess') || 'CSV exported successfully');
    } catch (e) {
      notify(e instanceof Error ? e.message : t('dataExchange.csvExportFailed') || 'CSV export failed', true);
    }
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result;
        if (typeof text !== 'string') throw new Error(t('dataExchange.csvFileReadError') || 'Unable to read file');
        const result = csvToPlans(text, growthPlans, allStudents);
        setGrowthPlans(result.plans);
        const msg = t('dataExchange.csvImportSuccessWithCount', { count: result.updatedCount }) || `CSV imported successfully (${result.updatedCount} students)`;
        notify(msg);
      } catch (e) {
        notify(e instanceof Error ? e.message : t('dataExchange.csvImportFailed') || 'CSV import failed', true);
      }
    };
    reader.onerror = () => notify(t('dataExchange.csvFileReadError') || 'File read error', true);
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
      handleImport(file);
    } else {
      notify(t('error.invalidCsv') || 'The CSV file is invalid.', true);
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('dataExchange.csvTip')}</p>
      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-700 rounded transition-colors"
          title={t('dataExchange.csvExportTooltip') || 'Export spreadsheet as CSV for Excel editing'}
        >
          <MdDownload size={14} />
          {t('dataExchange.csvExport') || 'Export CSV'}
        </button>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex items-center gap-1.5 cursor-pointer text-xs px-2.5 py-1.5 border rounded transition-colors ${
            isDragActive
              ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
              : 'border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
          }`}
          title={t('dataExchange.csvImportTooltip') || 'Import data from CSV file'}
        >
          <label className="flex items-center gap-1.5 cursor-pointer">
            <MdUpload size={14} />
            {t('dataExchange.csvImport') || 'Import CSV'}
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>
        </div>

        {message && (
          <span className={`flex items-center gap-1 text-xs ${isError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
            {isError ? <MdError size={14} /> : <MdCheckCircle size={14} />}
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
