import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LuX } from 'react-icons/lu';
import { gqlFetch } from '~/utils/gqlFetch';
import { GLKR_PROFILE_SERVER_OPTIONS, useAuthStore } from '~/store/authStore';
import { useSyncStore } from '~/store/syncStore';
import type { UserProfile } from '~/store/authStore';
import { getDefaultProfileServer, toGraphQLProfileServer } from '~/utils/profileServer';

type Server = UserProfile['server'];
type ServerGroup = 'JP' | 'GLKR';

interface Props {
  onClose: () => void;
}

export function NewProfileModal({ onClose }: Props) {
  const { t, i18n } = useTranslation('auth');
  const defaultServer = getDefaultProfileServer(i18n.language);
  const [name, setName] = useState('');
  const [group, setGroup] = useState<ServerGroup>(defaultServer === 'jp' ? 'JP' : 'GLKR');
  const [glkrServer, setGlkrServer] = useState<(typeof GLKR_PROFILE_SERVER_OPTIONS)[number]['value']>(defaultServer === 'jp' ? 'kr' : defaultServer);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { user } = useAuthStore();

  const selectedServer: Server = group === 'JP' ? 'jp' : glkrServer;

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if ((user?.profiles?.length ?? 0) >= 5) {
      setError(t('settings.profiles.errors.maxProfiles'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await gqlFetch<{ createProfile: { id: string; name: string; server: string; isDefault: boolean; sortOrder: number; createdAt: string; updatedAt: string } }>(
        `mutation($input: CreateProfileInput!) {
          createProfile(input: $input) {
            id name server isDefault sortOrder createdAt updatedAt
          }
        }`,
        { input: { name: name.trim(), server: toGraphQLProfileServer(selectedServer) } },
      );

      const newProfile: UserProfile = {
        ...data.createProfile,
        server: data.createProfile.server.toLowerCase() as Server,
      };

      const currentUser = useAuthStore.getState().user;
      if (currentUser)
        useAuthStore.getState().setUser({
          ...currentUser,
          profiles: [...(currentUser.profiles ?? []), newProfile],
        });

      useAuthStore.getState().setActiveProfile(newProfile.id);
      useSyncStore.getState().setCurrentProfileId(newProfile.id);
      useSyncStore.getState().reset();
      void useSyncStore.getState().pullAll(newProfile.id);

      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-neutral-800 dark:text-white">{t('settings.profiles.newProfile')}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition">
            <LuX size={18} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t('settings.profiles.profileName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.profiles.exampleName')}
              maxLength={30}
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">{t('settings.profiles.server')}</label>
            <div className="flex gap-2 mb-3">
              {(
                [
                  ['JP', t('settings.profiles.serverGroups.jp')],
                  ['GLKR', t('settings.profiles.serverGroups.glkr')],
                ] as [ServerGroup, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGroup(value)}
                  className={`flex-1 py-2 text-sm rounded-lg border transition ${
                    group === value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-medium'
                      : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {group === 'GLKR' && (
              <div className="flex gap-1.5">
                {GLKR_PROFILE_SERVER_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGlkrServer(value)}
                    className={`flex-1 py-1.5 text-xs rounded-md border transition ${
                      glkrServer === value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-medium'
                        : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button type="submit" disabled={loading || !name.trim()} className="w-full py-2 text-sm font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition">
            {loading ? t('settings.profiles.creatingProfile') : t('settings.profiles.create')}
          </button>
        </form>
      </div>
    </div>
  );
}
