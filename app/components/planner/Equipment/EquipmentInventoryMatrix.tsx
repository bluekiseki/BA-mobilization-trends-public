import { useCallback, useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { RiCharacterRecognitionLine, RiKeyboardLine } from 'react-icons/ri';
import { CustomNumberInput } from '~/components/CustomInput';
import { equipmentBlueprintId, equipmentId } from '~/data/growthData';
import { getTierFromEquipmentId } from '~/utils/blueprintUtils';
import type { IconData } from '~/types/plannerData';
import { EquipmentItemIcon } from './common';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';

const CATEGORIES = ['Hat', 'Gloves', 'Shoes', 'Bag', 'Badge', 'Hairpin', 'Charm', 'Watch', 'Necklace'] as const;
const CAT_SHORT: Record<string, string> = {
  Hat: 'Hat',
  Gloves: 'Glv',
  Shoes: 'Sho',
  Bag: 'Bag',
  Badge: 'Bdg',
  Hairpin: 'Pin',
  Charm: 'Chm',
  Watch: 'Wch',
  Necklace: 'Nkl',
};

type EquipCat = (typeof CATEGORIES)[number];

interface EquipmentInventoryMatrixProps {
  allFarmableItems: string[];
  inventory: Record<string, number>;
  setInventoryItem: (key: string, amount: number) => void;
  demandMap: Record<string, number>;
  onClearAll: () => void;
  iconData: IconData;
}

export const EquipmentInventoryMatrix: React.FC<EquipmentInventoryMatrixProps> = ({ allFarmableItems, inventory, setInventoryItem, demandMap, onClearAll, iconData }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation('planner');
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const itemScannerLink = `${localeLink(locale, '/scanner/item')}?returnTo=${encodeURIComponent(returnTo)}`;
  const farmableSet = useMemo(() => new Set(allFarmableItems), [allFarmableItems]);

  // console.log('normalizeBluprintToEquipment',allFarmableItems)

  const availableTiers = useMemo(() => {
    const tiers = new Set<number>();
    for (const key of allFarmableItems) {
      const id = Number(key.split('_')[1]);
      const tier = getTierFromEquipmentId(id);
      if (tier > 0) tiers.add(tier);
    }
    return Array.from(tiers).sort((a, b) => a - b);
  }, [allFarmableItems]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const delta: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    document.querySelector<HTMLInputElement>(`[data-eq-row="${row + d[0]}"][data-eq-col="${col + d[1]}"]`)?.focus();
  }, []);

  const getKey = (cat: EquipCat, tier: number): string => {
    const ids = equipmentId[cat];
    const id = ids[tier - 1];
    return id ? `Equipment_${id}` : '';
  };

  if (availableTiers.length === 0) {
    return <div className="px-3 py-4 text-[11px] text-neutral-400 dark:text-neutral-500 text-center">{t_ui('loading')}</div>;
  }

  const hasAnyInventory = Object.values(inventory).some((v) => v > 0);

  return (
    <div>
      <div className="flex justify-between items-center px-3 py-1 gap-2">
        <button
          onClick={() => {
            void navigate(itemScannerLink);
          }}
          className="text-[10px] px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors flex items-center gap-1"
          title="Scan inventory screenshots to auto-input equipment materials"
        >
          <RiCharacterRecognitionLine size={10} />
          Auto-input
        </button>
        {hasAnyInventory && (
          <button onClick={onClearAll} className="text-[10px] text-red-400 hover:text-red-500 dark:text-red-500 dark:hover:text-red-400 transition-colors">
            {t_ui('reset')}
          </button>
        )}
      </div>
      <div className="overflow-x-auto px-1.5 pb-2">
        <table className="w-full border-collapse" style={{ fontSize: 10 }}>
          <thead>
            <tr>
              <th className="sticky left-0 bg-white dark:bg-neutral-900 w-7 text-left pb-1 z-10" />
              {availableTiers.map((tier) => (
                <th key={tier} className="text-center font-mono font-semibold text-neutral-400 dark:text-neutral-500 pb-1" style={{ minWidth: 30 }}>
                  T{tier}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat, rowIndex) => {
              const equipIds = equipmentBlueprintId[cat];
              const t1EquipId = equipIds[1];
              return (
                <tr key={cat}>
                  <td className="sticky left-0 bg-white dark:bg-neutral-900 pr-1.5 py-0.5 z-10 whitespace-nowrap flex items-center gap-1.5">
                    {t1EquipId && iconData.Equipment?.[String(t1EquipId)] && (
                      <EquipmentItemIcon
                        type="Equipment"
                        itemId={String(t1EquipId)}
                        size={16}
                        imageOnly
                        iconData={iconData}
                        eventData={{
                          season: { Name: '', EventContentOpenTime: '', EventContentCloseTime: '', ExtensionTime: '', EventContentTypeStr: [] },
                          icons: { Equipment: {}, Item: {}, Currency: {}, Furniture: {}, Emblem: {}, GachaGroup: {} },
                        }}
                        amount={''}
                      />
                    )}
                    <span className="text-neutral-500 dark:text-neutral-400 font-medium">{CAT_SHORT[cat]}</span>
                  </td>
                  {availableTiers.map((tier, colIndex) => {
                    const key = getKey(cat, tier);
                    if (!key) return <td key={tier} />;

                    const owned = inventory[key] || 0;
                    const demand = demandMap[key] || 0;
                    const isFarmable = farmableSet.has(key);

                    const isDeficit = demand > 0 && owned < demand;
                    const isSurplus = demand > 0 && owned >= demand;

                    return (
                      <td key={tier} className="py-0.5 px-0.5">
                        <CustomNumberInput
                          // type="number"
                          min={0}
                          max={9999}
                          value={owned}
                          placeholder="0"
                          onChange={(v) => setInventoryItem(key, v || 0)}
                          data-eq-row={rowIndex}
                          data-eq-col={colIndex}
                          onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                          className={[
                            'w-full text-center font-mono h-6 rounded border text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors',
                            isDeficit
                              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                              : isSurplus
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                                : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 dark:text-neutral-200',
                            !isFarmable ? 'opacity-35' : '',
                          ].join(' ')}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 flex gap-3 text-[9px] text-neutral-400 dark:text-neutral-500 px-1">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              disabled
              value="5"
              className="w-6 h-5 text-center font-mono text-[9px] rounded border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 cursor-not-allowed"
            />
            <span>{t('equipment.inventoryDeficient')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              disabled
              value="10"
              className="w-6 h-5 text-center font-mono text-[9px] rounded border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 cursor-not-allowed"
            />
            <span>{t('equipment.inventorySufficient')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              disabled
              value="—"
              className="w-6 h-5 text-center font-mono text-[9px] rounded border bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-400 dark:text-neutral-500 opacity-35 cursor-not-allowed"
            />
            <span>{t('equipment.inventoryNotFarmable')}</span>
          </div>
        </div>
        <div className="mt-1 flex justify-end text-[9px] text-neutral-400 dark:text-neutral-500 px-1 select-none">
          <span className="flex items-center gap-1">
            <RiKeyboardLine className="shrink-0" />
            <Trans
              i18nKey="planner:common.tabAndArrowNavTip"
              components={{
                kbd: <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded text-[0.8em] font-mono" />,
              }}
            />
          </span>
        </div>
      </div>
    </div>
  );
};
