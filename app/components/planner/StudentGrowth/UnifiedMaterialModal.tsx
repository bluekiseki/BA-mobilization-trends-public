import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { RiCharacterRecognitionLine, RiKeyboardLine } from 'react-icons/ri';
import { ItemIcon } from '../common/Icon';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { CustomNumberInput } from '~/components/CustomInput';
import { groupMaterialNeeds, isInventoryMaterial, FUNGIBLE_POOLS, computeSubPoolXp } from '~/utils/groupMaterialNeeds';
import { NeedsGrid, CATEGORY_I18N, getItemRarity } from './MaterialNeedsSection';
import type { EventData, IconData, IconInfos } from '~/types/plannerData';
import { useNavigate } from 'react-router';
import { equipmentBlueprintId } from '~/data/growthData';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';
import type { TFunction } from 'i18next';

// ── Long-press hook ──────────────────────────────────────────────────────────
function useLongPress(callback: () => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const startedAtRef = useRef(0);
  const tickRef = useRef<() => void>(() => {});

  tickRef.current = () => {
    if (!activeRef.current) return;
    callbackRef.current();
    const elapsed = Date.now() - startedAtRef.current;
    const delay = Math.max(50, 200 - elapsed / 8);
    timerRef.current = setTimeout(tickRef.current, delay);
  };

  useEffect(
    () => () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    callbackRef.current();
    activeRef.current = true;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(tickRef.current, 450);
  };

  const stop = () => {
    activeRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  return { onPointerDown: start, onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop };
}

// ── InventoryCounter ────────────────────────────────────────────────────────
const InventoryCounter = ({ value, onChange, needed }: { value: number; onChange: (v: number) => void; needed?: number }) => {
  const dec = () => onChange(Math.max(0, value - 1));
  const inc = () => onChange(value + 1);
  const decEvents = useLongPress(dec);
  const incEvents = useLongPress(inc);

  const fulfilled = needed !== undefined && value >= needed;
  const partial = needed !== undefined && value > 0 && value < needed;
  const hintColor = fulfilled ? 'text-green-500' : partial ? 'text-red-400' : 'text-neutral-400 dark:text-neutral-500';

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center h-7 rounded overflow-hidden border border-neutral-300 dark:border-neutral-600 text-xs">
        <button
          {...decEvents}
          tabIndex={-1}
          className="w-7 h-full bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 active:bg-neutral-300 dark:active:bg-neutral-500 font-bold select-none touch-manipulation"
        >
          −
        </button>
        <CustomNumberInput
          value={value || null}
          onChange={(v) => onChange(v ?? 0)}
          min={0}
          placeholder="0"
          className="w-11 h-full text-xs bg-white dark:bg-neutral-800 dark:text-neutral-200 focus:bg-blue-50 dark:focus:bg-neutral-700"
        />
        <button
          {...incEvents}
          tabIndex={-1}
          className="w-7 h-full bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 active:bg-neutral-300 dark:active:bg-neutral-500 font-bold select-none touch-manipulation"
        >
          +
        </button>
      </div>
      {needed !== undefined && (
        <span className={`text-[10px] leading-none tabular-nums ${hintColor}`}>
          {value}/{needed}
        </span>
      )}
    </div>
  );
};

// ── Sort bar ────────────────────────────────────────────────────────────────
const SortBar = ({ sortBy, onChange, t }: { sortBy: 'rarity' | 'id'; onChange: (s: 'rarity' | 'id') => void; t: TFunction<'planner'> }) => (
  <div className="flex items-center gap-2 px-4 py-1.5 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
    <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{t('ui.sortLabel')}</span>
    {(['rarity', 'id'] as const).map((s) => (
      <button
        key={s}
        onClick={() => onChange(s)}
        className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${sortBy === s ? 'bg-blue-500 text-white border-blue-500' : 'text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-blue-400'}`}
      >
        {t(s === 'rarity' ? 'ui.sortByRarity' : 'ui.sortById')}
      </button>
    ))}
  </div>
);

// ── Item name lookup ────────────────────────────────────────────────────────
const getItemName = (key: string, icons: IconInfos | undefined, lang: string): string => {
  const [type, id] = key.split('_');
  const info = (icons?.[type as keyof IconInfos] as Record<string, { LocalizeEtc?: { NameEn: string; NameKr: string; NameJp: string; NameTw: string } }> | undefined)?.[id];
  const loc = info?.LocalizeEtc;

  if (!loc) return key;
  if (lang.startsWith('ko')) return loc.NameKr || loc.NameJp;
  if (lang.startsWith('ja')) return loc.NameJp || loc.NameJp;
  if (lang.startsWith('zh')) return loc.NameTw || loc.NameJp;
  return loc.NameEn || loc.NameJp;
};

type Tab = 'needs' | 'inventory';

interface UnifiedMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  calculatedNeeds: Record<string, number>;
  eventData: EventData;
  iconData: IconData;
  title?: string;
  initialTab?: Tab;
}

export const UnifiedMaterialModal = ({ isOpen, onClose, calculatedNeeds, eventData, iconData, title, initialTab = 'needs' }: UnifiedMaterialModalProps) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [filterAll, setFilterAll] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [sortBy, setSortBy] = useState<'rarity' | 'id'>('rarity');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSearchQuery('');
      setConfirmReset(false);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const { materialInventory, updateMaterialInventory, resetMaterialInventory } = useGlobalStore();
  const { t, i18n } = useTranslation('planner');
  const locale = i18n.language as Locale;
  const tStr = t as (k: string) => string;

  const allItemKeys = useMemo(() => {
    const blueprintIds = new Set<number>();
    for (const idList of Object.values(equipmentBlueprintId)) {
      for (const id of idList) {
        blueprintIds.add(id);
      }
    }

    const keys: string[] = [];
    const types = ['Item', 'Equipment', 'Currency'] as const;
    for (const type of types) {
      const typeItems = eventData.icons?.[type];
      if (!typeItems) continue;
      for (const id of Object.keys(typeItems)) {
        const numId = parseInt(id, 10);
        if (type === 'Equipment' && blueprintIds.has(numId)) continue;
        const key = `${type}_${id}`;
        if (isInventoryMaterial(key)) keys.push(key);
      }
    }
    return keys;
  }, [eventData.icons]);

  const allGroups = useMemo(() => {
    const flat: Record<string, number> = {};
    for (const key of allItemKeys) flat[key] = 0;
    return groupMaterialNeeds(flat);
  }, [allItemKeys]);

  const neededGroups = useMemo(() => groupMaterialNeeds(calculatedNeeds), [calculatedNeeds]);
  const baseGroups = filterAll ? allGroups : neededGroups;

  const inventoryGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return baseGroups;
    return baseGroups
      .map(({ categoryKey, items }) => ({
        categoryKey,
        items: items.filter((item) => getItemName(item.key, eventData.icons, i18n.language).toLowerCase().includes(q)),
      }))
      .filter(({ items }) => items.length > 0);
  }, [baseGroups, searchQuery, eventData.icons, i18n.language]);

  const { enteredCount, totalCount } = useMemo(() => {
    const visible = inventoryGroups.flatMap((g) => g.items.map((i) => i.key));
    return {
      enteredCount: visible.filter((k) => (materialInventory[k] ?? 0) > 0).length,
      totalCount: visible.length,
    };
  }, [inventoryGroups, materialInventory]);

  const needsGroups = useMemo(() => groupMaterialNeeds(calculatedNeeds), [calculatedNeeds]);
  const needsItemCount = needsGroups.reduce((s, g) => s + g.items.length, 0);

  if (!isOpen) return null;

  const TAB_BASE = 'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors';
  const TAB_ACTIVE = 'border-blue-500 text-blue-600 dark:text-blue-400';
  const TAB_INACTIVE = 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200';

  return (
    <div className="fixed inset-0 z-200 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-neutral-800 rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-4xl h-[95vh] sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden border dark:border-neutral-700 animate-slide-up sm:animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header tabs */}
        <div className="flex items-center justify-between px-4 pt-2 border-b border-neutral-200 dark:border-neutral-700 shrink-0 bg-white dark:bg-neutral-800">
          <div className="flex gap-0.5">
            <button className={`${TAB_BASE} ${activeTab === 'needs' ? TAB_ACTIVE : TAB_INACTIVE}`} onClick={() => setActiveTab('needs')}>
              {title ?? t('label.materialsForCurrentEvent')}
              <span className="ml-1.5 text-xs bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 rounded-full px-1.5 py-0.5">{needsItemCount}</span>
            </button>
            <button className={`${TAB_BASE} ${activeTab === 'inventory' ? TAB_ACTIVE : TAB_INACTIVE}`} onClick={() => setActiveTab('inventory')}>
              {t('ui.ownedInput')}
            </button>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-xl leading-none px-2 pb-2">
            ×
          </button>
        </div>

        {/* ── Tab: Required materials ───────────────────────────────────────────── */}
        {activeTab === 'needs' && (
          <>
            <SortBar sortBy={sortBy} onChange={setSortBy} t={t} />
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">
              <NeedsGrid groups={needsGroups} materialInventory={materialInventory} eventData={eventData} iconData={iconData} iconSize={14} gap="gap-2.5" sortBy={sortBy} />
            </div>
          </>
        )}

        {/* ── Tab: Input owned quantity ─────────────────────────────────────────── */}
        {activeTab === 'inventory' && (
          <>
            <SortBar sortBy={sortBy} onChange={setSortBy} t={t} />
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
              <div className="flex gap-1">
                <button
                  onClick={() => setFilterAll(true)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterAll ? 'bg-blue-500 text-white border-blue-500' : 'text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-blue-400'}`}
                >
                  {t('ui.inventoryFilterAll')}
                </button>
                <button
                  onClick={() => setFilterAll(false)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${!filterAll ? 'bg-blue-500 text-white border-blue-500' : 'text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-blue-400'}`}
                >
                  {t('ui.inventoryFilterNeeded')}
                </button>
              </div>

              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('ui.inventorySearch')}
                className="flex-1 min-w-0 max-w-xs h-7 px-2.5 text-xs rounded-full border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-blue-400"
              />

              <span className="text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
                {enteredCount}/{totalCount}
              </span>

              <button
                onClick={() => {
                  onClose();
                  void navigate(localeLink(locale, '/planner/item-scanner'));
                }}
                className="text-xs px-2.5 py-1 rounded-full border border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors flex items-center gap-1"
                title="Scan inventory screenshots to auto-input materials"
              >
                <RiCharacterRecognitionLine size={12} />
                Auto-input
              </button>

              <div className="flex items-center gap-1 ml-auto">
                {confirmReset ? (
                  <>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('ui.inventoryResetConfirm')}</span>
                    <button onClick={() => setConfirmReset(false)} className="text-xs px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400">
                      {t('ui.inventoryResetCancel')}
                    </button>
                    <button
                      onClick={() => {
                        resetMaterialInventory();
                        setConfirmReset(false);
                      }}
                      className="text-xs px-2 py-0.5 rounded border border-red-400 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      {t('ui.inventoryResetOk')}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="text-xs px-2.5 py-1 rounded-full border border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 hover:border-red-400 hover:text-red-500 transition-colors"
                  >
                    {t('ui.inventoryReset')}
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-0.5 bg-neutral-100 dark:bg-neutral-800 shrink-0">
              <div className="h-full bg-blue-400 dark:bg-blue-500 transition-all duration-300" style={{ width: `${totalCount > 0 ? (enteredCount / totalCount) * 100 : 0}%` }} />
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5">
              {inventoryGroups.length === 0 ? (
                <p className="text-center text-sm text-neutral-400 dark:text-neutral-500 py-8">{t('ui.inventorySearchEmpty')}</p>
              ) : (
                inventoryGroups.map(({ categoryKey, items }, groupIdx) => {
                  const sorted =
                    sortBy === 'id'
                      ? [...items].sort((a, b) => parseInt(a.key.split('_')[1] ?? '0', 10) - parseInt(b.key.split('_')[1] ?? '0', 10))
                      : [...items].sort((a, b) => getItemRarity(b.key, eventData.icons) - getItemRarity(a.key, eventData.icons));

                  const subPools = FUNGIBLE_POOLS[categoryKey] ?? null;
                  // Per sub-pool summary: total XP needed vs owned across all denominations
                  const poolSummaries = subPools
                    ? subPools
                        .map((sp) => {
                          const keys = sp.keys; // as readonly string[];
                          const neededXp = keys.reduce((sum, key, i) => sum + (calculatedNeeds[key] ?? 0) * sp.xpPer[i], 0);
                          const ownedXp = computeSubPoolXp(sp, materialInventory);
                          const topXpPer = sp.xpPer[sp.xpPer.length - 1];
                          return { neededXp, ownedXp, topXpPer };
                        })
                        .filter(({ neededXp }) => neededXp > 0)
                    : [];

                  return (
                    <div key={categoryKey}>
                      {groupIdx > 0 && <div className="border-t border-neutral-100 dark:border-neutral-800 mb-4" />}
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">{tStr(CATEGORY_I18N[categoryKey] ?? categoryKey)}</div>
                        {poolSummaries.length > 0 && (
                          <div className="flex items-center gap-2 text-[11px]">
                            {poolSummaries.map(({ ownedXp, neededXp, topXpPer }, i) => {
                              const surplus = ownedXp - neededXp;
                              return surplus >= 0 ? (
                                <span key={i} className="text-green-500 font-semibold">
                                  ✓ +{Math.floor(surplus / topXpPer)}
                                </span>
                              ) : (
                                <span key={i} className="text-red-400 font-semibold">
                                  −{Math.ceil(-surplus / topXpPer)} ({(ownedXp / topXpPer).toFixed(1)}/{(neededXp / topXpPer).toFixed(1)})
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end text-[9px] text-neutral-400 dark:text-neutral-500 px-1 pb-1 select-none">
                        <span className="flex items-center gap-1">
                          <RiKeyboardLine className="shrink-0" />
                          <Trans
                            i18nKey="planner:common.tabNavTip"
                            components={{
                              kbd: <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded text-[0.8em] font-mono" />,
                            }}
                          />
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {sorted.map(({ key, amount: _ }) => {
                          const [type, id] = key.split('_');
                          const owned = materialInventory[key] ?? 0;
                          const targetAmt = calculatedNeeds[key];
                          const neededAmt = targetAmt && targetAmt > 0 ? targetAmt : undefined;
                          return (
                            <div key={key} className={`flex flex-col items-center gap-1 transition-opacity hover:opacity-100 ${owned === 0 ? 'opacity-50' : ''}`}>
                              <ItemIcon type={type} itemId={id} amount={owned} size={12} eventData={eventData} iconData={iconData} />
                              <InventoryCounter value={owned} onChange={(v) => updateMaterialInventory(key, v)} needed={neededAmt} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
