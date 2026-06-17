import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LuCloudUpload, LuX, LuTriangleAlert } from 'react-icons/lu';
import { gqlFetch } from '~/utils/gqlFetch';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { useEventPlanStore } from '~/store/planner/useEventPlanStore';
import { useEquipmentPlanStore } from '~/store/planner/useEquipmentPlanStore';
import { useSyncStore } from '~/store/syncStore';

interface Props {
  profileId: string;
  onDone: () => void;
}

export function ImportDataBanner({ profileId, onDone }: Props) {
  const { t } = useTranslation('auth');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImport = async () => {
    setLoading(true);
    setError('');
    try {
      const globalState = useGlobalStore.getState();
      const equipState = useEquipmentPlanStore.getState();
      const eventState = useEventPlanStore.getState();

      // Build batch data: growthPlans + equipmentPlan as single keys,
      // each event plan as separate key
      const batchEntries: { key: string; value: unknown }[] = [
        {
          key: 'growthPlans',
          value: {
            growthPlans: globalState.growthPlans,
            ownedGifts: globalState.ownedGifts,
            materialInventory: globalState.materialInventory,
          },
        },
        {
          key: 'equipmentPlan',
          value: {
            runCounts: equipState.runCounts,
            farmingDays: equipState.farmingDays,
            normalMultiplier: equipState.normalMultiplier,
            hardMultiplier: equipState.hardMultiplier,
            // inventory: equipState.inventory,
            campaignSource: equipState.campaignSource,
            // blueprints: equipState.blueprints,
          },
        },
        ...Object.entries(eventState.plans).map(([eventId, plan]) => ({
          key: `eventPlans:${eventId}`,
          value: plan,
        })),
      ];

      // Upsert each entry individually (batch mutation handles all keys)
      await Promise.all(
        batchEntries.map(({ key, value }) =>
          gqlFetch(
            `mutation($profileId:ID!,$key:String!,$value:JSON!){
              upsertProfileData(profileId:$profileId,key:$key,value:$value)
            }`,
            { profileId, key, value },
          ),
        ),
      );
      useSyncStore.setState({ status: 'synced', lastSyncedAt: Date.now(), isInitialized: true });
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
