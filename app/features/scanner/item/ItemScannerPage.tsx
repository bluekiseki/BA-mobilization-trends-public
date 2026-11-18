import { useReducer, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link } from 'react-router';
import { FaArrowLeft } from 'react-icons/fa';
import { PageHeader } from '~/components/common/PageHeader';
import { loadIcons, isIconsLoaded } from '~/features/scanner/core/iconLoader';
import { createDownloadTracker } from '~/utils/downloadTracker';
import { processFile, isVideoFile } from '~/features/scanner/item/pipeline.client';
import { shouldAutoLoadModels } from '~/features/scanner/core/deviceDetect.client';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import type { ModelLoadPhase, ScanPhase, LogEntry, ScanEntry, ComparisonRow, IconEntry } from '~/features/scanner/core/types';
import type { PreviewFrame } from '~/features/scanner/video/types';
import { MAX_VIDEO_DURATION_SECONDS } from '~/features/scanner/video/errors';
import { makeInstanceKey } from '~/features/scanner/core/types';
import { aggregateConfirmedDetails } from '~/features/scanner/item/aggregateQuantities';
import { ScanOverlayViewer } from './ScanOverlayViewer';
import { LiveScanPreview } from './LiveScanPreview';
import { FilteredResultsSection } from './FilteredResultsSection';
import { ScanProgressPanel } from '~/components/common/ScanProgressPanel';
import { LogPanel } from '~/features/scanner/core/LogPanel';
import { DataCollectionBanner } from '~/features/scanner/core/DataCollectionBanner';
import { DesktopNotice } from '~/features/scanner/core/DesktopNotice';
import { DropZone } from '~/features/scanner/core/DropZone';
import { RiCharacterRecognitionLine } from 'react-icons/ri';
import { uploadScannerSource } from '~/features/scanner/core/r2Upload.client';
import { cdn } from '~/utils/cdn';

const ITEM_SCANNER_MODEL_VERSION = 'item-v2';
// Total download size in MB (uncompressed): icons 6.7 + cell detect 10.2 + embed model 9.9 + qty model 2.4
// + embeddings 5.8 + ORT wasm 28.3. The libav fallback (~3.1) is excluded.
const PREPARATION_SIZE_MB = 63;

interface State {
  loadPhase: ModelLoadPhase;
  loadStep: string;
  loadPercent: number;
  scanPhase: ScanPhase;
  scanStep: string;
  scanPercent: number;
  imageScanResults: ScanEntry[];
  scanNotice: string | null; // last scan problem shown inline above the drop zone
  logEntries: LogEntry[];
  logVisible: boolean;
  editedValues: Record<string, number>; // keyed by detection instance: `${imageId}::${index}`
  confirmedItems: Record<string, boolean>; // keyed by detection instance: `${imageId}::${index}`
  finalOverrides: Record<string, number>; // keyed by inventoryKey — final aggregate table override
  startTime: number;
  allowDataCollection: boolean;
  consentDismissed: boolean;
}

type Action =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_PROGRESS'; step: string; percent: number }
  | { type: 'MODELS_READY' }
  | { type: 'MODELS_ERROR'; msg: string }
  | { type: 'SCAN_PROGRESS'; step: string; percent: number }
  | { type: 'SCAN_RESULT'; result: ScanEntry }
  | { type: 'SCAN_NOTICE'; message: string | null }
  | { type: 'SCAN_DONE' }
  | { type: 'SCAN_RESET'; prevUrls: string[] }
  | { type: 'DELETE_IMAGE'; id: string }
  | { type: 'EDIT_VALUE'; key: string; value: number }
  | { type: 'CONFIRM_ITEM'; key: string }
  | { type: 'UNCONFIRM_ITEM'; key: string }
  | { type: 'EDIT_FINAL_VALUE'; key: string; value: number }
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
      return {
        ...state,
        loadPhase: 'error',
        logEntries: [...state.logEntries, { time: Date.now(), level: 'error', message: action.msg }],
      };
    case 'SCAN_PROGRESS':
      return { ...state, scanPhase: 'scanning', scanStep: action.step, scanPercent: action.percent };
    case 'SCAN_NOTICE':
      return { ...state, scanNotice: action.message };
    case 'SCAN_RESULT':
      return { ...state, imageScanResults: [...state.imageScanResults, action.result] };
    case 'SCAN_DONE':
      return { ...state, scanPhase: 'done' };
    case 'SCAN_RESET':
      for (const url of action.prevUrls) URL.revokeObjectURL(url);
      return {
        ...state,
        scanPhase: 'idle',
        imageScanResults: [],
        editedValues: {},
        confirmedItems: {},
        finalOverrides: {},
      };
    case 'DELETE_IMAGE': {
      const toDelete = state.imageScanResults.find((r) => r.id === action.id);
      if (toDelete) URL.revokeObjectURL(toDelete.objectUrl);
      const prefix = `${action.id}::`;
      const stripPrefixed = <T,>(rec: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(rec).filter(([key]) => !key.startsWith(prefix)));
      return {
        ...state,
        imageScanResults: state.imageScanResults.filter((r) => r.id !== action.id),
        editedValues: stripPrefixed(state.editedValues),
        confirmedItems: stripPrefixed(state.confirmedItems),
      };
    }
    case 'EDIT_VALUE':
      return { ...state, editedValues: { ...state.editedValues, [action.key]: action.value } };
    case 'CONFIRM_ITEM':
      return { ...state, confirmedItems: { ...state.confirmedItems, [action.key]: true } };
    case 'UNCONFIRM_ITEM':
      return { ...state, confirmedItems: { ...state.confirmedItems, [action.key]: false } };
    case 'EDIT_FINAL_VALUE':
      return { ...state, finalOverrides: { ...state.finalOverrides, [action.key]: action.value } };
    case 'LOG':
      return {
        ...state,
        logEntries: [...state.logEntries, { time: Date.now(), level: action.level ?? 'info', message: action.message }],
      };
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
  imageScanResults: [],
  scanNotice: null,
  logEntries: [],
  logVisible: true,
  editedValues: {},
  confirmedItems: {},
  finalOverrides: {},
  startTime: Date.now(),
  allowDataCollection: false,
  consentDismissed: false,
};

export function ItemScannerPage() {
  const { t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const { t: t_ui } = useTranslation('ui');
  const [state, dispatch] = useReducer(reducer, {
    ...INITIAL,
    loadPhase: isIconsLoaded() ? 'ready' : 'idle',
    startTime: Date.now(),
  });

  const { materialInventory, ownedGifts } = useGlobalStore();
  const scanningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const previewDrawRef = useRef<((frame: PreviewFrame) => void) | null>(null);
  const registerPreview = useCallback((draw: ((frame: PreviewFrame) => void) | null) => {
    previewDrawRef.current = draw;
  }, []);

  const [searchParams] = useSearchParams();
  // Only accept an internal relative path — this comes from the URL, so guard against an
  // open-redirect-style value (e.g. a protocol-relative "//evil.com").
  const returnToRaw = searchParams.get('returnTo');
  const returnTo = returnToRaw && returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : null;

  useEffect(() => {
    // Prepare metadata on desktop; model sessions are created for the selected file type.
    if (!isIconsLoaded() && shouldAutoLoadModels()) {
      void startLoading();
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const r of state.imageScanResults) URL.revokeObjectURL(r.objectUrl);
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
      const tracker = createDownloadTracker({ icons: 6_700_000 }, 0, 100, (percent) => dispatch({ type: 'LOAD_PROGRESS', step: t('loadingIconData'), percent }));
      await loadIcons(tracker.report('icons'));
      tracker.settle('icons');
      dispatch({ type: 'MODELS_READY' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'MODELS_ERROR', msg });
      log(msg, 'error');
    }
  }

  async function handleFiles(files: File[]) {
    if (scanningRef.current) return;
    scanningRef.current = true;
    const abort = new AbortController();
    abortRef.current = abort;
    dispatch({ type: 'SCAN_NOTICE', message: null });

    const shareSources = state.allowDataCollection;

    for (let i = 0; i < files.length; i++) {
      if (abort.signal.aborted) break;
      try {
        const result = await processFile(files[i], {
          compatPlaybackLabel: t('compatPlaybackMode'),
          onCompatPlayback: () => dispatch({ type: 'SCAN_NOTICE', message: `${files[i].name}: ${t('compatPlaybackWarning')}` }),
          webCodecsLabel: t('fastDecodeMode'),
          onLog: log,
          onProgress: (step, innerPercent) =>
            dispatch({
              type: 'SCAN_PROGRESS',
              step: files.length > 1 ? `[${i + 1}/${files.length}] ${step}` : step,
              percent: Math.round((i * 100 + innerPercent) / files.length),
            }),
          onPreview: (frame) => {
            if (previewDrawRef.current) previewDrawRef.current(frame);
            else frame.bitmap.close();
          },
          signal: abort.signal,
          modelMessages: {
            loadingData: t_ui('loadingModelData'),
            loadingCellDetector: t('loadingCellDetector'),
            loadingClassifier: t('loadingClassifier'),
            loadingOcr: t('loadingOcrModel'),
            ready: t_ui('loadReady'),
          },
        });
        dispatch({ type: 'SCAN_RESULT', result });
        if (shareSources) {
          void uploadScannerSource(files[i], { source: 'item', modelVersion: ITEM_SCANNER_MODEL_VERSION }).then((uploaded) => {
            log(uploaded ? `Shared ${files[i].name} for scanner improvement.` : `Could not share ${files[i].name}.`, uploaded ? 'info' : 'warn');
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          log(`Scan cancelled at ${files[i].name}.`, 'warn');
          break;
        }
        const message = err instanceof Error ? err.message : String(err);
        log(`Error processing ${files[i].name}: ${message}`, 'error');
        const code = err instanceof Error ? (err as { code?: string }).code : undefined;
        if (code === 'VIDEO_TOO_LONG') dispatch({ type: 'SCAN_NOTICE', message: t('videoTooLong', { minutes: MAX_VIDEO_DURATION_SECONDS / 60 }) });
        else if (code === 'VIDEO_UNSUPPORTED') dispatch({ type: 'SCAN_NOTICE', message: t('videoUnsupported') });
        else if (isVideoFile(files[i])) dispatch({ type: 'SCAN_NOTICE', message: t('videoScanFailed') });
      }
    }

    abortRef.current = null;
    dispatch({ type: 'SCAN_DONE' });
    scanningRef.current = false;
  }

  const comparisonRows = useMemo(
    () => deriveComparisonRows(state.imageScanResults, state.confirmedItems, state.editedValues, materialInventory, ownedGifts),
    [state.imageScanResults, state.confirmedItems, state.editedValues, materialInventory, ownedGifts],
  );

  const loadPhase: ModelLoadPhase = state.loadPhase;
  const { loadStep, loadPercent, scanPhase, scanStep, scanPercent } = state;

  return (
    <div className="p-2">
      {returnTo && (
        <Link to={returnTo} className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 mb-2">
          <FaArrowLeft className="text-xs" />
          {t('backButton')}
        </Link>
      )}
      <PageHeader icon={<RiCharacterRecognitionLine />} title={t('title')} badge={t('beta')} description={t('description')} />

      <DesktopNotice />

      <LogPanel entries={state.logEntries} visible={state.logVisible} onToggle={() => dispatch({ type: 'TOGGLE_LOG' })} startTime={state.startTime} />

      <DataCollectionBanner allowDataCollection={state.allowDataCollection} onToggle={(allow) => dispatch({ type: 'SET_CONSENT', allow })} />

      {loadPhase === 'loading' && <ScanProgressPanel step={loadStep} percent={loadPercent} />}
      {scanPhase === 'scanning' && (
        <ScanProgressPanel step={scanStep} percent={scanPercent} onCancel={() => abortRef.current?.abort()} cancelLabel={t_ui('cancel')}>
          <LiveScanPreview register={registerPreview} />
        </ScanProgressPanel>
      )}

      {loadPhase !== 'ready' && loadPhase !== 'loading' && (
        <div className="mb-3 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-3 sm:p-4 space-y-3">
          <div className="space-y-2">
            <button
              onClick={() => void startLoading()}
              className="rounded px-4 py-1.5 text-sm font-semibold text-neutral-900 transition-colors hover:opacity-90"
              style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}
            >
              {t('prepareScanner')} {t('loadModelsSize', { size: PREPARATION_SIZE_MB })}
            </button>
            {loadPhase === 'error' && <p className="text-xs text-red-400">{t('loadError')}</p>}
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-600">{t('modelInfo', { size: PREPARATION_SIZE_MB })}</p>

          <p className="text-xs text-neutral-500 dark:text-neutral-600">
            {t('technicalInfo')}{' '}
            <a href="https://github.com/microsoft/onnxruntime" target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-600 dark:hover:text-neutral-500">
              {t('onnxRuntime')}
            </a>{' '}
            (MIT)
          </p>
        </div>
      )}

      {state.scanNotice && (
        <p role="status" className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          {state.scanNotice}
        </p>
      )}

      {loadPhase !== 'loading' && scanPhase !== 'scanning' && (
        <DropZone
          disabled={loadPhase !== 'ready'}
          disabledLabel={t('prepareScannerFirst')}
          accept="image/*,video/*"
          multiple
          exampleSrc={state.imageScanResults.length === 0 ? cdn('/item-scanner/example-scan.mp4') : undefined}
          onFiles={(e) => void handleFiles(e)}
          onRejected={() => log(t('unsupportedFile', { keyPrefix: 'studentScanner' }), 'warn')}
        />
      )}

      {state.imageScanResults.length > 0 && (
        <div className="mt-2 sm:mt-4">
          {/* Per-image: image overlay + immediate item list */}
          <ScanOverlayViewer
            onUnconfirm={(key) => dispatch({ type: 'UNCONFIRM_ITEM', key })}
            imageScanResults={state.imageScanResults}
            editedValues={state.editedValues}
            confirmedItems={state.confirmedItems}
            onEdit={(key, value) => dispatch({ type: 'EDIT_VALUE', key, value })}
            onConfirm={(key) => dispatch({ type: 'CONFIRM_ITEM', key })}
            onDeleteImage={(id) => dispatch({ type: 'DELETE_IMAGE', id })}
          />

          {/* Consolidated comparison + apply */}
          {comparisonRows.length > 0 && (
            <div className="mt-2 sm:mt-4">
              <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200 mb-2 sm:mb-3">
                {t('allRecognizedItems')}
                <span className="ml-2 text-sm font-normal text-neutral-500">
                  {comparisonRows.length} {t('items')} · {comparisonRows.filter((r) => r.confirmed).length} {t('confirmed')}
                </span>
              </h2>
              <FilteredResultsSection
                rows={comparisonRows}
                finalOverrides={state.finalOverrides}
                returnTo={returnTo}
                onEditFinal={(key, value) => dispatch({ type: 'EDIT_FINAL_VALUE', key, value })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function lookupCurrent(icon: IconEntry, inventoryKey: string, materialInventory: Record<string, number>, ownedGifts: Record<string, number>): number {
  if (icon.isGift) return ownedGifts[icon.numericId] ?? 0;
  // Blueprint (10xxxx) -> Equipment (xxxx) conversion: fetch regular equipment value
  let lookupKey = inventoryKey;
  const match = inventoryKey.match(/^Equipment_(\d+)$/);
  if (match) {
    const id = parseInt(match[1]);
    if (id >= 100000 && id < 200000) {
      lookupKey = `Equipment_${id - 100000}`;
    }
  }
  return materialInventory[lookupKey] ?? 0;
}

/**
 * Combines duplicated cells within each file (summed or max per item kind) and takes the maximum file total per item.
 */
function deriveComparisonRows(
  results: ScanEntry[],
  confirmedItems: Record<string, boolean>,
  editedValues: Record<string, number>,
  materialInventory: Record<string, number>,
  ownedGifts: Record<string, number>,
): ComparisonRow[] {
  const iconByKey = new Map<string, IconEntry>();
  const maxConfidence: Record<string, number> = {};
  const details = aggregateConfirmedDetails(results, confirmedItems, editedValues);
  const hasPositiveInstance = new Set<string>();

  for (const img of results) {
    img.results.forEach((r, index) => {
      if (!r.icon) return;
      const key = r.icon.inventoryKey;
      iconByKey.set(key, r.icon);
      maxConfidence[key] = Math.max(maxConfidence[key] ?? 0, r.similarity);
      if ((editedValues[makeInstanceKey(img.id, index)] ?? r.quantity) > 0) hasPositiveInstance.add(key);
    });
  }

  return Array.from(iconByKey.entries())
    .filter(([key]) => hasPositiveInstance.has(key))
    .map(([inventoryKey, icon]) => ({
      inventoryKey,
      icon,
      current: lookupCurrent(icon, inventoryKey, materialInventory, ownedGifts),
      scanned: details.get(inventoryKey)?.total ?? 0,
      edited: details.get(inventoryKey)?.total ?? 0,
      duplicates: (details.get(inventoryKey)?.parts.length ?? 0) > 1 ? details.get(inventoryKey) : undefined,
      confidence: maxConfidence[inventoryKey] ?? 0,
      confirmed: details.has(inventoryKey),
    }));
}
