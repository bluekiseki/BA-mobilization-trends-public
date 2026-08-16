import { useReducer, useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link } from 'react-router';
import { RiUserSearchLine } from 'react-icons/ri';
import { FaArrowLeft } from 'react-icons/fa';
import { PageHeader } from '~/components/common/PageHeader';
import { ScanProgressPanel } from '~/components/scanner/ScanProgressPanel';
import { LogPanel } from '~/components/scanner/LogPanel';
import { DataCollectionBanner } from '~/components/scanner/DataCollectionBanner';
import { DesktopNotice } from '~/components/scanner/DesktopNotice';
import { DropZone } from '~/components/scanner/DropZone';
import { shouldAutoLoadModels } from '~/scanner/deviceDetect.client';
import type { ModelLoadPhase, ScanPhase, LogEntry } from '~/scanner/types';
import type { Locale } from '~/utils/i18n/config';
import { getLocaleShortName } from '~/utils/i18n/config';
import { cdn } from '~/utils/cdn';
import type { StudentData, StudentPortraitData } from '~/types/plannerData';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { loadAllModels, isModelsLoaded } from '~/scanner-student/modelLoader.client';
import { processVideo } from '~/scanner-student/pipeline.client';
import { toStudentRecords } from '~/scanner-student/studentDatabase';
import { loadReferencePortrait } from '~/scanner-student/portraitLoader';
import { mergeReviewRow } from '~/scanner-student/buildReviewRows';
import { applyReviewRows } from '~/scanner-student/applyReviewRows';
import type { StudentResult, StudentCurrent } from '~/scanner-student/types';
import type { StudentReviewRow } from '~/scanner-student/reviewTypes';
import { ResultsReviewTable } from './ResultsReviewTable';
import { ApplySuccessDialog } from '~/components/scanner/ApplySuccessDialog';
import { projectReviewRow } from '~/scanner-student/reviewImpact';
import { uploadScannerSource } from '~/scanner/r2Upload.client';

const STUDENT_SCANNER_MODEL_VERSION = 'student-v1';

interface State {
  loadPhase: ModelLoadPhase;
  loadStep: string;
  loadPercent: number;
  scanPhase: ScanPhase;
  scanStep: string;
  scanPercent: number;
  videoFile: File | null;
  results: StudentResult[];
  reviewRows: StudentReviewRow[];
  logEntries: LogEntry[];
  logVisible: boolean;
  allowDataCollection: boolean;
  consentDismissed: boolean;
  startTime: number;
}

type Action =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_PROGRESS'; step: string; percent: number }
  | { type: 'MODELS_READY' }
  | { type: 'MODELS_ERROR'; msg: string }
  | { type: 'SCAN_START'; file: File }
  | { type: 'SCAN_PROGRESS'; step: string; percent: number }
  | { type: 'SCAN_RESULT'; result: StudentResult; rows: StudentReviewRow[] }
  | { type: 'SCAN_COMPLETE' }
  | { type: 'SCAN_ERROR'; msg: string }
  | { type: 'SCAN_RESET'; prevUrls: string[] }
  | { type: 'UPDATE_REVIEW_ROWS'; rows: StudentReviewRow[] }
  | { type: 'LOG'; message: string; level?: LogEntry['level'] }
  | { type: 'TOGGLE_LOG' }
  | { type: 'SET_CONSENT'; allow: boolean }
  | { type: 'DISMISS_CONSENT' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loadPhase: 'loading' };
    case 'LOAD_PROGRESS':
      return { ...state, loadPhase: 'loading', loadStep: action.step, loadPercent: action.percent };
    case 'MODELS_READY':
      return { ...state, loadPhase: 'ready', loadPercent: 100 };
    case 'MODELS_ERROR':
      return { ...state, loadPhase: 'error', logEntries: [...state.logEntries, { time: Date.now(), level: 'error', message: action.msg }] };
    case 'SCAN_START':
      return { ...state, scanPhase: 'scanning', videoFile: action.file, results: [], reviewRows: [] };
    case 'SCAN_PROGRESS':
      return { ...state, scanPhase: 'scanning', scanStep: action.step, scanPercent: action.percent };
    case 'SCAN_RESULT':
      return { ...state, results: [...state.results, action.result], reviewRows: action.rows };
    case 'SCAN_COMPLETE':
      return { ...state, scanPhase: 'done' };
    case 'SCAN_ERROR':
      return { ...state, scanPhase: 'error', logEntries: [...state.logEntries, { time: Date.now(), level: 'error', message: action.msg }] };
    case 'SCAN_RESET':
      for (const url of action.prevUrls) URL.revokeObjectURL(url);
      return { ...state, scanPhase: 'idle', videoFile: null, results: [], reviewRows: [] };
    case 'UPDATE_REVIEW_ROWS':
      return { ...state, reviewRows: action.rows };
    case 'LOG':
      return { ...state, logEntries: [...state.logEntries, { time: Date.now(), level: action.level ?? 'info', message: action.message }] };
    case 'TOGGLE_LOG':
      return { ...state, logVisible: !state.logVisible };
    case 'SET_CONSENT':
      return { ...state, allowDataCollection: action.allow, consentDismissed: true };
    case 'DISMISS_CONSENT':
      return { ...state, consentDismissed: true };
    default:
      return state;
  }
}

const INITIAL: State = {
  loadPhase: 'idle',
  loadStep: '',
  loadPercent: 0,
  scanPhase: 'idle',
  scanStep: '',
  scanPercent: 0,
  videoFile: null,
  results: [],
  reviewRows: [],
  logEntries: [],
  logVisible: true,
  allowDataCollection: false,
  consentDismissed: false,
  startTime: Date.now(),
};

export function StudentScannerPage() {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'studentScanner' });
  const { t: tPlanner } = useTranslation('planner');
  const { t: tItemScanner } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const [state, dispatch] = useReducer(reducer, {
    ...INITIAL,
    loadPhase: isModelsLoaded() ? 'ready' : 'idle',
    startTime: Date.now(),
  });

  const [searchParams] = useSearchParams();
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  // Only accept an internal relative path — this comes from the URL, so guard against an
  // open-redirect-style value (e.g. a protocol-relative "//evil.com").
  const returnToRaw = searchParams.get('returnTo');
  const returnTo = returnToRaw && returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : null;

  const growthPlans = useGlobalStore((s) => s.growthPlans);
  const [allStudents, setAllStudents] = useState<StudentData | null>(null);
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData | null>(null);
  const scanningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror state.reviewRows/results synchronously so the per-frame onResult callback (called
  // from inside processVideo's loop) always merges against the latest rows, not a stale
  // closure over `state` from when handleVideo started. resultsRef also fixes a pre-existing
  // bug where the unmount cleanup below only ever saw the initial (empty) state.results.
  const reviewRowsRef = useRef<StudentReviewRow[]>([]);
  const resultsRef = useRef<StudentResult[]>([]);

  useEffect(() => {
    const locale = i18n.language as Locale;
    void (async () => {
      const [studentsRes, portraitsRes] = await Promise.all([fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)), fetch(cdn('/w/students_portrait.json'))]);
      const [students, portraits] = (await Promise.all([studentsRes.json(), portraitsRes.json()])) as [StudentData, StudentPortraitData];
      setAllStudents(students);
      setStudentPortraits(portraits);
    })();
  }, [i18n.language]);

  useEffect(() => {
    if (!isModelsLoaded() && shouldAutoLoadModels()) void startLoading();
  }, []);

  useEffect(() => {
    return () => {
      for (const r of resultsRef.current) URL.revokeObjectURL(r.previewUrl);
    };
  }, []);

  useEffect(() => {
    if (state.scanPhase !== 'scanning') return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.scanPhase]);

  function log(message: string, level: LogEntry['level'] = 'info') {
    dispatch({ type: 'LOG', message, level });
  }

  async function startLoading() {
    dispatch({ type: 'LOAD_START' });
    try {
      await loadAllModels(
        (step, percent) => dispatch({ type: 'LOAD_PROGRESS', step, percent }),
        (msg) => log(msg),
        {
          loadingData: t('loadingModelData'),
          loadingClassifier: t('loadingEquipmentClassifier'),
          loadingOcr: t('loadingTextRecognitionModel'),
          ready: t('loadReady'),
        },
      );
      dispatch({ type: 'MODELS_READY' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'MODELS_ERROR', msg });
      log(msg, 'error');
    }
  }

  // Called once per recognized frame, live as the scan runs — merges into the review table
  // immediately instead of waiting for the whole video to finish.
  function handleResult(result: StudentResult) {
    resultsRef.current = [...resultsRef.current, result];
    const { rows, duplicate } = mergeReviewRow(reviewRowsRef.current, result, growthPlans, studentPortraits ?? {}, allStudents ?? {});
    reviewRowsRef.current = rows;
    dispatch({ type: 'SCAN_RESULT', result, rows });
    if (duplicate) log(`Merged duplicate detection${result.student ? ` for ${result.student.name}` : ''}`);
  }

  async function handleVideo(file: File) {
    if (scanningRef.current) return;
    if (!allStudents || !studentPortraits) {
      log('Student roster/portraits are still loading — try again in a moment.', 'warn');
      return;
    }
    scanningRef.current = true;
    reviewRowsRef.current = [];
    resultsRef.current = [];
    dispatch({ type: 'SCAN_START', file });

    if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
      for (const result of MOCK_RESULTS) handleResult(result);
      dispatch({ type: 'SCAN_COMPLETE' });
      scanningRef.current = false;
      return;
    }

    if (state.allowDataCollection) {
      void uploadScannerSource(file, { source: 'student', modelVersion: STUDENT_SCANNER_MODEL_VERSION }).then((uploaded) => {
        log(uploaded ? `Shared ${file.name} for scanner improvement.` : `Could not share ${file.name}.`, uploaded ? 'info' : 'warn');
      });
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const database = toStudentRecords(allStudents);
      await processVideo(
        file,
        database,
        loadReferencePortrait,
        {
          onLog: log,
          onProgress: (step, percent) => dispatch({ type: 'SCAN_PROGRESS', step, percent }),
          onResult: handleResult,
          progressMessages: {
            fastDecode: (current, duration, candidates) => t('progressFastDecode', { current, duration, candidates }),
            compatDecode: (current, duration, candidates) => t('progressCompatDecode', { current, duration, candidates }),
            compatFallback: t('progressCompatFallback'),
            layoutSample: (current, total) => t('progressLayoutSample', { current, total }),
            deduplicate: (current, total) => t('progressDeduplicate', { current, total }),
            deduplicateRejected: (rejected, current, total) => t('progressDeduplicateRejected', { rejected, current, total }),
            analyzingFrame: (current, total) => t('progressAnalyzingFrame', { current, total }),
          },
        },
        controller.signal,
      );
      dispatch({ type: 'SCAN_COMPLETE' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'SCAN_ERROR', msg });
      log(msg, 'error');
    } finally {
      abortRef.current = null;
      scanningRef.current = false;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  function updateRow(index: number, patch: Partial<StudentReviewRow>) {
    const rows = state.reviewRows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    reviewRowsRef.current = rows;
    dispatch({ type: 'UPDATE_REVIEW_ROWS', rows });
  }

  function handleEditField(index: number, field: keyof Omit<StudentCurrent, 'equipment' | 'potential' | 'affectionExp' | 'eleph'>, value: number) {
    const row = state.reviewRows[index];
    updateRow(index, { recognized: { ...row.recognized, [field]: value }, edited: true });
  }

  function handleEditStarUw(index: number, star: number, uw: number) {
    const row = state.reviewRows[index];
    updateRow(index, {
      recognized: {
        ...row.recognized,
        star,
        uw,
        uwLevel: uw === 0 ? 1 : row.recognized.uwLevel,
      },
      edited: true,
    });
  }

  function handleEditEquipment(index: number, slot: number, value: number) {
    const row = state.reviewRows[index];
    const equipment = [...row.recognized.equipment] as [number | null, number | null, number | null];
    equipment[slot] = value;
    updateRow(index, { recognized: { ...row.recognized, equipment }, edited: true });
  }

  function handleEditPotential(index: number, key: keyof StudentCurrent['potential'], value: number) {
    const row = state.reviewRows[index];
    updateRow(index, { recognized: { ...row.recognized, potential: { ...row.recognized.potential, [key]: value } }, edited: true });
  }

  function handleResetReview(index: number) {
    const row = state.reviewRows[index];
    updateRow(index, { recognized: structuredClone(row.detected), edited: false });
  }

  function handleApply() {
    const count = applyReviewRows(state.reviewRows);
    if (count === 0) return;
    const rows = state.reviewRows.map((row) => {
      if (!row.apply || row.studentId === null) return row;
      const projection = projectReviewRow(row);
      return { ...row, plannerCurrent: projection.current, plannerTarget: projection.target };
    });
    reviewRowsRef.current = rows;
    dispatch({ type: 'UPDATE_REVIEW_ROWS', rows });
    log(tPlanner('dataExchange.msgAppliedOwn', { count }));
    setAppliedCount(count);
  }

  const { loadPhase, loadStep, loadPercent, scanPhase, scanStep, scanPercent } = state;
  const hasReviewRows = state.reviewRows.length > 0;

  return (
    <div className="p-2 sm:p-3">
      {returnTo && (
        <Link to={returnTo} className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 mb-2">
          <FaArrowLeft className="text-xs" />
          {tItemScanner('backButton')}
        </Link>
      )}
      <PageHeader icon={<RiUserSearchLine />} title={t('title')} badge={tItemScanner('beta')} description={t('description')} />

      <DesktopNotice translationKeyPrefix="studentScanner" />

      <LogPanel entries={state.logEntries} visible={state.logVisible} onToggle={() => dispatch({ type: 'TOGGLE_LOG' })} startTime={state.startTime} translationKeyPrefix="itemScanner" />

      <DataCollectionBanner
        allowDataCollection={state.allowDataCollection}
        onToggle={(allow) => dispatch({ type: 'SET_CONSENT', allow })}
        translationKeyPrefix="studentScanner"
        detailsLabel={tItemScanner('dataCollectionDetails')}
      />

      {loadPhase === 'loading' && <ScanProgressPanel step={loadStep} percent={loadPercent} />}
      {scanPhase === 'scanning' && (
        <div className="mb-3 space-y-1">
          <ScanProgressPanel step={scanStep} percent={Math.round(scanPercent)} />
          <button
            onClick={handleCancel}
            className="rounded border border-neutral-300 dark:border-neutral-600 px-3 py-1 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {t('cancelScan')}
          </button>
        </div>
      )}

      {loadPhase !== 'ready' && loadPhase !== 'loading' && (
        <div className="mb-3 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-3 sm:p-4 space-y-3">
          <div className="space-y-2">
            <button
              onClick={() => void startLoading()}
              className="rounded px-4 py-1.5 text-sm font-semibold text-neutral-900 transition-colors hover:opacity-90"
              style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}
            >
              {tItemScanner('loadModels')} {tItemScanner('loadModelsSize', { size: 48 })}
            </button>
            {loadPhase === 'error' && <p className="text-xs text-red-400">{tItemScanner('loadError')}</p>}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-600">{t('modelInfo')}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-600">
            {t('technicalInfo')}{' '}
            <a href="https://github.com/microsoft/onnxruntime" target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-600 dark:hover:text-neutral-500">
              {tItemScanner('onnxRuntime')}
            </a>
          </p>
        </div>
      )}

      {loadPhase !== 'loading' && scanPhase !== 'scanning' && (
        <DropZone
          disabled={loadPhase !== 'ready' || !allStudents || !studentPortraits}
          disabledLabel={loadPhase === 'ready' && (!allStudents || !studentPortraits) ? t('loadingRosterLabel') : tItemScanner('dropZoneDisabled')}
          accept="video/*"
          translationKeyPrefix="studentScanner"
          exampleSrc={state.videoFile === null ? cdn('/student-scanner/example-scan.mp4') : undefined}
          onFiles={(files) => void handleVideo(files[0])}
          onRejected={() => log(t('unsupportedFile'), 'warn')}
        />
      )}

      {hasReviewRows && (
        <div className="mt-2 sm:mt-4">
          <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200 mb-2 sm:mb-3">
            {t('resultsTitle')}
            <span className="ml-2 text-sm font-normal text-neutral-500">{t('resultsCount', { count: state.reviewRows.length })}</span>
          </h2>
          <ResultsReviewTable
            rows={state.reviewRows}
            onToggleApply={(index) => updateRow(index, { apply: !state.reviewRows[index].apply })}
            onEditField={handleEditField}
            onEditStarUw={handleEditStarUw}
            onEditEquipment={handleEditEquipment}
            onEditPotential={handleEditPotential}
            onReset={handleResetReview}
            onApply={handleApply}
          />
        </div>
      )}
      {appliedCount !== null && (
        <ApplySuccessDialog
          title={tPlanner('dataExchange.applyData')}
          description={tPlanner('dataExchange.msgAppliedOwn', { count: appliedCount })}
          stayLabel={tPlanner('common.continueReview')}
          doneLabel={tPlanner('common.done')}
          returnTo={returnTo}
          onClose={() => setAppliedCount(null)}
        />
      )}
    </div>
  );
}

const MOCK_RESULTS: StudentResult[] = [
  {
    frameIndex: 0,
    time: 1.2,
    previewUrl: '',
    sourceSize: { width: 1, height: 1 },
    reviewOverlay: [],
    student: { id: 10000, name: 'Mock Student', confidence: 0.92 },
    candidates: 1,
    current: {
      level: 87,
      star: 5,
      uw: 2,
      uwLevel: 30,
      ex: 5,
      normal: 8,
      passive: 10,
      sub: 8,
      affection: 30,
      affectionExp: 0,
      eleph: 0,
      equipment: [7, 7, 6],
      gear: 1,
      potential: { hp: 15, atk: 12, heal: 0 },
    },
    raw: {
      skills: {
        ex: { raw: 'MAX', max: true, level: null },
        normal: { raw: '8', max: false, level: 8 },
        passive: { raw: 'MAX', max: true, level: null },
        sub: { raw: '8', max: false, level: 8 },
      },
      equipment: [
        { type: 'Hat', tier: 7, raw: 'T7' },
        { type: 'Gloves', tier: 7, raw: 'T7' },
        { type: 'Watch', tier: 6, raw: 'T6' },
      ],
      gear: { equipped: true, raw: 'T1' },
      potential: { hp: '15', attack: '12', defense: '', heal: '0' },
    },
    debug: { bulletType: 'Explosion', armorType: 'LightArmor', position: 'Back', positionRaw: 'BACK', squadType: 'Main', terrain: ['A', 'B', 'D'], terrainConflict: false, layout: 'voted' },
  },
  {
    frameIndex: 1,
    time: 4.6,
    previewUrl: '',
    sourceSize: { width: 1, height: 1 },
    reviewOverlay: [],
    student: null,
    candidates: 0,
    current: {
      level: null,
      star: null,
      uw: null,
      uwLevel: null,
      ex: null,
      normal: null,
      passive: null,
      sub: null,
      affection: null,
      affectionExp: 0,
      eleph: 0,
      equipment: [null, null, null],
      gear: null,
      potential: { hp: null, atk: null, heal: null },
    },
    raw: {
      skills: {
        ex: { raw: '', max: false, level: null },
        normal: { raw: '', max: false, level: null },
        passive: { raw: '', max: false, level: null },
        sub: { raw: '', max: false, level: null },
      },
      equipment: [],
      gear: { equipped: null, raw: '' },
      potential: { hp: '', attack: '', defense: '', heal: '' },
    },
    debug: { terrainConflict: false, layout: 'per-frame' },
  },
];
