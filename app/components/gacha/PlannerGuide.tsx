// app/components/gacha/PlannerGuide.tsx
import { useTranslation } from 'react-i18next';
import { FaExclamationTriangle, FaChevronDown, FaChevronUp } from 'react-icons/fa';

export const GUIDE_STORAGE_KEY = 'gacha_guide_hidden';

const monoStyle = { fontFamily: 'ui-monospace, monospace' };

const NOTE_KEYS = ['note2', 'note3', 'note4', 'note5', 'note6', 'note7', 'note8', 'note9'] as const;

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export default function PlannerGuide({ collapsed, onToggle }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.intro' });

  const steps = [
    { title: t('feat1_title'), desc: t('feat1_desc') },
    { title: t('feat2_title'), desc: t('feat2_desc') },
    { title: t('feat3_title'), desc: t('feat3_desc') },
    { title: t('feat4_title'), desc: t('feat4_desc') },
  ];

  if (collapsed) {
    return (
      <div className="mb-5 flex justify-start">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 border border-neutral-200 dark:border-neutral-700 rounded-md px-2.5 py-1 transition-colors"
          style={monoStyle}
        >
          <FaChevronDown size={9} />
          {t('title')}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 px-4 py-3 mb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-400 dark:text-neutral-500" style={monoStyle}>
          {t('title')}
        </span>
        <button type="button" onClick={onToggle} className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors">
          <FaChevronUp size={9} />
          {t('hideGuide')}
        </button>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {steps.map((step, i) => (
          <div key={i}>
            <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-0.5">
              {i + 1}. {step.title}
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">{step.desc}</div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
        <div className="flex items-center gap-1.5 mb-2 text-amber-600 dark:text-amber-400">
          <FaExclamationTriangle size={11} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={monoStyle}>
            {t('notes.title')}
          </span>
        </div>
        <ul className="space-y-1">
          <li className="flex gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
            <span className="text-neutral-300 dark:text-neutral-600 shrink-0 mt-0.5">·</span>
            <span>
              {t('notes.note1_pre')}
              <a
                href="https://docs.google.com/spreadsheets/d/1_Zjt_OM9XXidY3uYYDK92W9GrR3DN5cQsZ0IJsoEbjY"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Google Spreadsheet
              </a>
              {t('notes.note1_post')}
            </span>
          </li>
          {NOTE_KEYS.map((key) => (
            <li key={key} className="flex gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              <span className="text-neutral-300 dark:text-neutral-600 shrink-0 mt-0.5">·</span>
              {t(`notes.${key}`)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
