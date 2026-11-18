// Tactical Challenge records (unlisted, English-only until release): recognizes Combat Report screenshots locally,
// stores the matches, and looks up which of my attack teams worked against an opponent's defense.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import type { Student, StudentData } from '~/types/plannerData';
import { PageHeader } from '~/components/common/PageHeader';
import { ScanProgressPanel } from '~/components/common/ScanProgressPanel';
import { StudentPickerBottomSheet } from '~/features/my/arena/components/StudentPickerBottomSheet';
import { readSavedArenaServer, useArenaHistoryStore } from '~/features/my/arena/useArenaHistoryStore';
import { useAuthStore } from '~/store/authStore';
import { getDefaultProfileServer } from '~/utils/profileServer';
import { arenaDownloadMb, decodeImageFile, loadArenaModels, regionToDataUrl } from '~/features/my/arena/scan/modelLoader.client';
import { ArenaParseError, parseCombatReport, type ArenaModels } from '~/features/my/arena/scan/combatReport';
import { draftFromReport, orderedReportSlots, recordSignature, updateTeamSlot } from '~/features/my/arena/scan/records';
import { seasonKeyFor, toArenaServer } from '~/features/my/arena/scan/seasons';
import { loadSeason } from '~/features/my/arena/scan/storage';
import { ArenaReviewItem, type ReviewItem } from './ArenaReviewItem';
import { ArenaHistory } from './ArenaHistory';
import { ArenaSeasonBar } from './ArenaSeasonBar';
import { ArenaSearch, EMPTY_SEARCH, slotsFromTeam, toQuery } from './ArenaSearch';

type LoadPhase = 'idle' | 'loading' | 'ready' | 'error';

const LOAD_MESSAGES = { loadingData: 'Downloading models…', loadingClassifier: 'Loading student recognizer…', loadingOcr: 'Loading OCR model…', ready: 'Ready' };

function useStudents(locale: Locale) {
  const [students, setStudents] = useState<Record<string, Student>>({});
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const studentsRes = await fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`));
      const studentData: StudentData = await studentsRes.json();
      if (cancelled) return;
      setStudents(studentData);
    })();
    return () => {
      cancelled = true;
    };
  }, [locale]);
  return { students };
}

export function ArenaPage() {
  const { i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { students } = useStudents(locale);
  const records = useArenaHistoryStore((s) => s.records);
  const seasonKey = useArenaHistoryStore((s) => s.seasonKey);
  const server = useArenaHistoryStore((s) => s.server);
  const setServer = useArenaHistoryStore((s) => s.setServer);
  const addRecords = useArenaHistoryStore((s) => s.addRecords);
  // A logged-in profile fixes the server (JP or the shared global schedule); otherwise the saved choice or the locale default.
  const profileServer = useAuthStore((s) => s.user?.profiles?.find((p) => p.id === s.activeProfileId)?.server ?? null);
  useEffect(() => {
    if (profileServer) void setServer(toArenaServer(profileServer));
    // The locale only seeds the first choice, which is remembered so switching language later keeps the server.
    else void setServer(readSavedArenaServer() ?? toArenaServer(getDefaultProfileServer(locale)), true);
  }, [profileServer, locale, setServer]);

  const [loadPhase, setLoadPhase] = useState<LoadPhase>('idle');
  const [loadStep, setLoadStep] = useState('');
  const [loadPercent, setLoadPercent] = useState(0);
  const modelsRef = useRef<ArenaModels | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [picking, setPicking] = useState<{ key: string; side: 'me' | 'opponent'; index: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState(EMPTY_SEARCH);
  const query = useMemo(() => toQuery(search), [search]);

  const savedSignatures = useMemo(() => new Set(records.map(recordSignature)), [records]);

  // The ko locale also loads the Korean recognizer, since Korean nicknames are unreadable with the default charset.
  const koreanOcr = locale === 'ko';

  const startLoading = async () => {
    setLoadPhase('loading');
    try {
      modelsRef.current = await loadArenaModels(
        (step, percent) => {
          setLoadStep(step);
          setLoadPercent(percent);
        },
        LOAD_MESSAGES,
        koreanOcr,
      );
      setLoadPhase('ready');
    } catch (error) {
      console.error(error);
      setLoadPhase('error');
    }
  };

  const handleFiles = async (files: File[]) => {
    const models = modelsRef.current;
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!models || !server || !images.length) return;
    // Duplicate checks run against the season each report belongs to, loaded once per season.
    const signaturesBySeason = new Map<string, Set<string>>([[seasonKey, savedSignatures]]);
    const signaturesFor = async (key: string) => {
      const known = signaturesBySeason.get(key);
      if (known) return known;
      const loaded = new Set((await loadSeason(key)).map(recordSignature));
      signaturesBySeason.set(key, loaded);
      return loaded;
    };
    setFailures([]);
    setProgress({ done: 0, total: images.length });
    for (const [i, file] of images.entries()) {
      try {
        const image = await decodeImageFile(file);
        const report = await parseCombatReport(image, models);
        const draft = draftFromReport(report, file.lastModified || Date.now());
        const b = report.right.nicknameBox;
        const duplicate = (await signaturesFor(seasonKeyFor(server, draft.capturedAt))).has(recordSignature(draft));
        setReviews((prev) => [
          ...prev,
          {
            key: `${file.name}-${file.lastModified}-${i}-${Date.now()}`,
            fileName: file.name,
            draft,
            myScores: orderedReportSlots(report.left.slots).map((s) => s.score),
            opponentScores: orderedReportSlots(report.right.slots).map((s) => s.score),
            nicknameImage: draft.opponent.nickname ? undefined : regionToDataUrl(image, b.x0, b.y0, b.x1, b.y1),
            duplicate,
          },
        ]);
      } catch (error) {
        if (!(error instanceof ArenaParseError)) console.error(error);
        setFailures((prev) => [...prev, file.name]);
      }
      setProgress({ done: i + 1, total: images.length });
    }
    setProgress(null);
  };

  const updateReview = (item: ReviewItem) => setReviews((prev) => prev.map((r) => (r.key === item.key ? item : r)));
  const removeReview = (key: string) => setReviews((prev) => prev.filter((r) => r.key !== key));
  // The nickname crop is a review-time hint only; records keep just the typed nickname.
  const toRecord = ({ draft }: ReviewItem) => ({ ...draft, id: crypto.randomUUID(), savedAt: Date.now() });
  const saveReviews = (items: ReviewItem[]) => {
    void addRecords(items.map(toRecord));
    const keys = new Set(items.map((item) => item.key));
    setReviews((prev) => prev.filter((r) => !keys.has(r.key)));
  };

  const pickStudent = (id: number) => {
    if (!picking) return;
    const item = reviews.find((r) => r.key === picking.key);
    if (item) {
      const sideKey = picking.side === 'me' ? 'me' : 'opponent';
      const scoresKey = picking.side === 'me' ? 'myScores' : 'opponentScores';
      updateReview({
        ...item,
        draft: { ...item.draft, [sideKey]: updateTeamSlot(item.draft[sideKey], picking.index, { id }) },
        [scoresKey]: item[scoresKey].map((s, i) => (i === picking.index ? 1 : s)),
      });
    }
    setPicking(null);
  };

  const ready = loadPhase === 'ready' && progress === null;

  return (
    <div className="p-2 pb-10 sm:p-3">
      <PageHeader
        title="My Tactical Challenge Records"
        description="Save matches from Combat Report screenshots and look up attack teams per opponent. All processing runs on your device."
        badge="Beta"
      />

      <ArenaSeasonBar serverLocked={profileServer !== null} />

      {/* Lookup comes first: it is what players need mid-match; uploading new reports is secondary. */}
      <ArenaSearch records={records} search={search} onSearchChange={setSearch} students={students} locale={locale} />

      <h2 className="mb-2 text-base font-semibold text-neutral-800 dark:text-neutral-200">Add Combat Reports</h2>

      {loadPhase === 'loading' && <ScanProgressPanel step={loadStep} percent={loadPercent} />}
      {(loadPhase === 'idle' || loadPhase === 'error') && (
        <div className="mb-3 space-y-2">
          <button
            type="button"
            onClick={() => void startLoading()}
            className="px-4 py-1.5 text-sm font-semibold text-neutral-900 hover:opacity-90"
            style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}
          >
            Load models (approx. {arenaDownloadMb(koreanOcr)}MB)
          </button>
          {loadPhase === 'error' && <p className="text-xs text-red-600 dark:text-red-400">Failed to load models. Check the browser console for details.</p>}
        </div>
      )}

      {progress && <ScanProgressPanel step={`Recognizing (${progress.done}/${progress.total})`} percent={Math.round((progress.done / progress.total) * 100)} />}

      <div
        role="button"
        tabIndex={ready ? 0 : -1}
        onClick={() => ready && inputRef.current?.click()}
        onKeyDown={(e) => ready && (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (ready) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (ready) void handleFiles(Array.from(e.dataTransfer.files));
        }}
        className={`flex min-h-20 flex-col items-center justify-center border-2 border-dashed px-4 py-4 text-center text-sm transition-colors ${
          ready
            ? `cursor-pointer text-neutral-700 dark:text-neutral-300 ${dragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-neutral-300 hover:border-blue-500 dark:border-neutral-700'}`
            : 'cursor-not-allowed border-neutral-200 text-neutral-400 dark:border-neutral-800 dark:text-neutral-600'
        }`}
      >
        <p className="font-semibold">{loadPhase === 'ready' ? 'Drop Combat Report screenshots here' : 'Load models first to enable scanning'}</p>
        {loadPhase === 'ready' && <p className="mt-1 text-xs text-neutral-500">or click to browse — multiple files supported</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>

      {failures.length > 0 && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">No Combat Report found: {failures.join(', ')}</p>}

      {reviews.length > 0 && (
        <section className="mt-6">
          <div className="mb-1 flex items-center gap-3">
            <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">Recognition results</h2>
            <span className="text-sm text-neutral-500">{reviews.length}</span>
            <button
              type="button"
              onClick={() => saveReviews(reviews.filter((r) => !r.duplicate))}
              className="ml-auto px-3 py-1 text-xs font-semibold text-neutral-900 hover:opacity-90"
              style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}
            >
              Save all
            </button>
          </div>
          {reviews.map((item) => (
            <ArenaReviewItem
              key={item.key}
              item={item}
              students={students}
              onChange={updateReview}
              onPick={(side, index) => setPicking({ key: item.key, side, index })}
              onSave={() => saveReviews([item])}
              onDiscard={() => removeReview(item.key)}
            />
          ))}
        </section>
      )}

      <ArenaHistory
        query={query}
        students={students}
        locale={locale}
        onUseTeam={(team, side, battle) => {
          setSearch({ ...search, nickname: '', slots: slotsFromTeam(team), side, battle });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <StudentPickerBottomSheet isOpen={picking !== null} students={students} locale={locale} onSelect={(s) => pickStudent(s.id)} onClose={() => setPicking(null)} />
    </div>
  );
}
