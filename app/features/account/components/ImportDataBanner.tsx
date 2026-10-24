import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LuCloudUpload, LuX, LuTriangleAlert } from 'react-icons/lu';
import { gqlFetch } from '~/utils/gqlFetch';
import { useSyncStore } from '~/store/syncStore';

interface Props {
  userId: string;
  profileId: string;
  onDone: () => void;
}

export function ImportDataBanner({ userId, profileId, onDone }: Props) {
  const { t } = useTranslation('auth');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImport = async () => {
    setLoading(true);
    setError('');
    try {
      const snapshotModule = await import('~/store/anonymousPlannerSnapshot.client');
      const snapshot = snapshotModule.getAnonymousPlannerSnapshot(userId, profileId);
      if (!snapshot) throw new Error(t('settings.errors.failedToImportProfile'));
      const response = await gqlFetch<{ syncProfileData: Array<{ key: string; status: 'APPLIED' | 'CONFLICT' }> }>(
        `mutation SyncProfileData($profileId:ID!,$changes:[SyncProfileDataChangeInput!]!){
          syncProfileData(profileId:$profileId,changes:$changes){ key status }
        }`,
        {
          profileId,
          changes: Object.entries(snapshot.values).map(([key, value]) => ({ key, value, schemaVersion: 1, baseRevision: 0 })),
        },
      );
      if (response.syncProfileData.some((result) => result.status === 'CONFLICT')) throw new Error(t('settings.errors.failedToImportProfile'));
      snapshotModule.clearAnonymousPlannerSnapshot(userId, profileId);
      await useSyncStore.getState().pullAll();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errors.failedToImportProfile'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 px-1">
          <LuTriangleAlert size={13} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-3">
        <div className="flex items-start sm:items-center gap-3">
          <LuCloudUpload className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5 sm:mt-0" size={18} />
          <p className="flex-1 text-sm text-amber-800 dark:text-amber-300">{t('settings.profiles.importPrompt')}</p>
          <button
            onClick={() => void handleImport()}
            disabled={loading}
            className="hidden sm:block shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition"
          >
            {loading ? t('common.saving') : t('settings.profiles.importData')}
          </button>
          <button onClick={onDone} className="shrink-0 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition" aria-label="dismiss">
            <LuX size={16} />
          </button>
        </div>
        <div className="flex justify-end mt-2 sm:hidden">
          <button onClick={() => void handleImport()} disabled={loading} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition">
            {loading ? t('common.saving') : t('settings.profiles.importData')}
          </button>
        </div>
      </div>
    </div>
  );
}
