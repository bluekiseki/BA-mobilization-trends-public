// app/components/planner/inventory/InventoryFilterBar.tsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaInfoCircle } from 'react-icons/fa';
import { FaFilter } from 'react-icons/fa6';
import { HiArrowNarrowUp, HiSearch } from 'react-icons/hi';
import { RiCharacterRecognitionLine } from 'react-icons/ri';
import { Link } from 'react-router';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import type { CheckboxSelectOption } from '~/components/common/CheckboxSelect';
import { LabeledFilter } from '~/components/common/LabeledFilter';
import { ToggleButton } from '~/components/common/ToggleButton';
import { InventoryAdvancedFilterModal } from '~/features/inventory/components/InventoryAdvancedFilterModal';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student, StudentData } from '~/types/plannerData';
import { BD_NOTE_GRADE_LABEL, type BdNoteGrade } from '~/features/inventory/logic/bdNoteSchool';
import { planHasGrowthTarget } from '~/utils/calculatedGrowthNeeds';
import { RARITY_BG_CLASSES, SQUAD_TYPE_COLORS } from '~/utils/gameColors';
import { TYPE_DISPLAY_ORDER, type DisplayMode, type SortKey } from '~/features/inventory/logic/inventoryDashboard';
import type { ItemType } from '~/utils/itemType';

const DISPLAY_MODE_OPTIONS: DisplayMode[] = ['owned', 'needed', 'diff', 'deficit'];

// Reuse existing translation keys instead of duplicating item-type names — these all exist in
// game.json (flat) or planner.json (nested).
function useTypeLabel(): Record<ItemType, string> {
  const { t: t_game } = useTranslation('game');
  const { t: t_planner } = useTranslation('planner');
  return {
    Gem: t_game('pyroxene'),
    Credit: t_game('credit'),
    SecretStone: t_game('eleph'),
    Favor: t_game('gift'),
    Opart: t_game('opart'),
    ExpGrowth: t_planner('common.normalReport'),
    Equipment: t_game('equipment'),
    TechNote: t_planner('label.techNote'),
    TacticalBD: t_planner('label.tacticalBD'),
    Material: t_planner('label.material'),
    Coin: t_game('coin'),
    Furniture: t_planner('label.furniture'),
    AP: t_planner('common.ap'),
  };
}

function useSortOptions(): { value: SortKey; label: string }[] {
  const { t: t_planner } = useTranslation('planner');
  return [
    { value: 'type', label: t_planner('inventory.sortByType') },
    { value: 'rarity', label: t_planner('ui.sortByRarity') },
    { value: 'id', label: 'ID' },
    { value: 'owned', label: t_planner('label.owned') },
    { value: 'deficit', label: t_planner('equipment.summaryTabRemaining') },
  ];
}

function useTacticRoleOptions(): CheckboxSelectOption<Student['TacticRole']>[] {
  const { t: t_game } = useTranslation('game');
  return useMemo(
    () => [
      { value: 'DamageDealer', label: t_game('tactic_roles.damageDealer') },
      { value: 'Healer', label: t_game('tactic_roles.healer') },
      { value: 'Supporter', label: t_game('tactic_roles.supporter') },
      { value: 'Tanker', label: t_game('tactic_roles.tanker') },
      { value: 'Vehicle', label: t_game('tactic_roles.vehicle') },
    ],
    [t_game],
  );
}

function useSquadTypeOptions(): CheckboxSelectOption<Student['SquadType']>[] {
  const { t: t_game } = useTranslation('game');
  return useMemo(
    () => [
      { value: 'Main', label: t_game('squad_type.main'), color: SQUAD_TYPE_COLORS.Main },
      { value: 'Support', label: t_game('squad_type.support'), color: SQUAD_TYPE_COLORS.Support },
    ],
    [t_game],
  );
}

interface InventoryFilterBarProps {
  searchQuery: string;
  onChangeSearchQuery: (v: string) => void;
  selectedTypes: Set<ItemType>;
  onChangeTypes: (types: Set<ItemType>) => void;
  // Shortcut to the item scanner (/scanner/item) for auto-filling owned amounts from screenshots.
  scannerLink: string;
  sortBy: SortKey;
  onChangeSortBy: (v: SortKey) => void;
  showTarget: boolean;
  onToggleShowTarget: (v: boolean) => void;
  onlyNonZero: boolean;
  onToggleOnlyNonZero: (v: boolean) => void;
  carryUp: boolean;
  onToggleCarryUp: (v: boolean) => void;
  displayMode: DisplayMode;
  onChangeDisplayMode: (v: DisplayMode) => void;
  growthPlans: GrowthPlan[];
  students: StudentData;
  onTogglePlan: (uuid: string) => void;
  onSelectAllPlans: (selected: boolean) => void;
  matrixAvailable: boolean;
  showMatrix: boolean;
  onToggleMatrix: () => void;
  groupByStudent: boolean;
  onToggleGroupByStudent: () => void;
  showTable: boolean;
  onToggleTable: () => void;
  // School/role/squad apply to any entry carrying that attribute (eleph always; school also
  // applies to BD/tech notes) — entries without the attribute simply bypass the filter.
  schoolOptions: CheckboxSelectOption<string>[];
  selectedSchools: Set<string>;
  onChangeSchools: (v: Set<string>) => void;
  selectedRoles: Set<Student['TacticRole']>;
  onChangeRoles: (v: Set<Student['TacticRole']>) => void;
  selectedSquads: Set<Student['SquadType']>;
  onChangeSquads: (v: Set<Student['SquadType']>) => void;
  // Raw ShopCategoryType / TagsStr values that actually appear in the catalog — see
  // inventoryDashboard.ts for why these aren't translated/labeled beyond the raw enum name.
  shopCategoryOptions: CheckboxSelectOption<string>[];
  selectedShopCategories: Set<string>;
  onChangeShopCategories: (v: Set<string>) => void;
  tagOptions: CheckboxSelectOption<string>[];
  selectedTags: Set<string>;
  onChangeTags: (v: Set<string>) => void;
  rarityOptions: CheckboxSelectOption<string>[];
  selectedRarities: Set<string>;
  onChangeRarities: (v: Set<string>) => void;
}

export function InventoryFilterBar({
  searchQuery,
  onChangeSearchQuery,
  selectedTypes,
  onChangeTypes,
  scannerLink,
  sortBy,
  onChangeSortBy,
  showTarget,
  onToggleShowTarget,
  onlyNonZero,
  onToggleOnlyNonZero,
  carryUp,
  onToggleCarryUp,
  displayMode,
  onChangeDisplayMode,
  growthPlans,
  students,
  onTogglePlan,
  onSelectAllPlans,
  matrixAvailable,
  showMatrix,
  onToggleMatrix,
  groupByStudent,
  onToggleGroupByStudent,
  showTable,
  onToggleTable,
  schoolOptions,
  selectedSchools,
  onChangeSchools,
  selectedRoles,
  onChangeRoles,
  selectedSquads,
  onChangeSquads,
  shopCategoryOptions,
  selectedShopCategories,
  onChangeShopCategories,
  tagOptions,
  selectedTags,
  onChangeTags,
  rarityOptions,
  selectedRarities,
  onChangeRarities,
}: InventoryFilterBarProps) {
  const { t: t_planner } = useTranslation('planner');
  const { t: t_mypage } = useTranslation('mypage');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_resources } = useTranslation('resources');
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  // Plans with no growth target at all (current === target everywhere) are noise in the picker —
  // they never contribute any material need, so hide them entirely instead of listing empty plans.
  const plansWithTarget = useMemo(() => growthPlans.filter((p) => planHasGrowthTarget(p, students)), [growthPlans, students]);
  const selectedCount = plansWithTarget.filter((p) => p.isSelected).length;
  const activeFilterCount = [selectedTypes, selectedSchools, selectedRarities, selectedRoles, selectedSquads, selectedShopCategories, selectedTags].filter((s) => s.size > 0).length;

  const typeLabel = useTypeLabel();
  const typeOptions = useMemo<CheckboxSelectOption<ItemType>[]>(() => TYPE_DISPLAY_ORDER.map((t) => ({ value: t, label: typeLabel[t] })), [typeLabel]);
  const sortOptions = useSortOptions();
  const tacticRoleOptions = useTacticRoleOptions();
  const squadTypeOptions = useSquadTypeOptions();
  // rarityOptions come in with numeric-string values (0=N..3=SSR) — relabel with the game's tier names.
  const rarityLabelOptions = useMemo(
    () =>
      rarityOptions.map((o) => {
        const grade = Number(o.value) as BdNoteGrade;
        return { ...o, label: BD_NOTE_GRADE_LABEL[grade] ?? o.label, colorClassName: RARITY_BG_CLASSES[grade] };
      }),
    [rarityOptions],
  );

  return (
    <div className="space-y-3 pb-3 mb-3 border-b border-neutral-100 dark:border-neutral-800">
      <div className="relative w-full sm:w-64">
        <HiSearch className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onChangeSearchQuery(e.target.value)}
          placeholder={t_planner('gacha.result_view.search_placeholder')}
          className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-600 bg-transparent dark:bg-neutral-700 text-neutral-900 dark:text-white placeholder:text-neutral-400"
        />
      </div>
      {/* Core controls — always visible; attribute filters live in the modal below */}
      <div className="flex flex-wrap items-end gap-2">
        <LabeledFilter label={t_mypage('raids.filters.sort')}>
          <select
            value={sortBy}
            onChange={(e) => onChangeSortBy(e.target.value as SortKey)}
            className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-transparent dark:bg-neutral-700 text-sm ios-compact-14 p-1 text-neutral-900 dark:text-white"
          >
            {sortOptions
              .filter((o) => o.value !== 'deficit' || showTarget)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
        </LabeledFilter>
        {matrixAvailable && (
          <ToggleButton active={showMatrix} onClick={onToggleMatrix}>
            {showMatrix ? 'List' : t_ui('table')}
          </ToggleButton>
        )}
        <Link
          to={scannerLink}
          reloadDocument
          className="text-xs px-2.5 py-1.5 rounded border whitespace-nowrap transition-colors flex items-center gap-1 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
        >
          <RiCharacterRecognitionLine size={12} />
          {t_planner('itemScanner.title')}
        </Link>
        <button
          type="button"
          onClick={() => setShowFilterModal(true)}
          aria-label={t_ui('filter')}
          title={t_ui('filter')}
          className={`relative rounded-md border p-1.5 text-xs transition-colors ${activeFilterCount > 0 ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200' : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300'}`}
        >
          <FaFilter size={13} />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-600 px-0.5 text-[9px] font-bold text-white">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {/* Target/goal section — visually separated so it doesn't compete with the attribute filters */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <ToggleButton active={showTarget} onClick={() => onToggleShowTarget(!showTarget)}>
          {t_planner('inventory.targetComparison')}
        </ToggleButton>
        <ToggleButton active={onlyNonZero} onClick={() => onToggleOnlyNonZero(!onlyNonZero)}>
          {t_planner('inventory.onlyOwned')}
        </ToggleButton>
        <ToggleButton active={carryUp} onClick={() => onToggleCarryUp(!carryUp)}>
          <span className="flex items-center gap-1">
            <HiArrowNarrowUp size={12} />
            {t_planner('ui.carryUp')}
            <Tooltip placement="top" trigger={['hover', 'click']} overlay={<span className="block max-w-xs text-[11px] leading-relaxed">{t_planner('ui.carryUpTooltip')}</span>}>
              <span onClick={(e) => e.stopPropagation()} className="cursor-pointer opacity-60 hover:opacity-100 inline-flex items-center">
                <FaInfoCircle size={11} />
              </span>
            </Tooltip>
          </span>
        </ToggleButton>
        {showTarget && (
          <>
            <select
              value={displayMode}
              onChange={(e) => onChangeDisplayMode(e.target.value as DisplayMode)}
              className="rounded-md border border-neutral-300 dark:border-neutral-600 bg-transparent dark:bg-neutral-700 text-xs ios-compact-12 p-1 text-neutral-900 dark:text-white"
            >
              {DISPLAY_MODE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {t_planner(`inventory.displayMode.${m}`)}
                </option>
              ))}
            </select>
            <ToggleButton active={showTable} onClick={onToggleTable}>
              {t_ui('table')}
            </ToggleButton>
            <ToggleButton active={groupByStudent} onClick={onToggleGroupByStudent}>
              {t_resources('studentGoals.byStudent')}
            </ToggleButton>
            <button onClick={() => setShowPlanPicker((v) => !v)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
              {t_planner('inventory.selectPlans', { selected: selectedCount, total: plansWithTarget.length })}
            </button>
          </>
        )}
      </div>
      {showTarget && showPlanPicker && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => onSelectAllPlans(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            {t_ui('selectAll')}
          </button>
          <button onClick={() => onSelectAllPlans(false)} className="text-xs text-neutral-400 hover:underline">
            {t_ui('deselectAll')}
          </button>
          <div className="flex flex-wrap justify-center gap-1.5">
            {plansWithTarget.length === 0 && <span className="text-xs text-neutral-400 dark:text-neutral-500">{t_planner('ui.noStudentGrowthPlan')}</span>}
            {plansWithTarget.map((p) => {
              const name = p.studentId ? (students[p.studentId]?.Name ?? `#${p.studentId}`) : t_ui('none');
              return (
                <label key={p.uuid} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 cursor-pointer">
                  <input type="checkbox" checked={p.isSelected ?? false} onChange={() => onTogglePlan(p.uuid)} className="w-3 h-3" />
                  {name}
                </label>
              );
            })}
          </div>
        </div>
      )}
      <InventoryAdvancedFilterModal
        open={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        typeOptions={typeOptions}
        selectedTypes={selectedTypes}
        onChangeTypes={onChangeTypes}
        schoolOptions={schoolOptions}
        selectedSchools={selectedSchools}
        onChangeSchools={onChangeSchools}
        rarityOptions={rarityLabelOptions}
        selectedRarities={selectedRarities}
        onChangeRarities={onChangeRarities}
        tacticRoleOptions={tacticRoleOptions}
        selectedRoles={selectedRoles}
        onChangeRoles={onChangeRoles}
        squadTypeOptions={squadTypeOptions}
        selectedSquads={selectedSquads}
        onChangeSquads={onChangeSquads}
        shopCategoryOptions={shopCategoryOptions}
        selectedShopCategories={selectedShopCategories}
        onChangeShopCategories={onChangeShopCategories}
        tagOptions={tagOptions}
        selectedTags={selectedTags}
        onChangeTags={onChangeTags}
      />
    </div>
  );
}
