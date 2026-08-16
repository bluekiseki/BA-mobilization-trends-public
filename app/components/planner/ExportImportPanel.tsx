import type { FC } from 'react';
import { useState, useMemo } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { MdWarning, MdCheckCircle, MdError } from 'react-icons/md';
import { useEventPlanStore, type EventPlan } from '~/store/planner/useEventPlanStore';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import { useEquipmentPlanStore } from '~/store/planner/useEquipmentPlanStore';
import { detectAndConvert, tryParseInput, toJustin163, FORMAT_LABEL, AI_CONVERT_PROMPT } from './externalImportConverters';
import { downloadFile } from '~/utils/downloadFile';

const EXPORT_VERSION = '2.0.1';

const FullPlannerSchema = z.looseObject({
  eventPlans: z.record(z.string(), z.any()),
  globalPlans: z.array(z.any()),
  ownedGifts: z.record(z.string(), z.number()),
  materialInventory: z.record(z.string(), z.number()),
  equipmentPlan: z
    .object({
      runCounts: z.record(z.string(), z.number()).optional(),
      farmingDays: z.number().optional(),
      normalMultiplier: z.number().optional(),
      hardMultiplier: z.number().optional(),
      campaignSource: z.enum(['kr', 'jp']).optional(),
    })
    .optional(),
  version: z.string(),
  timestamp: z.string().optional(),
});

type FullPlannerState = z.infer<typeof FullPlannerSchema>;
type ImportStrategy = 'all' | 'students_only';

interface EquipmentPlanUpdate {
  runCounts?: Record<string, number>;
  farmingDays?: number;
  normalMultiplier?: number;
  hardMultiplier?: number;
  campaignSource?: 'kr' | 'jp';
}

export const exportPlannerData = (): void => {
  const { growthPlans, ownedGifts, materialInventory } = useGlobalStore.getState();
  const eventPlans = useEventPlanStore.getState().plans;
  const { runCounts, farmingDays, normalMultiplier, hardMultiplier, campaignSource } = useEquipmentPlanStore.getState();
  const state: FullPlannerState = {
    eventPlans,
    globalPlans: growthPlans,
    ownedGifts,
    materialInventory,
    equipmentPlan: {
      runCounts,
      farmingDays,
      normalMultiplier,
      hardMultiplier,
      campaignSource,
    },
    timestamp: new Date().toISOString(),
    version: EXPORT_VERSION,
  };
  downloadFile(JSON.stringify(state, null, 2), `BA_Planner_${new Date().toISOString().slice(0, 10)}.json`);
};

export const importPlannerData = (file: File): Promise<void> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result;
        if (typeof text !== 'string') throw new Error('File content is not a valid string.');
        const parsed = FullPlannerSchema.safeParse(JSON.parse(text));
        if (!parsed.success) throw new Error('Invalid planner data format.');
        const data = parsed.data;
        useGlobalStore.getState().setGrowthPlans(data.globalPlans as GrowthPlan[]);
        useGlobalStore.setState({ ownedGifts: data.ownedGifts, materialInventory: data.materialInventory });
        if (data.equipmentPlan) {
          const eqState: EquipmentPlanUpdate = {};
          if (data.equipmentPlan.runCounts) eqState.runCounts = data.equipmentPlan.runCounts;
          if (data.equipmentPlan.farmingDays) eqState.farmingDays = data.equipmentPlan.farmingDays;
          if (data.equipmentPlan.normalMultiplier) eqState.normalMultiplier = data.equipmentPlan.normalMultiplier;
          if (data.equipmentPlan.hardMultiplier) eqState.hardMultiplier = data.equipmentPlan.hardMultiplier;
          if (data.equipmentPlan.campaignSource) eqState.campaignSource = data.equipmentPlan.campaignSource;
          useEquipmentPlanStore.setState(eqState);
        }
        if (data.eventPlans) {
          useEventPlanStore.getState().resetAllPlans(data.eventPlans as Record<number, EventPlan>);
        }
        resolve();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsText(file);
  });

const buildOwnJson = (): string => {
  const { growthPlans, ownedGifts, materialInventory } = useGlobalStore.getState();
  const eventPlans = useEventPlanStore.getState().plans;
  const { runCounts, farmingDays, normalMultiplier, hardMultiplier, campaignSource } = useEquipmentPlanStore.getState();
  return JSON.stringify(
    {
      eventPlans,
      globalPlans: growthPlans,
      ownedGifts,
      materialInventory,
      equipmentPlan: { runCounts, farmingDays, normalMultiplier, hardMultiplier, campaignSource },
      timestamp: new Date().toISOString(),
      version: EXPORT_VERSION,
    },
    null,
    2,
  );
};

const buildJustin163Json = (): string => {
  const { growthPlans, ownedGifts, materialInventory } = useGlobalStore.getState();
  return JSON.stringify(toJustin163(growthPlans, materialInventory, ownedGifts), null, 2);
};

export const ExportImportPanel: FC = () => {
  const { t } = useTranslation('planner');
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [inputText, setInputText] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [strategy, setStrategy] = useState<ImportStrategy>('all');
  const [aiCopied, setAiCopied] = useState(false);
  const [inputCopied, setInputCopied] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<'own' | 'justin163'>('own');
  const [isDragging, setIsDragging] = useState(false);

  const detection = useMemo(() => {
    if (!inputText.trim()) return null;
    try {
      const json = tryParseInput(inputText);
      const own = FullPlannerSchema.safeParse(json);
      if (own.success) return { type: 'OWN' as const, label: t('dataExchange.formatOwn'), data: own.data };
      const ext = detectAndConvert(json);
      if (ext.format !== 'unknown') return { type: 'EXTERNAL' as const, label: FORMAT_LABEL[ext.format], data: ext };
      return { type: 'UNKNOWN' as const, label: t('dataExchange.formatUnknown'), data: null };
    } catch {
      return { type: 'INVALID' as const, label: t('dataExchange.formatInvalid'), data: null };
    }
  }, [inputText, t]);

  const notify = (msg: string, error = false) => {
    setMessage(msg);
    setIsError(error);
  };

  const switchTab = (tab: 'export' | 'import') => {
    setActiveTab(tab);
    setMessage('');
  };

  const handleFileLoad = (file: File) => {
    if (!file.type.includes('json')) {
      notify(t('dataExchange.invalidFileType'), true);
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => setInputText((evt.target?.result as string) ?? '');
    reader.onerror = () => notify(t('dataExchange.fileReadError'), true);
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileLoad(file);
  };

  const handleExportDownload = () => {
    if (exportFormat === 'own') {
      exportPlannerData();
    } else {
      downloadFile(buildJustin163Json(), `BA_Justin163_${new Date().toISOString().slice(0, 10)}.json`);
    }
  };

  const handleExportCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportFormat === 'own' ? buildOwnJson() : buildJustin163Json());
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2000);
    } catch {
      notify(t('dataExchange.msgClipboardFailed'), true);
    }
  };

  const handleCopyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_CONVERT_PROMPT);
      setAiCopied(true);
      setTimeout(() => setAiCopied(false), 2000);
    } catch {
      notify(t('dataExchange.msgClipboardFailed'), true);
    }
  };

  const handleCopyInputText = async () => {
    try {
      await navigator.clipboard.writeText(inputText);
      setInputCopied(true);
      setTimeout(() => setInputCopied(false), 2000);
    } catch {
      notify(t('dataExchange.msgClipboardFailed'), true);
    }
  };

  const handleApply = () => {
    if (!detection?.data) return;
    try {
      if (detection.type === 'OWN') {
        const data = detection.data as unknown;
        const plannerData = data as FullPlannerState;
        useGlobalStore.getState().setGrowthPlans(plannerData.globalPlans as GrowthPlan[]);
        useGlobalStore.setState({ ownedGifts: plannerData.ownedGifts, materialInventory: plannerData.materialInventory });
        if (plannerData.equipmentPlan) {
          const eqState: EquipmentPlanUpdate = {};
          if (plannerData.equipmentPlan.runCounts) eqState.runCounts = plannerData.equipmentPlan.runCounts;
          if (plannerData.equipmentPlan.farmingDays) eqState.farmingDays = plannerData.equipmentPlan.farmingDays;
          if (plannerData.equipmentPlan.normalMultiplier) eqState.normalMultiplier = plannerData.equipmentPlan.normalMultiplier;
          if (plannerData.equipmentPlan.hardMultiplier) eqState.hardMultiplier = plannerData.equipmentPlan.hardMultiplier;
          if (plannerData.equipmentPlan.campaignSource) eqState.campaignSource = plannerData.equipmentPlan.campaignSource;
          useEquipmentPlanStore.setState(eqState);
        }
        if (strategy === 'all' && plannerData.eventPlans) {
          useEventPlanStore.getState().resetAllPlans(plannerData.eventPlans as Record<number, EventPlan>);
        }
        notify(t('dataExchange.msgAppliedOwn', { count: plannerData.globalPlans.length }));
      } else if (detection.type === 'EXTERNAL') {
        const data = detection.data as unknown;
        const externalData = data as { plans?: GrowthPlan[]; materials?: Record<string, number>; gifts?: Record<string, number> };
        if (externalData.plans) useGlobalStore.getState().setGrowthPlans(externalData.plans);
        if (externalData.materials) useGlobalStore.setState({ materialInventory: externalData.materials });
        if (externalData.gifts) useGlobalStore.setState({ ownedGifts: externalData.gifts });
        notify(t('dataExchange.msgAppliedExternal', { label: detection.label }));
      }
    } catch (e) {
      notify(t('dataExchange.msgError', { message: e instanceof Error ? e.message : 'Unknown error' }), true);
    }
  };

  const canApply = detection?.type === 'OWN' || detection?.type === 'EXTERNAL';
  const isJustin163 = detection?.label?.toLowerCase().includes('justin');

  const tabClass = (tab: 'export' | 'import') =>
    `px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${
      activeTab === tab
        ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
        : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'
    }`;

  const secondaryBtnClass =
    'text-sm px-3 py-1.5 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300 hover:bg-ba-btn-blue/10 hover:border-ba-btn-blue dark:hover:bg-ba-btn-blue/20 dark:hover:border-ba-btn-blue transition-colors';

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-3 border-b border-neutral-200 dark:border-neutral-700">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 pb-2">{t('dataExchange.title')}</h2>
        <div className="flex">
          <button onClick={() => switchTab('export')} className={tabClass('export')}>
            {t('dataExchange.tabExport')}
          </button>
          <button onClick={() => switchTab('import')} className={tabClass('import')}>
            {t('dataExchange.tabImport')}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {activeTab === 'export' && (
          <>
            {/* Format selection */}
            <div className="border border-neutral-200 dark:border-neutral-700 p-3 space-y-2 bg-white dark:bg-neutral-900">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300">
                <input type="radio" name="exportFormat" checked={exportFormat === 'own'} onChange={() => setExportFormat('own')} />
                {t('dataExchange.extractMyData')}
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300">
                <input type="radio" name="exportFormat" checked={exportFormat === 'justin163'} onChange={() => setExportFormat('justin163')} />
                {t('dataExchange.convertToJustin163')}
                <span className="text-xs text-neutral-500">BETA</span>
              </label>
            </div>

            {/* Justin163 data loss warning */}
            {exportFormat === 'justin163' && (
              <div className="flex items-center gap-2 text-xs p-3 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-sm">
                <MdWarning className="text-amber-600 dark:text-amber-500 shrink-0" size={16} />
                <span className="text-amber-700 dark:text-amber-300">{t('dataExchange.justin163Warning')}</span>
              </div>
            )}

            {/* Export actions */}
            <div className="flex gap-2">
              <button
                onClick={handleExportDownload}
                className="flex-1 py-2 text-sm font-medium transition-opacity bg-ba-btn-blue dark:bg-ba-btn-blue-dark text-neutral-900 dark:text-neutral-900 hover:opacity-80"
              >
                {t('dataExchange.saveToFile')}
              </button>
              <button
                onClick={() => void handleExportCopy()}
                className={`text-sm px-3 py-1.5 border bg-neutral-50 dark:bg-neutral-800/50 transition-colors ${
                  exportCopied
                    ? 'border-ba-btn-blue dark:border-ba-btn-blue text-green-700 dark:text-green-400'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-ba-btn-blue/10 hover:border-ba-btn-blue dark:hover:bg-ba-btn-blue/20 dark:hover:border-ba-btn-blue'
                }`}
              >
                {exportCopied ? `✓ ${t('dataExchange.clipboardCopied')}` : t('dataExchange.copyClipboard')}
              </button>
            </div>
          </>
        )}

        {activeTab === 'import' && (
          <>
            {/* Staging textarea with detection badge and drag-n-drop */}
            <div className="relative">
              {detection && <span className="absolute top-2 right-2 z-10 px-2 py-0.5 text-xs font-medium pointer-events-none text-neutral-600 dark:text-neutral-400">{detection.label}</span>}
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                placeholder={t('dataExchange.textareaPlaceholder')}
                className={`w-full h-32 text-xs font-mono p-3 border-2 bg-white dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 placeholder-neutral-400 dark:placeholder-neutral-600 resize-none focus:outline-none transition-colors ${
                  isDragging ? 'border-ba-btn-blue dark:border-ba-btn-blue bg-blue-50 dark:bg-blue-950/20' : 'border-neutral-200 dark:border-neutral-700 focus:ring-1 focus:ring-neutral-400'
                }`}
              />
            </div>

            {/* File controls + AI Prompt */}
            <div className="flex flex-wrap items-center gap-2">
              <label className={`cursor-pointer ${secondaryBtnClass}`}>
                {t('dataExchange.loadFile')}
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileLoad(file);
                      e.target.value = '';
                    }
                  }}
                  className="hidden"
                />
              </label>
              <button
                onClick={() => inputText.trim() && downloadFile(inputText, 'BA_Planner_Data.json')}
                disabled={!inputText.trim() || detection?.type === 'INVALID'}
                className={`${secondaryBtnClass} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {t('dataExchange.saveToFile')}
              </button>
              <button
                onClick={() => void handleCopyInputText()}
                disabled={!inputText.trim()}
                className={`text-sm px-3 py-1.5 border bg-neutral-50 dark:bg-neutral-800/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  inputCopied
                    ? 'border-ba-btn-blue dark:border-ba-btn-blue text-green-700 dark:text-green-400'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-ba-btn-blue/10 hover:border-ba-btn-blue dark:hover:bg-ba-btn-blue/20 dark:hover:border-ba-btn-blue'
                }`}
              >
                {inputCopied ? `✓ ${t('dataExchange.clipboardCopied')}` : t('dataExchange.copyClipboard')}
              </button>
              <button
                onClick={() => void handleCopyAiPrompt()}
                className={`ml-auto text-sm px-3 py-1.5 border bg-neutral-50 dark:bg-neutral-800/50 transition-colors ${
                  aiCopied
                    ? 'border-ba-btn-blue dark:border-ba-btn-blue text-green-700 dark:text-green-400'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-ba-btn-blue/10 hover:border-ba-btn-blue dark:hover:bg-ba-btn-blue/20 dark:hover:border-ba-btn-blue'
                }`}
              >
                {aiCopied ? `✓ ${t('dataExchange.aiPromptCopied')}` : t('dataExchange.copyAiPrompt')}
              </button>
            </div>

            {/* Justin163 data loss warning */}
            {isJustin163 && (
              <div className="flex items-center gap-2 text-xs p-3 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-sm">
                <MdWarning className="text-amber-600 dark:text-amber-500 shrink-0" size={16} />
                <span className="text-amber-700 dark:text-amber-300">{t('dataExchange.justin163Warning')}</span>
              </div>
            )}

            {/* Import strategy selector */}
            {detection?.type === 'OWN' && (
              <div className="flex gap-6 text-sm p-3 border border-neutral-200 dark:border-neutral-700">
                <label className="flex items-center gap-2 cursor-pointer text-neutral-700 dark:text-neutral-300">
                  <input type="radio" checked={strategy === 'all'} onChange={() => setStrategy('all')} />
                  {t('dataExchange.strategyAll')}
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-neutral-700 dark:text-neutral-300">
                  <input type="radio" checked={strategy === 'students_only'} onChange={() => setStrategy('students_only')} />
                  {t('dataExchange.strategyStudentsOnly')}
                </label>
              </div>
            )}

            {/* Apply — primary CTA */}
            <button
              onClick={handleApply}
              disabled={!canApply}
              className="w-full py-2 text-sm font-medium transition-opacity bg-ba-btn-blue dark:bg-ba-btn-blue-dark text-neutral-900 dark:text-neutral-900 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('dataExchange.applyData')}
            </button>
          </>
        )}

        {message && (
          <div
            className={`flex items-center gap-2 p-3 text-sm border rounded-sm ${
              isError
                ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                : 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
            }`}
          >
            {isError ? <MdError className="shrink-0" size={18} /> : <MdCheckCircle className="shrink-0" size={18} />}
            <span>{message}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportImportPanel;
