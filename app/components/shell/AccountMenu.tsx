import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineUserCircle } from 'react-icons/hi2';
import { useAuthStore } from '~/store/authStore';
import { useOutsideClick } from '~/hooks/useOutsideClick';
import { AccountPanel } from './AccountPanel';
import { ProfileAvatar } from './ProfileAvatar';
import { SyncStatusDot } from './SyncStatusIndicator';

/**
 * Desktop-only account trigger: an icon in the nav utility cluster that opens a
 * dropdown with the shared AccountPanel. Mobile uses the hamburger menu instead.
 */
export function AccountMenu() {
  const { t } = useTranslation('auth');
  const user = useAuthStore((s) => s.user);
  const activeProfileId = useAuthStore((s) => s.activeProfileId);
  const activeProfile = user?.profiles?.find((p) => p.id === activeProfileId);
  const [isOpen, setIsOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The confirm dialog is portaled outside `ref`, so clicks on it must not close the dropdown (that would unmount the panel mid-click).
  useOutsideClick(ref, () => {
    if (!dialogOpen) setIsOpen(false);
  });

  const closeMenu = () => {
    setDialogOpen(false);
    setIsOpen(false);
  };

  if (!user) return null;

  const label = t('settings.account.title');

  return (
    <div className="relative flex items-center" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={label}
        title={label}
        className="relative flex items-center text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors"
      >
        {activeProfile ? <ProfileAvatar studentId={activeProfile.avatarStudentId} name={activeProfile.name} className="w-9 h-9" /> : <HiOutlineUserCircle className="text-xl" strokeWidth={1.5} />}
        <SyncStatusDot />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg py-1 z-50">
          <AccountPanel onNavigate={closeMenu} onDialogOpenChange={setDialogOpen} />
        </div>
      )}
    </div>
  );
}
