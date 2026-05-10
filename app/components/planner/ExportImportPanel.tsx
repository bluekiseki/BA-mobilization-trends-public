import type { FC } from 'react';
import { useState, useMemo } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { MdWarning, MdCheckCircle, MdError } from 'react-icons/md';
import { useEventPlanStore, type EventPlan } from '~/store/planner/useEventPlanStore';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { useEquipmentPlanStore } from '~/store/planner/useEquipmentPlanStore';
import { detectAndConvert, tryParseInput, toJustin163, FORMAT_LABEL, AI_CONVERT_PROMPT } from './externalImportConverters';
const EXPORT_VERSION = '2.0.1';

const FullPlannerSchema = z
  .object({
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
  })
  .passthrough();

type FullPlannerState = z.infer<typeof FullPlannerSchema>;
type ImportStrategy = 'all' | 'students_only';

const triggerDownload = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

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
  triggerDownload(JSON.stringify(state, null, 2), `BA_Planner_${new Date().toISOString().slice(0, 10)}.json`);
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
        useGlobalStore.getState().setGrowthPlans(data.globalPlans);
        useGlobalStore.setState({ ownedGifts: data.ownedGifts, materialInventory: data.materialInventory });
        if (data.equipmentPlan) {
          const eqState: any = {};
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
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsText(file);
  });

export const ExportImportPanel: FC = () => {
  const { t } = useTranslation('planner');
  const [inputText, setInputText] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [strategy, setStrategy] = useState<ImportStrategy>('all');
  const [aiCopied, setAiCopied] = useState(false);
  const [inputCopied, setInputCopied] = useState(false);
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
    if (file) {
      handleFileLoad(file);
    }
  };

  const handleExtractMyData = () => {
    const { growthPlans, ownedGifts, materialInventory } = useGlobalStore.getState();
    const eventPlans = useEventPlanStore.getState().plans;
    const { runCounts, farmingDays, normalMultiplier, hardMultiplier, campaignSource } = useEquipmentPlanStore.getState();
    setInputText(
      JSON.stringify(
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
      ),
    );
    notify(t('dataExchange.msgExtracted'));
  };

  const handleConvertToJustin163 = () => {
    const { growthPlans, materialInventory, ownedGifts } = useGlobalStore.getState();
    setInputText(JSON.stringify(toJustin163(growthPlans, materialInventory, ownedGifts), null, 2));
    notify(t('dataExchange.msgConverted'));
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
        const data = detection.data as FullPlannerState;
        useGlobalStore.getState().setGrowthPlans(data.globalPlans);
        useGlobalStore.setState({ ownedGifts: data.ownedGifts, materialInventory: data.materialInventory });
        if (data.equipmentPlan) {
          const eqState: any = {};
          if (data.equipmentPlan.runCounts) eqState.runCounts = data.equipmentPlan.runCounts;
          if (data.equipmentPlan.farmingDays) eqState.farmingDays = data.equipmentPlan.farmingDays;
          if (data.equipmentPlan.normalMultiplier) eqState.normalMultiplier = data.equipmentPlan.normalMultiplier;
          if (data.equipmentPlan.hardMultiplier) eqState.hardMultiplier = data.equipmentPlan.hardMultiplier;
          if (data.equipmentPlan.campaignSource) eqState.campaignSource = data.equipmentPlan.campaignSource;
          useEquipmentPlanStore.setState(eqState);
        }
        if (strategy === 'all' && data.eventPlans) {
          useEventPlanStore.getState().resetAllPlans(data.eventPlans as Record<number, EventPlan>);
        }
        notify(t('dataExchange.msgAppliedOwn', { count: data.globalPlans.length }));
      } else if (detection.type === 'EXTERNAL') {
        const data = detection.data;
        if (data.plans) useGlobalStore.getState().setGrowthPlans(data.plans);
        if (data.materials) useGlobalStore.setState({ materialInventory: data.materials });
        if (data.gifts) useGlobalStore.setState({ ownedGifts: data.gifts });
        notify(t('dataExchange.msgAppliedExternal', { label: detection.label }));
      }
    } catch (e) {
      notify(t('dataExchange.msgError', { message: e instanceof Error ? e.message : 'Unknown error' }), true);
    }
  };

  const canApply = detection?.type === 'OWN' || detection?.type === 'EXTERNAL';
  const isJustin163 = detection?.label?.toLowerCase().includes('justin');

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-700">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('dataExchange.title')}</h2>
      </div>

      <div className="p-4 space-y-3">
        {/* Export */}
        <div className="flex flex-wrap items-center gap-3 border border-gray-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-900">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
            <input type="radio" name="exportFormat" checked={exportFormat === 'own'} onChange={() => setExportFormat('own')} />
            {t('dataExchange.extractMyData')}
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
            <input type="radio" name="exportFormat" checked={exportFormat === 'justin163'} onChange={() => setExportFormat('justin163')} />
            {t('dataExchange.convertToJustin163')}
            <span className="text-xs text-gray-500 dark:text-neutral-500">BETA</span>
          </label>
          <button
            onClick={() => (exportFormat === 'own' ? handleExtractMyData() : handleConvertToJustin163())}
            className="ml-auto text-sm px-3 py-1.5 bg-bluearchive-botton-blue dark:bg-[#5bc4e0] text-gray-900 dark:text-gray-900 font-medium transition-opacity hover:opacity-80"
          >
            {t('dataExchange.export')}
          </button>
        </div>

        {/* Staging textarea with detection badge and drag-n-drop */}
        <div className="relative">
          {detection && (
            <span
              className={`absolute top-2 right-2 z-10 px-2 py-0.5 text-xs font-medium pointer-events-none ${
                detection.type === 'OWN' ? 'text-gray-600 dark:text-gray-400' : detection.type === 'EXTERNAL' ? 'text-gray-600 dark:text-gray-400' : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              {detection.label}
            </span>
          )}
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            placeholder={t('dataExchange.textareaPlaceholder')}
            className={`w-full h-32 text-xs font-mono p-3 border-2 bg-white dark:bg-neutral-950 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none transition-colors ${
              isDragging
                ? 'border-bluearchive-botton-blue dark:border-bluearchive-botton-blue bg-blue-50 dark:bg-blue-950/20'
                : 'border-gray-200 dark:border-neutral-700 focus:ring-1 focus:ring-gray-400'
            }`}
          />
        </div>

        {/* File controls + AI Prompt */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer text-sm px-3 py-1.5 border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 text-gray-700 dark:text-gray-300 hover:bg-bluearchive-botton-blue/10 hover:border-bluearchive-botton-blue dark:hover:bg-bluearchive-botton-blue/20 dark:hover:border-bluearchive-botton-blue transition-colors">
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
            onClick={() => inputText.trim() && triggerDownload(inputText, 'BA_Planner_Data.json')}
            disabled={!inputText.trim()}
            className="text-sm px-3 py-1.5 border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 text-gray-700 dark:text-gray-300 hover:bg-bluearchive-botton-blue/10 hover:border-bluearchive-botton-blue dark:hover:bg-bluearchive-botton-blue/20 dark:hover:border-bluearchive-botton-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('dataExchange.saveToFile')}
          </button>
          <button
            onClick={handleCopyInputText}
            disabled={!inputText.trim()}
            className={`text-sm px-3 py-1.5 border bg-gray-50 dark:bg-neutral-800/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              inputCopied
                ? 'border-bluearchive-botton-blue dark:border-bluearchive-botton-blue text-green-700 dark:text-green-400'
                : 'border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-300 hover:bg-bluearchive-botton-blue/10 hover:border-bluearchive-botton-blue dark:hover:bg-bluearchive-botton-blue/20 dark:hover:border-bluearchive-botton-blue'
            }`}
          >
            {inputCopied ? `✓ ${t('dataExchange.clipboardCopied')}` : t('dataExchange.copyClipboard')}
          </button>
          <button
            onClick={handleCopyAiPrompt}
            className={`ml-auto text-sm px-3 py-1.5 border bg-gray-50 dark:bg-neutral-800/50 transition-colors ${
              aiCopied
                ? 'border-bluearchive-botton-blue dark:border-bluearchive-botton-blue text-green-700 dark:text-green-400'
                : 'border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-300 hover:bg-bluearchive-botton-blue/10 hover:border-bluearchive-botton-blue dark:hover:bg-bluearchive-botton-blue/20 dark:hover:border-bluearchive-botton-blue'
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
          <div className="flex gap-6 text-sm p-3 border border-gray-200 dark:border-neutral-700">
            <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300">
              <input type="radio" checked={strategy === 'all'} onChange={() => setStrategy('all')} />
              {t('dataExchange.strategyAll')}
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-gray-700 dark:text-gray-300">
              <input type="radio" checked={strategy === 'students_only'} onChange={() => setStrategy('students_only')} />
              {t('dataExchange.strategyStudentsOnly')}
            </label>
          </div>
        )}

        {/* Apply — primary CTA */}
        <button
          onClick={handleApply}
          disabled={!canApply}
          className="w-full py-2 text-sm font-medium transition-opacity bg-bluearchive-botton-blue dark:bg-[#5bc4e0] text-gray-900 dark:text-gray-900 hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('dataExchange.applyData')}
        </button>

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
