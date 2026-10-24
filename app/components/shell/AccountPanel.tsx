import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LuDownload, LuLogOut, LuRefreshCw, LuSettings } from 'react-icons/lu';
import { useAuthStore } from '~/store/authStore';
import { ConfirmDialog } from '~/components/common/ConfirmDialog';
import { getProfileServerLabel } from '~/utils/profileServer';
import { localeLink } from '~/utils/localeLink';
import { ProfileAvatar } from './ProfileAvatar';
import { SyncStatusLine } from './SyncStatusIndicator';
import { exportProfileData, logoutAccount } from './accountActions';

const actionLink = 'flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors disabled:opacity-50';

interface AccountPanelProps {
  /** Called after navigating away or logging out, so a wrapping menu can close. */
  onNavigate?: () => void;
  /** Reports whether the portaled confirm dialog is open, so a wrapping dropdown can ignore outside clicks meanwhile. */
  onDialogOpenChange?: (open: boolean) => void;
}

/**
 * Shared body for the account menu — used both in the desktop dropdown
 * (AccountMenu) and at the bottom of the mobile hamburger menu.
 */
export function AccountPanel({ onNavigate, onDialogOpenChange }: AccountPanelProps) {
  const { t, i18n } = useTranslation('auth');
  const { t: t_ui } = useTranslation('ui');
  const user = useAuthStore((s) => s.user);
  const activeProfileId = useAuthStore((s) => s.activeProfileId);
  const activeProfile = user?.profiles?.find((p) => p.id === activeProfileId);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    onDialogOpenChange?.(logoutConfirmOpen);
  }, [logoutConfirmOpen, onDialogOpenChange]);

  if (!user || !activeProfile) return null;

  const identity = `${user.username} · ${getProfileServerLabel(activeProfile.server)}`;

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      await exportProfileData(activeProfile.id, activeProfile.name, activeProfile.server);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t('settings.errors.failedToExportProfile'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="flex items-start gap-3 px-4 py-2.5">
        <ProfileAvatar studentId={activeProfile.avatarStudentId} name={activeProfile.name} className="mt-2 h-15 w-15" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900 dark:text-white truncate" title={activeProfile.name}>
            {activeProfile.name}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate" title={identity}>
            {identity}
          </p>
          <div className="mt-1">
            <SyncStatusLine />
          </div>
          <div className="mt-1 flex items-center gap-2.5">
            <Link to={localeLink(i18n.language, '/settings')} onClick={onNavigate} title={t_ui('settings')} aria-label={t_ui('settings')} className={actionLink}>
              <LuSettings size={12} />
            </Link>
            <span className="text-xs leading-none text-neutral-300 dark:text-neutral-600 md:hidden" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting}
              title={t('settings.profiles.exportData')}
              aria-label={t('settings.profiles.exportData')}
              className={actionLink}
            >
              {exporting ? <LuRefreshCw size={12} className="animate-spin" /> : <LuDownload size={12} />}
            </button>
            <span className="text-xs leading-none text-neutral-300 dark:text-neutral-600 md:hidden" aria-hidden="true">
              ·
            </span>
            <button type="button" onClick={() => setLogoutConfirmOpen(true)} className={actionLink}>
              <LuLogOut size={12} />
              <span>{t('settings.dangerZone.logout')}</span>
            </button>
          </div>
        </div>
      </div>

      {exportError && <p className="px-4 pb-2 text-xs text-red-600 dark:text-red-400">{exportError}</p>}

      <ConfirmDialog
        open={logoutConfirmOpen}
        message={t('settings.dangerZone.logoutConfirm')}
        busy={loggingOut}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLoggingOut(true);
          // On success logoutAccount navigates away; it only settles without redirecting when sign-out failed.
          void logoutAccount().finally(() => {
            setLoggingOut(false);
            setLogoutConfirmOpen(false);
          });
        }}
      />
    </div>
  );
}
