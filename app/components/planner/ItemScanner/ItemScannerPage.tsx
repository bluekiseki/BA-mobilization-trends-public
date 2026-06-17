import { useReducer, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ContactButton from '~/components/ContactButton';
import { PageHeader } from '~/components/common/PageHeader';
import { issuesURL } from '~/data/livedataServer.json';
import { loadAllModels, isModelsLoaded } from '~/scanner/modelLoader.client';
import { processFile } from '~/scanner/pipeline.client';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import type { ModelLoadPhase, ScanPhase, LogEntry, ImageScanResult, AggregatedScan, ComparisonRow } from '~/scanner/types';
import { DesktopNotice } from './DesktopNotice';
import { ScanProgressPanel } from './ScanProgressPanel';
import { LogPanel } from './LogPanel';
import { DropZone } from './DropZone';
import { ScanOverlayViewer } from './ScanOverlayViewer';
import { FilteredResultsSection } from './FilteredResultsSection';
import { RiCharacterRecognitionLine } from 'react-icons/ri';

interface State {
  loadPhase: ModelLoadPhase;
  loadStep: string;
  loadPercent: number;
  scanPhase: ScanPhase;
  scanStep: string;
  scanPercent: number;
  imageScanResults: ImageScanResult[];
  logEntries: LogEntry[];
  logVisible: boolean;
  editedValues: Record<string, number>;
  confirmedItems: Record<string, boolean>;
  comparisonRows: ComparisonRow[];
  startTime: number;
}

type Action =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_PROGRESS'; step: string; percent: number }
  | { type: 'MODELS_READY' }
  | { type: 'MODELS_ERROR'; msg: string }
  | { type: 'SCAN_PROGRESS'; step: string; percent: number }
  | { type: 'SCAN_RESULT'; result: ImageScanResult }
  | { type: 'SCAN_DONE'; rows: ComparisonRow[] }
  | { type: 'SCAN_RESET'; prevUrls: string[] }
  | { type: 'DELETE_IMAGE'; fileName: string }
  | { type: 'EDIT_VALUE'; key: string; value: number }
  | { type: 'CONFIRM_ITEM'; key: string }
  | { type: 'UNCONFIRM_ITEM'; key: string }
  | { type: 'UPDATE_COMPARISON_ROWS'; rows: ComparisonRow[] }
  | { type: 'LOG'; message: string; level?: LogEntry['level'] }
  | { type: 'TOGGLE_LOG' };

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
    case 'SCAN_RESULT':
      return { ...state, imageScanResults: [...state.imageScanResults, action.result] };
    case 'SCAN_DONE':
      return { ...state, scanPhase: 'done', comparisonRows: action.rows };
    case 'SCAN_RESET':
      for (const url of action.prevUrls) URL.revokeObjectURL(url);
      return {
        ...state,
        scanPhase: 'idle',
        imageScanResults: [],
        comparisonRows: [],
        editedValues: {},
        confirmedItems: {},
      };
    case 'DELETE_IMAGE': {
      const toDelete = state.imageScanResults.find((r) => r.fileName === action.fileName);
      if (toDelete) URL.revokeObjectURL(toDelete.objectUrl);
      return {
        ...state,
        imageScanResults: state.imageScanResults.filter((r) => r.fileName !== action.fileName),
      };
    }
    case 'EDIT_VALUE':
      return { ...state, editedValues: { ...state.editedValues, [action.key]: action.value } };
    case 'CONFIRM_ITEM':
      return { ...state, confirmedItems: { ...state.confirmedItems, [action.key]: true } };
    case 'UNCONFIRM_ITEM':
      return { ...state, confirmedItems: { ...state.confirmedItems, [action.key]: false } };
    case 'UPDATE_COMPARISON_ROWS':
      return { ...state, comparisonRows: action.rows };
    case 'LOG':
      return {
        ...state,
        logEntries: [...state.logEntries, { time: Date.now(), level: action.level ?? 'info', message: action.message }],
      };
    case 'TOGGLE_LOG':
      return { ...state, logVisible: !state.logVisible };
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
  logEntries: [],
  logVisible: true,
  editedValues: {},
  confirmedItems: {},
  comparisonRows: [],
  startTime: Date.now(),
};

export function ItemScannerPage() {
  const { t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const [state, dispatch] = useReducer(reducer, {
    ...INITIAL,
    loadPhase: isModelsLoaded() ? 'ready' : 'idle',
    startTime: Date.now(),
  });

  const { materialInventory, ownedGifts } = useGlobalStore();
  const scanningRef = useRef(false);

  useEffect(() => {
    return () => {
      for (const r of state.imageScanResults) URL.revokeObjectURL(r.objectUrl);
    };
  }, []);

  function log(message: string, level: LogEntry['level'] = 'info') {
    dispatch({ type: 'LOG', message, level });
  }

  async function startLoading() {
    dispatch({ type: 'LOAD_START' });
    try {
      await loadAllModels(
        (step, percent) => dispatch({ type: 'LOAD_PROGRESS', step, percent }),
        (msg) => log(msg),
      );
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

    const newResults: ImageScanResult[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const result = await processFile(files[i], {
          onLog: log,
          onProgress: (step, innerPercent) =>
            dispatch({
              type: 'SCAN_PROGRESS',
              step: files.length > 1 ? `[${i + 1}/${files.length}] ${step}` : step,
              percent: Math.round((i * 100 + innerPercent) / files.length),
            }),
        });
        dispatch({ type: 'SCAN_RESULT', result });
        newResults.push(result);
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        log(`Error processing ${files[i].name}: ${err}`, 'error');
      }
    }

    const allResults = [...state.imageScanResults, ...newResults];
    const rows = buildComparisonRows(allResults, materialInventory, ownedGifts);
    dispatch({ type: 'SCAN_DONE', rows });
    scanningRef.current = false;
  }

  const loadPhase: ModelLoadPhase = state.loadPhase;
  const { loadStep, loadPercent, scanPhase, scanStep, scanPercent } = state;

  return (
    <div className="p-2">
      <PageHeader icon={<RiCharacterRecognitionLine />} title={t('title')} badge={t('beta')} description={t('description')} />

      <DesktopNotice />

      {loadPhase === 'loading' && <ScanProgressPanel step={loadStep} percent={loadPercent} />}
      {scanPhase === 'scanning' && <ScanProgressPanel step={scanStep} percent={scanPercent} />}

      <LogPanel entries={state.logEntries} visible={state.logVisible} onToggle={() => dispatch({ type: 'TOGGLE_LOG' })} startTime={state.startTime} />

      {loadPhase !== 'ready' && loadPhase !== 'loading' && (
        <div className="mb-3 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-3 sm:p-4 space-y-2 sm:space-y-3">
          <div>
            <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-1">{t('modelInfo')}</p>
            <p className="text-xs text-neutral-500">{t('modelFiles')}</p>
          </div>

          <div className="rounded border border-sky-300/50 dark:border-sky-800/50 bg-sky-50 dark:bg-sky-950/30 px-2.5 py-2 sm:px-3 space-y-1">
            <p className="text-xs text-sky-700 dark:text-sky-300 font-medium">{t('processingLocal')}</p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {t('noServerData')}{' '}
              <a href={issuesURL} target="_blank" rel="noopener noreferrer" className="underline text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300">
                {t('github')}
              </a>
              {' / '}
              <ContactButton>
                <span className="underline text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 cursor-pointer">{t('email')}</span>
              </ContactButton>
            </p>
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-600">
            {t('technicalInfo')}{' '}
            <a href="https://github.com/microsoft/onnxruntime" target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-600 dark:hover:text-neutral-500">
              {t('onnxRuntime')}
            </a>{' '}
            (MIT)
          </p>

          <div>
            <button
              onClick={() => void startLoading()}
              className="rounded px-4 py-1.5 text-sm font-semibold text-neutral-900 transition-colors hover:opacity-90"
              style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}
            >
              {t('loadModels')}
            </button>
            {loadPhase === 'error' && <p className="text-xs text-red-400 mt-2">{t('loadError')}</p>}
          </div>
        </div>
      )}

      <DropZone disabled={loadPhase !== 'ready' || scanPhase === 'scanning'} onFiles={(e) => void handleFiles(e)} />

      {loadPhase === 'ready' && (
        <p className="text-xs text-neutral-500 dark:text-neutral-600 mt-2">
          {t('localProcessing')}{' '}
          <a href={issuesURL} target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-600 dark:hover:text-neutral-500">
            GitHub
          </a>
          {' / '}
          <ContactButton>
            <span className="underline hover:text-neutral-600 dark:hover:text-neutral-500 cursor-pointer">{t('email')}</span>
          </ContactButton>
        </p>
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
            onDeleteImage={(fileName) => dispatch({ type: 'DELETE_IMAGE', fileName })}
          />

          {/* Consolidated comparison + apply */}
          {state.comparisonRows.length > 0 && (
            <div className="mt-2 sm:mt-4">
              <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-200 mb-2 sm:mb-3">
                {t('allRecognizedItems')}
                <span className="ml-2 text-sm font-normal text-neutral-500">
                  {state.comparisonRows.length} {t('items')} · {Object.keys(state.confirmedItems).length} {t('confirmed')}
                </span>
              </h2>
              <FilteredResultsSection
                rows={state.comparisonRows}
                editedValues={state.editedValues}
                confirmedItems={state.confirmedItems}
                onEdit={(key, value) => dispatch({ type: 'EDIT_VALUE', key, value })}
                onApply={(updatedRows) => dispatch({ type: 'UPDATE_COMPARISON_ROWS', rows: updatedRows })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function buildComparisonRows(results: ImageScanResult[], materialInventory: Record<string, number>, ownedGifts: Record<string, number>): ComparisonRow[] {
  const aggregated: AggregatedScan = {};
  const iconByKey = new Map<string, NonNullable<ImageScanResult['results'][number]['icon']>>();
  const maxConfidence: Record<string, number> = {};

  for (const img of results) {
    for (const r of img.results) {
      if (!r.icon || r.quantity <= 0) continue;
      const key = r.icon.inventoryKey;
      aggregated[key] = (aggregated[key] ?? 0) + r.quantity;
      iconByKey.set(key, r.icon);
      maxConfidence[key] = Math.max(maxConfidence[key] ?? 0, r.similarity);
    }
  }

  return Object.entries(aggregated).map(([inventoryKey, scanned]) => {
    const icon = iconByKey.get(inventoryKey) ?? null;
    let current = 0;
    if (icon?.isGift) {
      current = ownedGifts[icon.numericId] ?? 0;
    } else {
      // Blueprint (10xxxx) -> Equipment (xxxx) conversion: fetch regular equipment value
      let lookupKey = inventoryKey;
      const match = inventoryKey.match(/^Equipment_(\d+)$/);
      if (match) {
        const id = parseInt(match[1]);
        if (id >= 100000 && id < 200000) {
          lookupKey = `Equipment_${id - 100000}`;
        }
      }
      current = materialInventory[lookupKey] ?? 0;
    }
    return {
      inventoryKey,
      icon,
      current,
      scanned,
      edited: scanned,
      confidence: maxConfidence[inventoryKey] ?? 0,
    };
  });
}
