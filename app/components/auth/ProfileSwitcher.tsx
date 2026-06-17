import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '~/store/authStore';
import { useSyncStore } from '~/store/syncStore';
import { LuChevronDown, LuLogOut, LuPlus, LuSettings } from 'react-icons/lu';
import { Link } from 'react-router';
import { NewProfileModal } from './NewProfileModal';

export function ProfileSwitcher() {
  const { t } = useTranslation('auth');
  const { user, activeProfileId } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const activeProfile = user?.profiles?.find((p) => p.id === activeProfileId);

  if (!user || !activeProfile) return null;

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/sign-out', { method: 'POST' });
      useAuthStore.getState().logout();
      useSyncStore.getState().reset();
      useSyncStore.getState().setCurrentProfileId(null);
      window.location.href = '/';
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleProfileChange = async (profileId: string) => {
    if (profileId === activeProfileId) {
      setIsOpen(false);
      return;
    }
    setSwitching(profileId);
    const hadServerData = useSyncStore.getState().lastSyncedAt !== null;
    useSyncStore.getState().setCurrentProfileId(profileId);
    useAuthStore.getState().setActiveProfile(profileId);
    useSyncStore.getState().reset();
    if (hadServerData) useSyncStore.getState().clearPlannerStores();
    await useSyncStore.getState().pullAll(profileId);
    setSwitching(null);
    setIsOpen(false);
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
        >
          <div className="flex flex-col items-start text-sm">
            <span className="font-medium text-neutral-800 dark:text-white">{activeProfile.name}</span>
            <span className="text-xs text-neutral-600 dark:text-neutral-400">{user.username}</span>
          </div>
          <LuChevronDown className={`text-neutral-600 dark:text-neutral-400 transition ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute top-full right-0 mt-1 w-52 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg z-50">
            <div className="p-2">
              {user.profiles?.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => void handleProfileChange(profile.id)}
                  disabled={switching !== null}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                    profile.id === activeProfileId
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                  } disabled:opacity-50`}
                >
                  {switching === profile.id ? t('settings.profiles.loadingProfile') : profile.name}
                  <span className="text-xs text-neutral-500 ml-2">({profile.server === 'global' ? 'GL' : profile.server.toUpperCase()})</span>
                </button>
              ))}

              <button
                onClick={() => {
                  setShowNewProfile(true);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 mt-1 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition"
              >
                <LuPlus size={16} />
                <span>{t('settings.profiles.newProfile')}</span>
              </button>

              <div className="border-t border-neutral-200 dark:border-neutral-700 my-1" />

              <Link
                to="/settings"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition"
              >
                <LuSettings size={16} />
                <span>{t('settings.header.title')}</span>
              </Link>

              <button
                onClick={() => void handleLogout()}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
              >
                <LuLogOut size={16} />
                <span>{t('settings.dangerZone.logout')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {showNewProfile && <NewProfileModal onClose={() => setShowNewProfile(false)} />}
    </>
  );
}
