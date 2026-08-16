import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, redirect, useLoaderData, useRevalidator } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Route } from './+types/index';
import { localeLink } from '~/utils/localeLink';
import { getInstance } from '~/middleware/i18next';
import { createMetaDescriptor, createLinkHreflang } from '~/components/head';
import { ChangePasswordForm } from '~/components/auth/ChangePasswordForm';
import { NewProfileModal } from '~/components/auth/NewProfileModal';
import { ImportDataBanner } from '~/components/auth/ImportDataBanner';
import { ClientOnly } from '~/components/common/ClientOnly';
import { LuTrash2, LuPlus, LuCheck, LuRefreshCw, LuDownload, LuUpload, LuTriangleAlert, LuPencil, LuX } from 'react-icons/lu';
import { magicLinkLogin } from '~/data/livedataServer.json';
import { env } from 'cloudflare:workers';
import { PROFILE_SERVER_OPTIONS, useAuthStore, type ProfileServer, type UserProfile } from '~/store/authStore';
import { useSyncStore } from '~/store/syncStore';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { createInternalSessionRequest } from '~/utils/internalSessionRequest';
import { getProfileServerLabel, isProfileServer, toGraphQLProfileServer } from '~/utils/profileServer';

// WebAuthn only works client-side, so this is excluded from the SSR bundle entirely.
const PasskeyRegisterButton = lazy(() => import('~/components/auth/PasskeyRegisterButton.client').then((m) => ({ default: m.PasskeyRegisterButton })));

interface SessionData {
  user: { id: string; email?: string; username?: string | null };
  profiles: unknown[];
}

export async function loader({ context, request, params }: Route.LoaderArgs) {
  const i18n = getInstance(context);
  const pageTitle = `${i18n.t('auth:settings.header.title')} - Yuzu Trends`;
  const pageDesc = i18n.t('auth:settings.header.subtitle');

  try {
    const headers = request.headers;
    const base = new URL(request.url);

    const sessionResp = await env.AUTH_WORKER.fetch(createInternalSessionRequest(request, params.locale));
    if (sessionResp.status !== 200) return redirect(localeLink(params.locale, '/login'));
    const session: SessionData = await sessionResp.json();
    if (!session?.user) return redirect(localeLink(params.locale, '/login'));

    const [accountsResp, passkeysResp] = await Promise.all([
      env.AUTH_WORKER.fetch(new Request(new URL('/api/auth/list-accounts', base), { headers })),
      env.AUTH_WORKER.fetch(new Request(new URL('/api/auth/passkey/list-user-passkeys', base), { headers })),
    ]);

    type RawAccount = { providerId: string };
    const rawAccounts: RawAccount[] = accountsResp.ok ? await accountsResp.json() : [];
    const linkedProviders: string[] = rawAccounts.map((a) => a.providerId);

    type RawPasskey = { id: string; name?: string | null; createdAt: string };
    const rawPasskeys: RawPasskey[] = passkeysResp.ok ? await passkeysResp.json() : [];
    const passkeys = rawPasskeys.map(({ id, name, createdAt }) => ({ id, name: name ?? null, createdAt }));

    return {
      user: session.user,
      linkedProviders,
      passkeys,
      pageTitle,
      pageDesc,
      headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
    };
  } catch (err) {
    console.error('Session check failed:', err);
    return redirect(localeLink(params.locale, '/login'));
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: 'Account Settings - Yuzu Trends' }];
  return createMetaDescriptor(loaderData.pageTitle, loaderData.pageDesc);
}

export function links() {
  return createLinkHreflang('/settings');
}

async function callGql<T = Record<string, unknown>>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  type GraphQLResponse = { data?: T; errors?: Array<{ message: string; extensions?: { originalError?: { message?: string } } }> };
  const json: GraphQLResponse = await res.json();
  if (json.errors?.length) {
    const e = json.errors[0];
    throw new Error(e.extensions?.originalError?.message ?? e.message);
  }
  const data: T | undefined = json.data;
  return data as T;
}

interface GameInfoDraft {
  uuid: string;
  friendCode: string;
  nickname: string;
}

interface ProfileStats {
  inventoryTypes: number;
  inventoryTotal: number;
  students: number;
  equipmentPlans: number;
  resourceGoals: number;
  gachaStrategies: number;
  eventPlans: number;
  raidRecords: number;
}

interface ProfileAllDataResponse {
  profileAllData: Array<{ key: string; value: unknown }>;
}

interface UpdateProfileResponse {
  updateProfile: Omit<UserProfile, 'server'> & { server: string };
}

const EMPTY_PROFILE_STATS: ProfileStats = { inventoryTypes: 0, inventoryTotal: 0, students: 0, equipmentPlans: 0, resourceGoals: 0, gachaStrategies: 0, eventPlans: 0, raidRecords: 0 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getProfileStats(rows: Array<{ key: string; value: unknown }>): ProfileStats {
  const growthPlansValue = rows.find((row) => row.key === 'growthPlans')?.value;
  const growthPlans = isRecord(growthPlansValue) && Array.isArray(growthPlansValue.growthPlans) ? growthPlansValue.growthPlans : [];
  const students = growthPlans.filter((plan) => isRecord(plan) && typeof plan.studentId === 'number').length;
  const materialInventory = isRecord(growthPlansValue) && isRecord(growthPlansValue.materialInventory) ? growthPlansValue.materialInventory : {};
  const inventoryAmounts = Object.values(materialInventory).filter((amount): amount is number => typeof amount === 'number' && Number.isFinite(amount) && amount > 0);

  const gachaStrategiesValue = rows.find((row) => row.key === 'gacha_strategies')?.value;
  const gachaStrategies = isRecord(gachaStrategiesValue) ? Object.keys(gachaStrategiesValue).length : 0;

  const equipmentPlanValue = rows.find((row) => row.key === 'equipmentPlan')?.value;
  const runCounts = isRecord(equipmentPlanValue) && isRecord(equipmentPlanValue.runCounts) ? equipmentPlanValue.runCounts : {};
  const equipmentPlans = Object.values(runCounts).filter((count) => typeof count === 'number' && count > 0).length;

  const resourcePlanValue = rows.find((row) => row.key === 'resourcePlan')?.value;
  const resourcePlans = isRecord(resourcePlanValue) ? [resourcePlanValue.kr, resourcePlanValue.jp, resourcePlanValue] : [];
  const resourceGoalStudentIds = new Set<string>();
  resourcePlans.forEach((plan) => {
    if (!isRecord(plan) || !isRecord(plan.targetGoals)) return;
    Object.entries(plan.targetGoals).forEach(([studentId, goals]) => {
      if (Array.isArray(goals) && goals.length > 0) resourceGoalStudentIds.add(studentId);
    });
  });

  const raidHistoryValue = rows.find((row) => row.key === 'raidHistory')?.value;
  const raidRecords = isRecord(raidHistoryValue) && Array.isArray(raidHistoryValue.entries) ? raidHistoryValue.entries.length : 0;

  return {
    inventoryTypes: inventoryAmounts.length,
    inventoryTotal: inventoryAmounts.reduce((total, amount) => total + amount, 0),
    students,
    equipmentPlans,
    resourceGoals: resourceGoalStudentIds.size,
    gachaStrategies,
    eventPlans: rows.filter((row) => row.key.startsWith('eventPlans:')).length,
    raidRecords,
  };
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation('auth');
  const { user, linkedProviders, passkeys } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  // Planner profile state — Selector returns only primitives/stable references (no object literals)
  const authUser = useAuthStore((s) => s.user);
  const activeProfileId = useAuthStore((s) => s.activeProfileId);
  const profiles = authUser?.profiles ?? [];
  const syncStatus = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const syncInitialized = useSyncStore((s) => s.isInitialized);
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [exportingProfileId, setExportingProfileId] = useState<string | null>(null);
  const [importingProfileId, setImportingProfileId] = useState<string | null>(null);
  const [importError, setImportError] = useState('');
  const [profileActionError, setProfileActionError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [profileStats, setProfileStats] = useState<Record<string, ProfileStats>>({});

  useEffect(() => {
    if (lastSyncedAt !== null) {
      setShowImport(false);
    } else if (activeProfileId && useGlobalStore.getState().growthPlans.length > 0) {
      setShowImport(true);
    }
  }, [lastSyncedAt, activeProfileId]);

  useEffect(() => {
    let cancelled = false;

    const loadProfileStats = async () => {
      const stats = await Promise.all(
        profiles.map(async (profile) => {
          const data = await callGql<ProfileAllDataResponse>('query ProfileAllData($id: ID!) { profileAllData(id: $id) { key value } }', { id: profile.id });
          return [profile.id, getProfileStats(data.profileAllData)] as const;
        }),
      );

      if (!cancelled) setProfileStats(Object.fromEntries(stats));
    };

    void loadProfileStats().catch(() => {
      if (!cancelled) setProfileStats({});
    });

    return () => {
      cancelled = true;
    };
  }, [profiles]);

  const handleDeleteProfile = async (profileId: string) => {
    if (profiles.length <= 1 || profileId === activeProfileId) return;
    setDeletingProfileId(profileId);
    setProfileActionError('');
    try {
      await callGql('mutation DeleteProfile($id: ID!) { deleteProfile(id: $id) }', { id: profileId });
      const currentUser = useAuthStore.getState().user;
      if (currentUser && currentUser.profiles) {
        useAuthStore.getState().setUser({ ...currentUser, profiles: currentUser.profiles.filter((p) => p.id !== profileId) });
      }
    } catch (err) {
      setProfileActionError(err instanceof Error ? err.message : t('settings.errors.failedToDeleteProfile'));
    } finally {
      setDeletingProfileId(null);
    }
  };

  const handleExportProfile = async (profileId: string, profileName: string, profileServer: string) => {
    setExportingProfileId(profileId);
    setProfileActionError('');
    try {
      type ProfileAllDataResponse = { profileAllData: { key: string; value: unknown }[] };
      const data: ProfileAllDataResponse = await callGql<ProfileAllDataResponse>('query ProfileAllData($id: ID!) { profileAllData(id: $id) { key value } }', { id: profileId });
      const exportData = {
        profile: { id: profileId, name: profileName, server: profileServer },
        data: Object.fromEntries(data.profileAllData.map(({ key, value }) => [key, value])),
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yuzu-${profileName.replace(/[^a-z0-9]/gi, '_')}-${profileServer}.profile.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setProfileActionError(err instanceof Error ? err.message : t('settings.errors.failedToExportProfile'));
    } finally {
      setExportingProfileId(null);
    }
  };

  const handleImportProfile = async (profileId: string, file: File) => {
    setImportingProfileId(profileId);
    setImportError('');
    try {
      const text = await file.text();
      type ImportData = { data?: Record<string, unknown> };
      const parsed: ImportData = JSON.parse(text) as ImportData;
      if (!parsed.data || typeof parsed.data !== 'object') throw new Error('Invalid file format');

      await Promise.all(
        Object.entries(parsed.data).map(([key, value]) =>
          callGql('mutation($profileId:ID!,$key:String!,$value:JSON!){ upsertProfileData(profileId:$profileId,key:$key,value:$value) }', { profileId, key, value }),
        ),
      );
      if (profileId === activeProfileId) await useSyncStore.getState().pullAll(profileId);
      const data: ProfileAllDataResponse = await callGql<ProfileAllDataResponse>('query ProfileAllData($id: ID!) { profileAllData(id: $id) { key value } }', { id: profileId });
      setProfileStats((previous) => ({ ...previous, [profileId]: getProfileStats(data.profileAllData) }));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t('settings.errors.failedToImportProfile'));
    } finally {
      setImportingProfileId(null);
    }
  };

  const handleSwitchProfile = async (profileId: string) => {
    if (profileId === activeProfileId) return;
    setSwitchingId(profileId);
    useSyncStore.getState().setCurrentProfileId(profileId);
    useAuthStore.getState().setActiveProfile(profileId);
    useSyncStore.getState().reset();
    await useSyncStore.getState().pullAll(profileId);
    setSwitchingId(null);
  };

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [gameInfoDraft, setGameInfoDraft] = useState<GameInfoDraft>({ uuid: '', friendCode: '', nickname: '' });
  const [profileServerDraft, setProfileServerDraft] = useState<ProfileServer>('jp');
  const [profileEditLoading, setProfileEditLoading] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState<string | null>(null);
  const [profileEditError, setProfileEditError] = useState('');
  const [savedGameInfo, setSavedGameInfo] = useState<Record<string, GameInfoDraft>>({});

  const handleOpenProfileEdit = async (profileId: string) => {
    if (editingProfileId === profileId) {
      setEditingProfileId(null);
      return;
    }
    setProfileEditLoading(profileId);
    setProfileEditError('');
    try {
      const profile = profiles.find((item) => item.id === profileId);
      if (profile) setProfileServerDraft(profile.server);
      type AllDataResponse = { profileAllData: { key: string; value: unknown }[] };
      const data = await callGql<AllDataResponse>('query($id:ID!){ profileAllData(id:$id){ key value } }', { id: profileId });
      const row = data.profileAllData.find((r) => r.key === 'gameInfo');
      const info = (row?.value ?? {}) as Partial<GameInfoDraft>;
      const draft: GameInfoDraft = {
        uuid: info.uuid ?? '',
        friendCode: info.friendCode ?? '',
        nickname: info.nickname ?? '',
      };
      setGameInfoDraft(draft);
      setEditingProfileId(profileId);
    } catch (err) {
      setProfileEditError(err instanceof Error ? err.message : t('settings.errors.failedToSaveProfile'));
    } finally {
      setProfileEditLoading(null);
    }
  };

  const updateProfileServer = async (profile: UserProfile) => {
    if (profile.server === profileServerDraft) return;

    const data = await callGql<UpdateProfileResponse>(
      'mutation UpdateProfile($id: ID!, $input: UpdateProfileInput!) { updateProfile(id: $id, input: $input) { id name server isDefault sortOrder createdAt updatedAt } }',
      { id: profile.id, input: { server: toGraphQLProfileServer(profileServerDraft) } },
    );
    const server = data.updateProfile.server.toLowerCase();
    if (!isProfileServer(server)) throw new Error(t('settings.errors.failedToSaveProfile'));

    const currentUser = useAuthStore.getState().user;
    if (!currentUser?.profiles) return;
    useAuthStore.getState().setUser({
      ...currentUser,
      profiles: currentUser.profiles.map((item) => (item.id === profile.id ? { ...item, ...data.updateProfile, server } : item)),
    });
  };

  const saveGameInfo = async (profileId: string) => {
    const value: Partial<GameInfoDraft> = {};
    if (gameInfoDraft.uuid) value.uuid = gameInfoDraft.uuid;
    if (gameInfoDraft.friendCode) value.friendCode = gameInfoDraft.friendCode;
    if (gameInfoDraft.nickname) value.nickname = gameInfoDraft.nickname;
    await callGql('mutation($profileId:ID!,$key:String!,$value:JSON!){ upsertProfileData(profileId:$profileId,key:$key,value:$value) }', {
      profileId,
      key: 'gameInfo',
      value,
    });
  };

  const handleSaveProfile = async (profileId: string) => {
    setProfileSaving(profileId);
    setProfileEditError('');
    try {
      const profile = profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error(t('settings.errors.failedToSaveProfile'));

      await updateProfileServer(profile);
      await saveGameInfo(profileId);
      setSavedGameInfo((prev) => ({ ...prev, [profileId]: { ...gameInfoDraft } }));
      setEditingProfileId(null);
    } catch (err) {
      setProfileEditError(err instanceof Error ? err.message : t('settings.errors.failedToSaveProfile'));
    } finally {
      setProfileSaving(null);
    }
  };

  const [unlinkLoading, setUnlinkLoading] = useState<string | null>(null);
  const [accountError, setAccountError] = useState('');
  const [passkeyDeleteLoading, setPasskeyDeleteLoading] = useState<string | null>(null);
  const [passkeyError, setPasskeyError] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeletePasskey = async (id: string) => {
    setPasskeyDeleteLoading(id);
    setPasskeyError('');
    try {
      const res = await fetch('/api/auth/passkey/delete-passkey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(t('settings.errors.failedToDeletePasskey'));
      void revalidator.revalidate();
    } catch (err) {
      setPasskeyError(err instanceof Error ? err.message : t('settings.errors.failedToDeletePasskey'));
    } finally {
      setPasskeyDeleteLoading(null);
    }
  };

  const handleLinkGithub = async () => {
    try {
      const res = await fetch('/api/auth/link-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'github',
          callbackURL: localeLink(i18n.language, '/settings'),
        }),
      });

      if (!res.ok) throw new Error(t('settings.errors.failedToStartGithubLinking'));
      type LinkResponse = { url?: string };
      const data: LinkResponse = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : t('settings.errors.failedToLinkGithub'));
    }
  };

  const handleUnlinkAccount = async (providerId: string, accountId: string) => {
    setUnlinkLoading(providerId);
    try {
      const res = await fetch('/api/auth/unlink-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, accountId }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? t('settings.errors.failedToUnlinkAccount'));
      }
      void revalidator.revalidate();
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : t('settings.errors.failedToUnlinkAccount'));
    } finally {
      setUnlinkLoading(null);
    }
  };

  const handleLogout = async () => {
    const res = await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      console.error('Logout failed:', res.status, await res.text());
      return;
    }
    useAuthStore.getState().logout();
    useSyncStore.getState().clearAccountData();
    window.location.href = localeLink(i18n.language, '/');
  };

  const handleDeleteAccount = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDeleteError('');
    setDeleteLoading(true);
    try {
      type DeleteResponse = {
        message?: string;
      };

      const res = await fetch('/api/auth/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data: DeleteResponse = await res.json();
        throw new Error(data?.message || t('settings.errors.failedToDeleteAccount'));
      }
      window.location.href = localeLink(i18n.language, '/');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('settings.errors.failedToDeleteAccount'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const isLinked = (providerId: string) => linkedProviders.includes(providerId);

  const hasSyntheticEmail = user.email?.endsWith('@users.internal') ?? true;

  const handleAddEmail = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEmailError('');
    setEmailLoading(true);
    try {
      type EmailResponse = {
        message?: string;
        error?: string;
      };

      const res = await fetch('/api/auth/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail: emailInput, callbackURL: localeLink(i18n.language, '/settings') }),
      });
      if (!res.ok) {
        const data: EmailResponse = await res.json();
        throw new Error(data?.message || data?.error || t('settings.errors.failedToAddEmail'));
      }
      setShowEmailForm(false);
      setEmailInput('');
      setEmailError('');
      setEmailSent(true);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : t('settings.errors.failedToAddEmail'));
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div className="py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t('settings.header.title')}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{t('settings.header.subtitle')}</p>
      </div>

      {/* Planner Profiles */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide border-b border-neutral-200 dark:border-neutral-700 pb-2">
          {t('settings.profiles.title')}
        </h2>

        {showImport && activeProfileId && <ImportDataBanner profileId={activeProfileId} onDone={() => setShowImport(false)} />}
        {profileActionError && <p className="text-xs text-red-600 dark:text-red-400">{profileActionError}</p>}
        {importError && <p className="text-xs text-red-600 dark:text-red-400">{importError}</p>}
        {profileEditError && <p className="text-xs text-red-600 dark:text-red-400">{profileEditError}</p>}

        <div className="space-y-2">
          {profiles.map((profile) => (
            <div key={profile.id} className="space-y-0">
              <div
                className={`flex flex-wrap items-center justify-between p-3 rounded-lg border transition ${editingProfileId === profile.id ? 'rounded-b-none border-b-0' : ''} ${
                  profile.id === activeProfileId
                    ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-700/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  {profile.id === activeProfileId && <LuCheck className="text-blue-600 dark:text-blue-400 shrink-0" size={16} />}
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white text-sm">{profile.name}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{getProfileServerLabel(profile.server)}</p>
                    {savedGameInfo[profile.id]?.nickname && <p className="text-xs text-neutral-400 dark:text-neutral-500">{savedGameInfo[profile.id].nickname}</p>}
                    {savedGameInfo[profile.id]?.uuid && <p className="text-xs text-neutral-400 dark:text-neutral-500">UID {savedGameInfo[profile.id].uuid}</p>}
                    {profile.id === activeProfileId && (syncStatus !== 'idle' || !syncInitialized) && (
                      <p
                        className={`text-xs mt-0.5 ${
                          syncStatus === 'error' ? 'text-red-500 dark:text-red-400' : syncStatus === 'syncing' ? 'text-blue-500 dark:text-blue-400' : 'text-neutral-400 dark:text-neutral-500'
                        }`}
                      >
                        {syncStatus === 'synced' && lastSyncedAt
                          ? `${t('settings.profiles.synced')} ${new Date(lastSyncedAt).toLocaleTimeString()}`
                          : syncStatus === 'syncing'
                            ? t('settings.profiles.syncing')
                            : syncStatus === 'error'
                              ? t('settings.profiles.syncError')
                              : t('settings.profiles.notSynced')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => void handleOpenProfileEdit(profile.id)}
                    disabled={profileEditLoading === profile.id}
                    title={t('settings.profiles.editProfile')}
                    className="p-2 text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition disabled:opacity-50"
                  >
                    {profileEditLoading === profile.id ? <LuRefreshCw size={14} className="animate-spin" /> : editingProfileId === profile.id ? <LuX size={14} /> : <LuPencil size={14} />}
                  </button>
                  <button
                    onClick={() => void handleExportProfile(profile.id, profile.name, profile.server)}
                    disabled={exportingProfileId === profile.id}
                    title={t('settings.profiles.exportData')}
                    className="p-2 text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition disabled:opacity-50"
                  >
                    {exportingProfileId === profile.id ? <LuRefreshCw size={14} className="animate-spin" /> : <LuDownload size={14} />}
                  </button>
                  <label
                    title={t('settings.profiles.importData')}
                    className={`p-2 text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition cursor-pointer ${importingProfileId === profile.id ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    {importingProfileId === profile.id ? <LuRefreshCw size={14} className="animate-spin" /> : <LuUpload size={14} />}
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleImportProfile(profile.id, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {profile.id !== activeProfileId && profiles.length > 1 && (
                    <button
                      onClick={() => void handleDeleteProfile(profile.id)}
                      disabled={deletingProfileId !== null}
                      title={t('settings.profiles.deleteProfile')}
                      className="p-1.5 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 rounded transition disabled:opacity-50"
                    >
                      {deletingProfileId === profile.id ? <LuRefreshCw size={14} className="animate-spin" /> : <LuTrash2 size={14} />}
                    </button>
                  )}
                  {profile.id !== activeProfileId && (
                    <button
                      onClick={() => void handleSwitchProfile(profile.id)}
                      disabled={switchingId !== null}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 disabled:opacity-50 transition ml-1"
                    >
                      {switchingId === profile.id ? '…' : t('settings.profiles.switch')}
                    </button>
                  )}
                </div>
                <div className="mt-3 grid w-full grid-cols-2 gap-x-5 gap-y-3 border-t border-neutral-200 pt-3 dark:border-neutral-700 sm:grid-cols-3">
                  <span className="flex min-w-0 flex-col text-neutral-800 dark:text-neutral-200">
                    <span className="text-lg font-semibold leading-none tabular-nums">{profileStats[profile.id]?.inventoryTypes ?? EMPTY_PROFILE_STATS.inventoryTypes}</span>
                    <span className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {t('settings.profiles.stats.inventory', { total: (profileStats[profile.id]?.inventoryTotal ?? EMPTY_PROFILE_STATS.inventoryTotal).toLocaleString() })}
                    </span>
                  </span>
                  {(
                    [
                      ['students', '/planner/students'],
                      ['equipmentPlans', '/planner/equipment'],
                      ['resourceGoals', '/planner/resources'],
                      ['gachaStrategies', '/planner/gacha'],
                      ['eventPlans', '/planner/event'],
                      ['raidRecords', '/my/raids'],
                    ] as const
                  ).map(([key, to]) => {
                    const count = profileStats[profile.id]?.[key] ?? EMPTY_PROFILE_STATS[key];
                    const content = (
                      <>
                        <span className="text-lg font-semibold leading-none tabular-nums">{count}</span>
                        <span className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t(`settings.profiles.stats.${key}`)}</span>
                      </>
                    );
                    return profile.id === activeProfileId ? (
                      <Link key={key} to={localeLink(i18n.language, to)} className="flex min-w-0 flex-col text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                        {content}
                      </Link>
                    ) : (
                      <span key={key} className="flex min-w-0 flex-col text-neutral-800 dark:text-neutral-200">
                        {content}
                      </span>
                    );
                  })}
                </div>
              </div>
              {editingProfileId === profile.id && (
                <div
                  className={`px-3 pt-3 pb-3 rounded-b-lg border border-t-0 space-y-2 ${
                    profile.id === activeProfileId
                      ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-700/30'
                  }`}
                >
                  <div>
                    <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t('settings.profiles.server')}</label>
                    <select
                      value={profileServerDraft}
                      onChange={(e) => setProfileServerDraft(e.target.value as ProfileServer)}
                      className="w-full px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {PROFILE_SERVER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {t('settings.gameInfo.title')} <span className="font-normal">— {t('settings.gameInfo.optional')}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t('settings.gameInfo.uuid')}</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={gameInfoDraft.uuid}
                        onChange={(e) => setGameInfoDraft((d) => ({ ...d, uuid: e.target.value.replace(/\D/g, '') }))}
                        maxLength={20}
                        className="w-full px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t('settings.gameInfo.friendCode')}</label>
                      <input
                        type="text"
                        value={gameInfoDraft.friendCode}
                        onChange={(e) => setGameInfoDraft((d) => ({ ...d, friendCode: e.target.value.replace(/[^a-zA-Z0-9]/g, '') }))}
                        maxLength={20}
                        className="w-full px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t('settings.gameInfo.nickname')}</label>
                    <input
                      type="text"
                      value={gameInfoDraft.nickname}
                      onChange={(e) => setGameInfoDraft((d) => ({ ...d, nickname: e.target.value }))}
                      maxLength={20}
                      className="w-full px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingProfileId(null)}
                      className="flex-1 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700/50 transition"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveProfile(profile.id)}
                      disabled={profileSaving === profile.id}
                      className="flex-1 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white font-medium rounded-md transition"
                    >
                      {profileSaving === profile.id ? t('common.saving') : t('common.save')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {profiles.length < 5 && (
          <button
            onClick={() => setShowNewProfile(true)}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/30 hover:text-neutral-900 dark:hover:text-neutral-200 transition"
          >
            <LuPlus size={16} />
            {t('settings.profiles.newProfile')}
          </button>
        )}
        {showNewProfile && <NewProfileModal onClose={() => setShowNewProfile(false)} />}
      </section>

      {/* Account */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide border-b border-neutral-200 dark:border-neutral-700 pb-2">{t('settings.account.title')}</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-400 dark:text-neutral-500">{t('settings.account.loginId')}</span>
            {user.username ? (
              <span className="font-semibold text-neutral-900 dark:text-white">{user.username}</span>
            ) : (
              <span className="text-neutral-400 dark:text-neutral-500">{t('settings.account.none')}</span>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400 dark:text-neutral-500">{t('settings.account.email')}</span>
            {hasSyntheticEmail ? (
              <span className="text-neutral-400 dark:text-neutral-500">{t('settings.account.none')}</span>
            ) : (
              <span className="font-semibold text-neutral-900 dark:text-white">{user.email}</span>
            )}
          </div>
        </div>
      </section>

      {/* Sign-in Methods */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide border-b border-neutral-200 dark:border-neutral-700 pb-2">
          {t('settings.signinMethods.title')}
        </h2>

        {accountError && <p className="text-xs text-red-600 dark:text-red-400">{accountError}</p>}

        <div className="space-y-2">
          {/* Password */}
          <div className="p-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{t('settings.signinMethods.password.label')}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('settings.signinMethods.password.description')}</p>
              </div>
              {!showPasswordForm && (
                <button onClick={() => setShowPasswordForm(true)} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 ml-4 shrink-0">
                  {isLinked('credential') ? t('settings.signinMethods.password.change') : t('settings.signinMethods.password.setPassword')}
                </button>
              )}
            </div>
            {showPasswordForm && (
              <ClientOnly>
                <ChangePasswordForm
                  mode={isLinked('credential') ? 'change' : 'set'}
                  storedUsername={user.username ?? undefined}
                  onSuccess={() => {
                    setShowPasswordForm(false);
                    void revalidator.revalidate();
                  }}
                  onCancel={() => setShowPasswordForm(false)}
                />
              </ClientOnly>
            )}
          </div>

          {/* Magic Link */}
          {magicLinkLogin && (
            <div className="p-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">{t('settings.signinMethods.magicLink.label')}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{hasSyntheticEmail ? t('settings.signinMethods.magicLink.noEmail') : user.email}</p>
                </div>
                <div className="ml-4 shrink-0">
                  {emailSent ? (
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('settings.signinMethods.magicLink.checkInbox')}</span>
                  ) : (
                    !showEmailForm && (
                      <button onClick={() => setShowEmailForm(true)} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                        {hasSyntheticEmail ? t('settings.signinMethods.magicLink.addEmail') : t('settings.signinMethods.magicLink.changeEmail')}
                      </button>
                    )
                  )}
                </div>
              </div>
              {emailSent && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{t('settings.signinMethods.magicLink.verificationSent')}</p>}
              {showEmailForm && (
                <form onSubmit={(e) => void handleAddEmail(e)} className="mt-3 space-y-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    required
                    placeholder={t('common.emailPlaceholder')}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoComplete="email"
                  />
                  {emailError && <p className="text-xs text-red-600 dark:text-red-400">{emailError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEmailForm(false);
                        setEmailInput('');
                        setEmailError('');
                      }}
                      className="flex-1 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition"
                    >
                      {t('common.cancel')}
                    </button>
                    <button type="submit" disabled={emailLoading} className="flex-1 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white font-medium rounded-md transition">
                      {emailLoading ? t('common.saving') : t('settings.signinMethods.magicLink.saveEmail')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* GitHub */}
          <div className="p-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{t('settings.signinMethods.github.label')}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('settings.signinMethods.github.description')}</p>
              </div>
              <div className="ml-4 shrink-0">
                {isLinked('github') ? (
                  linkedProviders.filter((p) => p !== 'github').length > 0 ? (
                    <button
                      onClick={() => void handleUnlinkAccount('github', '')}
                      disabled={unlinkLoading === 'github'}
                      className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
                    >
                      {t('settings.signinMethods.github.unlink')}
                    </button>
                  ) : null
                ) : (
                  <button onClick={() => void handleLinkGithub()} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                    {t('settings.signinMethods.github.connect')}
                  </button>
                )}
              </div>
            </div>
            {isLinked('github') && linkedProviders.filter((p) => p !== 'github').length === 0 && (
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{t('settings.signinMethods.github.unlinkBlocked')}</p>
            )}
          </div>
        </div>
      </section>

      {/* Passkey */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide border-b border-neutral-200 dark:border-neutral-700 pb-2">
          {t('settings.passkeySection.title')}
        </h2>
        <Suspense fallback={null}>
          <PasskeyRegisterButton
            onSuccess={() => {
              void revalidator.revalidate();
            }}
            showNameInput={true}
          />
        </Suspense>
        {passkeyError && <p className="text-xs text-red-600 dark:text-red-400">{passkeyError}</p>}
        {passkeys.length > 0 && (
          <div className="space-y-2">
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="flex items-center justify-between p-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">{passkey.name || t('settings.passkeySection.title')}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t('settings.passkeySection.added')} {new Date(passkey.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => void handleDeletePasskey(passkey.id)}
                  disabled={passkeyDeleteLoading === passkey.id}
                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                >
                  <LuTrash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Danger Zone */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide border-b border-neutral-200 dark:border-neutral-700 pb-2">
          {t('settings.dangerZone.title')}
        </h2>

        {/* Logout — safe action */}
        <button
          onClick={() => void handleLogout()}
          className="w-full py-2 px-3 text-sm font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition"
        >
          {t('settings.dangerZone.logout')}
        </button>

        {/* Delete account */}
        {!showDeleteSection ? (
          <button
            onClick={() => setShowDeleteSection(true)}
            className="w-full py-2.5 px-3 text-left border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
          >
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <LuTriangleAlert size={14} className="shrink-0" />
              <span className="text-sm font-medium">{t('settings.dangerZone.deleteAccount')}</span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 ml-5">{t('settings.dangerZone.permanent')}</p>
          </button>
        ) : (
          <div className="border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <LuTriangleAlert size={14} className="shrink-0" />
              <span className="text-sm font-medium">{t('settings.dangerZone.deleteAccount')}</span>
            </div>
            <form onSubmit={(e) => void handleDeleteAccount(e)} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                  {t('settings.dangerZone.confirmText')} <span className="font-mono font-bold text-neutral-900 dark:text-white">DELETE</span> {t('settings.dangerZone.typeDelete')}
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  required
                  placeholder={t('settings.dangerZone.deleteConfirmPlaceholder')}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              {deleteError && <p className="text-xs text-red-600 dark:text-red-400">{deleteError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteSection(false);
                    setDeleteConfirmText('');
                  }}
                  className="flex-1 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={deleteLoading || deleteConfirmText !== 'DELETE'}
                  className="flex-1 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:bg-neutral-400 text-white font-semibold rounded-lg transition"
                >
                  {deleteLoading ? t('settings.dangerZone.deleting') : t('settings.dangerZone.permanentlyDelete')}
                </button>
              </div>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
