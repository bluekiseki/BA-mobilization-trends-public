import { useTranslation } from 'react-i18next';
import type { ReportEntry } from './common';

interface DownloadButtonProps {
  data: ReportEntry[];
  filename?: string;
}
const convertToCSV = (data: ReportEntry[]): string => {
  if (!data || data.length === 0) {
    return '';
  }

  // CSV header
  const headers = ['Rank', 'Score'];
  let teamsMax = 1;

  const rows = data.map((entry) => {
    const rank = entry.r;
    const score = entry.s;
    const teams = entry.t.map((team) => `"${JSON.stringify(team).replace(/"/g, '""')}"`);
    teamsMax = Math.max(teamsMax, teams.length);

    return [rank, score, ...teams];
  });

  for (let i = 0; i < teamsMax; i++) headers.push(`Team${i + 1}`);
  rows.forEach((v) => {
    while (v.length != teamsMax + 2) {
      v.push('');
    }
  });

  return [headers.join(','), ...rows.map((v) => v.join(','))].join('\n');
};

export const DownloadButton: React.FC<DownloadButtonProps> = ({ data, filename = 'raid-data.csv' }) => {
  const { t: t_c } = useTranslation('common');

  const handleDownload = () => {
    if (!data || data.length === 0) {
      alert('No Data');
      return;
    }

    const csvString = convertToCSV(data);

    // UTF-8 BOM
    const blob = new Blob(['\uFEFF' + csvString], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Deallocate memory
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(t_c('dataWarning'))) return;
        handleDownload();
      }}
      className="p-1  hover:text-neutral-600 dark:hover:text-neutral-300 rounded-full transition-colors cursor-pointer"
      aria-label="Download data as CSV"
      title="Download data as CSV"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6 h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      <span className="sr-only">Download data as CSV</span>
    </button>
  );
};
