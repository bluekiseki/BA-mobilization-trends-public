import { useState } from 'react';
import { FaDesktop, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

export function DesktopNotice() {
  const { t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="lg:hidden flex items-center gap-2 border-l-2 border-amber-500/70 dark:border-amber-600/70 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-200 mb-3">
      <FaDesktop className="shrink-0" />
      <span className="flex-1">{t('desktopNotice')}</span>
      <button onClick={() => setDismissed(true)} className="shrink-0 opacity-60 hover:opacity-100">
        <FaTimes />
      </button>
    </div>
  );
}
