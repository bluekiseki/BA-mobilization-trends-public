import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { data, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { useTranslation } from 'react-i18next';
import { HiOutlinePlus } from 'react-icons/hi2';
import { getInstance } from '~/middleware/i18next';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { RaidHistoryFormModal } from '~/components/my/raids/RaidHistoryFormModal';
import { RaidHistoryTable, type RaidOption } from '~/components/my/raids/RaidHistoryTable';
import { RaidStatsTab } from '~/components/my/raids/RaidStatsTab';
import { useAuthStore } from '~/store/authStore';
import { useRaidHistoryStore } from '~/store/planner/useRaidHistoryStore';
import type { RaidHistoryEntry, RaidHistoryServer } from '~/types/raidHistory';
import type { Student, StudentData, StudentPortraitData } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { getLocaleShortName } from '~/utils/i18n/config';
import { loadScheduleDataV2, type ScheduleItemV2 } from '~/utils/calender.data.v2';
import { getArmorDisplayName, getItemTitle, type I18nLike } from '~/utils/scheduleDisplay';
import { cdn } from '~/utils/cdn';
import { PROFILE_SERVER_OPTIONS } from '~/store/authStore';
import { localeLink } from '~/utils/localeLink';
import { downloadFile } from '~/utils/downloadFile';
import { ProfileDataSchemas } from '~/schemas/profileDataValidation';
import { PageHeader } from '~/components/common/PageHeader';

type RaidHistorySort = 'date_desc' | 'date_asc' | 'added_desc' | 'added_asc';

function buildRaidLabel(item: ScheduleItemV2, id: string, locale: Locale, i18n: I18nLike): string {
  const title = getItemTitle(item, locale, i18n);
  const armorLabel = getArmorDisplayName(item.details?.armorType, locale) ?? item.details?.armorType;

  if (item.type === 'multifloor' && armorLabel) {
    return `${id} ${title} (${armorLabel})`;
  }

  if (item.type === 'eraid' && item.details?.bosses?.length) {
    const armorLabels = item.details.bosses
      .map((boss) => getArmorDisplayName(boss.armorType, locale) ?? boss.armorType)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' / ');

    if (armorLabels) {
      return `${id} ${title} (${armorLabels})`;
    }
  }

  return `${id} ${title}`;
}

function toRaidOption(server: RaidHistoryServer, item: ScheduleItemV2, locale: Locale, i18n: I18nLike): RaidOption | null {
  if (item.type !== 'raid' && item.type !== 'eraid' && item.type !== 'jointFiringDrill' && item.type !== 'multifloor') return null;
  const [, season] = item.id.split('-');
  const type = item.type === 'jointFiringDrill' ? 'jfd' : item.type;
  const id = `${item.type === 'eraid' ? 'E' : item.type === 'jointFiringDrill' ? 'JFD' : item.type === 'multifloor' ? 'F' : 'R'}${season}`;
  const boss = getItemTitle(item, locale, i18n);
  return {
    id,
    type,
    server,
    startDate: item.startTime.slice(0, 10),
    endDate: item.endTime.slice(0, 10),
    boss,
    label: buildRaidLabel(item, id, locale, i18n),
    armorTypes:
      item.type === 'eraid'
        ? item.details?.bosses
            ?.map((bossInfo) => {
              const label = getArmorDisplayName(bossInfo.armorType, locale) ?? bossInfo.armorType;
              return label ? { value: bossInfo.armorType ?? label, label } : null;
            })
            .filter((value): value is { value: string; label: string } => value !== null)
        : undefined,
  };
}

function buildRaidOptions(server: RaidHistoryServer, items: ScheduleItemV2[], locale: Locale, i18n: I18nLike) {
  const seen = new Set<string>();
  const options: RaidOption[] = [];
  for (const item of items) {
    const option = toRaidOption(server, item, locale, i18n);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
  }
  return options.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

function getDefaultServer(locale: Locale): RaidHistoryServer {
  if (locale === 'ko') return 'kr';
  if (locale === 'ja') return 'jp';
  if (locale === 'zh-Hant') return 'tw';
  return 'na';
}

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  const krData = loadScheduleDataV2({ server: 'kr', tracksToLoad: ['raid', 'multifloor'] });
  const jpData = loadScheduleDataV2({ server: 'jp', tracksToLoad: ['raid', 'multifloor'] });
  const serverOptions = PROFILE_SERVER_OPTIONS;
  return data({
    siteTitle: i18n.t('common:title'),
    title: i18n.t('mypage:raids.title'),
    description: i18n.t('mypage:raids.description'),
    locale,
    defaultServer: getDefaultServer(locale),
    serverOptions,
    raidOptions: serverOptions.flatMap((serverOption) =>
      buildRaidOptions(serverOption.value, serverOption.value === 'jp' ? [...jpData.tracks.raid, ...jpData.tracks.multifloor] : [...krData.tracks.raid, ...krData.tracks.multifloor], locale, i18n),
    ),
  });
}

export function meta({ loaderData }: { loaderData: { title: string; siteTitle: string; description: string } }) {
  return createMetaDescriptor(`${loaderData.title} | ${loaderData.siteTitle}`, loaderData.description, '/img/raid.webp');
}

export function links() {
  return [...createLinkHreflang('/my/raids')];
}

export default function MyRaidHistoryPage() {
  const { raidOptions, serverOptions, locale, defaultServer } = useLoaderData<typeof loader>();
  const { t } = useTranslation('mypage');
  const { t: t_ui } = useTranslation('ui');
  const { t: ta } = useTranslation('auth');
  const user = useAuthStore((s) => s.user);
  const activeProfileId = useAuthStore((s) => s.activeProfileId);
  const entries = useRaidHistoryStore((s) => s.entries);
  const addEntry = useRaidHistoryStore((s) => s.addEntry);
  const updateEntry = useRaidHistoryStore((s) => s.updateEntry);
  const deleteEntry = useRaidHistoryStore((s) => s.deleteEntry);
  const replaceEntries = useRaidHistoryStore((s) => s.replaceEntries);
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [portraits, setPortraits] = useState<StudentPortraitData>({});
  const [serverFilter, setServerFilter] = useState<RaidHistoryServer | 'all'>('all');
  const [sortOrder, setSortOrder] = useState<RaidHistorySort>('date_desc');
  const [activeTab, setActiveTab] = useState<'records' | 'stats'>('records');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RaidHistoryEntry | undefined>(undefined);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const activeProfileServer = user?.profiles?.find((profile) => profile.id === activeProfileId)?.server;

  useEffect(() => {
    if (activeProfileServer) setServerFilter(activeProfileServer);
  }, [activeProfileServer]);

  useEffect(() => {
    const loadStudents = async () => {
      const [studentsRes, portraitsRes] = await Promise.all([fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)), fetch(cdn('/w/students_portrait.json'))]);
      const studentData: StudentData = await studentsRes.json();
      const portraitData: StudentPortraitData = await portraitsRes.json();
      const mergedStudents: Record<string, Student> = {};
      for (const [id, student] of Object.entries(studentData)) {
        mergedStudents[id] = { ...student, Portrait: portraitData[Number(id)] };
      }
      setStudents(mergedStudents);
      setPortraits(portraitData);
    };
    void loadStudents();
  }, [locale]);

  const portraitData = useMemo(() => {
    const result: Record<number, string> = {};
    for (const [id, portrait] of Object.entries(portraits)) {
      result[Number(id)] = portrait;
    }
    return result;
  }, [portraits]);

  const filteredEntries = useMemo(() => {
    const safeEntries = Array.isArray(entries) ? entries : [];
    const filtered = safeEntries.filter((entry) => serverFilter === 'all' || entry.server === serverFilter).map((entry, index) => ({ entry, index }));

    filtered.sort((a, b) => {
      if (sortOrder === 'date_desc') return (b.entry.date ?? '').localeCompare(a.entry.date ?? '') || b.index - a.index;
      if (sortOrder === 'date_asc') return (a.entry.date ?? '').localeCompare(b.entry.date ?? '') || a.index - b.index;
      if (sortOrder === 'added_desc') return b.index - a.index;
      return a.index - b.index;
    });

    return filtered.map(({ entry }) => entry);
  }, [entries, serverFilter, sortOrder]);

  const saveEntry = (entry: RaidHistoryEntry) => {
    if (editingEntry) updateEntry(entry);
    else addEntry(entry);
    setIsModalOpen(false);
    setEditingEntry(undefined);
  };

  const exportJson = () => {
    const exportData = { entries, timestamp: new Date().toISOString(), version: 1 };
    downloadFile(JSON.stringify(exportData, null, 2), `BA_RaidHistory_${new Date().toISOString().slice(0, 10)}.json`);
  };

  const notifyImportResult = (message: string, isError = false) => {
    setImportMessage(message);
    setImportError(isError);
  };

  const readRaidImportPayload = (raw: string) => {
    const parsed = JSON.parse(raw) as unknown;
    const normalized = Array.isArray(parsed) ? { entries: parsed } : parsed;
    const validated = ProfileDataSchemas.raidHistory.safeParse(normalized);
    if (!validated.success) {
      const issue = validated.error.issues[0];
      const path = issue?.path.length ? ` (${issue.path.join('.')})` : '';
      throw new Error(t('raids.error.invalidFormat') + path);
    }
    return validated.data;
  };

  const importJsonFile = async (file: File) => {
    try {
      const raw = await file.text();
      const payload = readRaidImportPayload(raw);
      replaceEntries(payload.entries);
      notifyImportResult(t('raids.importSuccess', { count: payload.entries.length }));
    } catch (error) {
      notifyImportResult(error instanceof Error ? error.message : t('raids.error.importFailed'), true);
    }
  };

  const handleImportButtonClick = () => {
    importInputRef.current?.click();
  };

  const handleImportInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    await importJsonFile(file);
    event.currentTarget.value = '';
  };

  return (
    <div className="space-y-5 px-3 py-4 sm:px-4 xl:px-0">
      <PageHeader title={t('raids.title')} description={t('raids.description')} />

      <div className="flex flex-wrap gap-2">
        <input ref={importInputRef} type="file" accept="application/json,.json" onChange={(event) => void handleImportInputChange(event)} className="hidden" />
        <button
          type="button"
          onClick={handleImportButtonClick}
          className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          {t('raids.action.import')}
        </button>
        <button
          type="button"
          onClick={exportJson}
          className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          {t('raids.action.export')}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditingEntry(undefined);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded bg-ba-btn-blue px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-ba-btn-blue-dark"
        >
          <HiOutlinePlus className="h-4 w-4" />
          {t('raids.action.addRecord')}
        </button>
      </div>

      {importMessage && (
        <div
          className={`rounded border px-3 py-2 text-sm ${
            importError
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300'
              : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-300'
          }`}
        >
          {importMessage}
        </div>
      )}

      {/* sync banner temporarily hidden */}
      {JSON.stringify(user) == '11' && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
          {t('raids.warning.deviceOnly')}{' '}
          <Link to={localeLink(locale, '/login')} className="underline underline-offset-2">
            {ta('common.logIn')}
          </Link>
          {t('raids.warning.syncSuffix')}
        </div>
      )}

      <>
        <div className="flex border-b border-neutral-200 dark:border-neutral-800">
          {(
            [
              ['records', t('raids.tabs.records')],
              ['stats', t('raids.tabs.stats')],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value)}
              className={`px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === value
                  ? 'border-b-2 border-neutral-950 text-neutral-950 dark:border-neutral-50 dark:text-neutral-50'
                  : 'border-b-2 border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-sm text-neutral-600 dark:text-neutral-300">{t('raids.filters.showing', { visible: filteredEntries.length, total: entries.length })}</div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{t_ui('server')}</span>
              <select
                value={serverFilter}
                onChange={(event) => setServerFilter(event.currentTarget.value as RaidHistoryServer | 'all')}
                className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value="all">All</option>
                {serverOptions.map((server) => (
                  <option key={server.value} value={server.value}>
                    {server.label}
                  </option>
                ))}
              </select>
            </label>
            {activeTab === 'records' && (
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{t('raids.filters.sort')}</span>
                <select
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.currentTarget.value as RaidHistorySort)}
                  className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option value="date_desc">{t('raids.filters.sortByDateDesc')}</option>
                  <option value="date_asc">{t('raids.filters.sortByDateAsc')}</option>
                  <option value="added_desc">{t('raids.filters.sortByAddedDesc')}</option>
                  <option value="added_asc">{t('raids.filters.sortByAddedAsc')}</option>
                </select>
              </label>
            )}
          </div>
        </div>

        {activeTab === 'records' ? (
          <div className="space-y-5">
            <RaidHistoryTable
              entries={filteredEntries}
              raidOptions={raidOptions}
              students={students}
              portraitData={portraitData}
              locale={locale}
              onEdit={(entry) => {
                setEditingEntry(entry);
                setIsModalOpen(true);
              }}
              onDelete={deleteEntry}
            />
          </div>
        ) : (
          <RaidStatsTab entries={filteredEntries} raidOptions={raidOptions} students={students} portraitData={portraitData} locale={locale} />
        )}
      </>

      {isModalOpen && (
        <RaidHistoryFormModal
          raidOptions={raidOptions}
          serverOptions={serverOptions}
          defaultServer={activeProfileServer ?? defaultServer}
          students={students}
          portraitData={portraitData}
          locale={locale}
          initialEntry={editingEntry}
          onClose={() => {
            setIsModalOpen(false);
            setEditingEntry(undefined);
          }}
          onSave={saveEntry}
        />
      )}
    </div>
  );
}
