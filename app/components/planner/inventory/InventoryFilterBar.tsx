// app/components/planner/inventory/InventoryFilterBar.tsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiChevronDown, HiSearch } from 'react-icons/hi';
import { CheckboxSelect, type CheckboxSelectOption } from '~/components/common/CheckboxSelect';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student, StudentData } from '~/types/plannerData';
import { BD_NOTE_GRADE_LABEL, type BdNoteGrade } from '~/utils/bdNoteSchool';
import { TYPE_DISPLAY_ORDER, type DisplayMode, type SortKey } from '~/utils/inventoryDashboard';
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
      { value: 'Main', label: t_game('squad_type.main') },
      { value: 'Support', label: t_game('squad_type.support') },
    ],
    [t_game],
  );
}

// CheckboxSelect shows a blank button until something's selected, so every filter needs a
// standing caption above it to stay discoverable — otherwise it just looks like empty space.
function LabeledFilter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{label}</span>
      {children}
    </div>
  );
}

// Bigger, unambiguous click target — replaces a plain checkbox+label for toggles that matter.
function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'text-xs px-2.5 py-1.5 rounded border whitespace-nowrap transition-colors',
        active
          ? 'bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500 text-white'
          : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

interface InventoryFilterBarProps {
  searchQuery: string;
  onChangeSearchQuery: (v: string) => void;
  selectedTypes: Set<ItemType>;
  onChangeTypes: (types: Set<ItemType>) => void;
  sortBy: SortKey;
  onChangeSortBy: (v: SortKey) => void;
  showTarget: boolean;
  onToggleShowTarget: (v: boolean) => void;
  onlyNonZero: boolean;
  onToggleOnlyNonZero: (v: boolean) => void;
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
  sortBy,
  onChangeSortBy,
  showTarget,
  onToggleShowTarget,
  onlyNonZero,
  onToggleOnlyNonZero,
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
  const { t: t_game } = useTranslation('game');
  const { t: t_mypage } = useTranslation('mypage');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_dashboard } = useTranslation('dashboard');
  const { t: t_resources } = useTranslation('resources');
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const selectedCount = growthPlans.filter((p) => p.isSelected).length;
  const advancedActiveCount = [selectedRoles, selectedSquads, selectedShopCategories, selectedTags].filter((s) => s.size > 0).length;

  const typeLabel = useTypeLabel();
  const typeOptions = useMemo<CheckboxSelectOption<ItemType>[]>(() => TYPE_DISPLAY_ORDER.map((t) => ({ value: t, label: typeLabel[t] })), [typeLabel]);
  const sortOptions = useSortOptions();
  const tacticRoleOptions = useTacticRoleOptions();
  const squadTypeOptions = useSquadTypeOptions();
  // rarityOptions come in with numeric-string values (0=N..3=SSR) — relabel with the game's tier names.
  const rarityLabelOptions = useMemo(() => rarityOptions.map((o) => ({ ...o, label: BD_NOTE_GRADE_LABEL[Number(o.value) as BdNoteGrade] ?? o.label })), [rarityOptions]);

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
      {/* Core filters — always visible */}
      <div className="flex flex-wrap items-end gap-2">
        <LabeledFilter label={t_planner('cardmatch.label.type')}>
          <CheckboxSelect ariaLabel={t_planner('ui.sortByRarity')} options={typeOptions} selectedValues={selectedTypes} onChange={onChangeTypes} className="w-40" />
        </LabeledFilter>
        <LabeledFilter label={t_game('school')}>
          <CheckboxSelect ariaLabel={t_game('school')} options={schoolOptions} selectedValues={selectedSchools} onChange={onChangeSchools} className="w-32" />
        </LabeledFilter>
        <LabeledFilter label={t_planner('ui.sortByRarity')}>
          {/* CheckboxSelect's button has a hardcoded min-w-32 internally — anything narrower here
              overflows its own wrapper and visually overlaps the next filter, so never go below w-32. */}
          <CheckboxSelect ariaLabel={t_planner('ui.sortByRarity')} options={rarityLabelOptions} selectedValues={selectedRarities} onChange={onChangeRarities} className="w-32" />
        </LabeledFilter>
        <LabeledFilter label={t_mypage('raids.filters.sort')}>
          <select
            value={sortBy}
            onChange={(e) => onChangeSortBy(e.target.value as SortKey)}
            className="w-full rounded-md border border-neutral-300 dark:border-neutral-600 bg-transparent dark:bg-neutral-700 text-sm p-1 text-neutral-900 dark:text-white"
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
            {showMatrix ? 'List' : t_planner('inventory.toggleMatrix')}
          </ToggleButton>
        )}
        <ToggleButton active={showAdvanced} onClick={() => setShowAdvanced((v) => !v)}>
          <span className="flex items-center gap-1">
            {t_planner('inventory.toggleAdvancedFilters')}
            {advancedActiveCount > 0 ? ` (${advancedActiveCount})` : ''}
            <HiChevronDown className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </span>
        </ToggleButton>
      </div>

      {/* Advanced filters — collapsed by default, these overlap least with everyday use */}
      {showAdvanced && (
        <div className="flex flex-wrap items-end gap-2 pl-2 border-l-2 border-neutral-100 dark:border-neutral-800">
          <LabeledFilter label={t_game('tactic_role')}>
            <CheckboxSelect ariaLabel={t_game('tactic_role')} options={tacticRoleOptions} selectedValues={selectedRoles} onChange={onChangeRoles} className="w-32" />
          </LabeledFilter>
          <LabeledFilter label={t_dashboard('searchYouTube.attackType')}>
            <CheckboxSelect ariaLabel={t_dashboard('searchYouTube.attackType')} options={squadTypeOptions} selectedValues={selectedSquads} onChange={onChangeSquads} className="w-32" />
          </LabeledFilter>
          <LabeledFilter label="ShopCategory">
            <CheckboxSelect ariaLabel="ShopCategory" options={shopCategoryOptions} selectedValues={selectedShopCategories} onChange={onChangeShopCategories} className="w-36" />
          </LabeledFilter>
          <LabeledFilter label="Tag">
            <CheckboxSelect ariaLabel="Tag" options={tagOptions} selectedValues={selectedTags} onChange={onChangeTags} className="w-32" />
          </LabeledFilter>
        </div>
      )}

      {/* Target/goal section — visually separated so it doesn't compete with the attribute filters */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <ToggleButton active={showTarget} onClick={() => onToggleShowTarget(!showTarget)}>
          {t_planner('inventory.targetComparison')}
        </ToggleButton>
        <ToggleButton active={onlyNonZero} onClick={() => onToggleOnlyNonZero(!onlyNonZero)}>
          {t_planner('inventory.onlyOwned')}
        </ToggleButton>
        {showTarget && (
          <>
            <select
              value={displayMode}
              onChange={(e) => onChangeDisplayMode(e.target.value as DisplayMode)}
              className="rounded-md border border-neutral-300 dark:border-neutral-600 bg-transparent dark:bg-neutral-700 text-xs p-1 text-neutral-900 dark:text-white"
            >
              {DISPLAY_MODE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {t_planner(`inventory.displayMode.${m}`)}
                </option>
              ))}
            </select>
            <ToggleButton active={groupByStudent} onClick={onToggleGroupByStudent}>
              {t_resources('studentGoals.byStudent')}
            </ToggleButton>
            <button onClick={() => setShowPlanPicker((v) => !v)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
              {t_planner('inventory.selectPlans', { selected: selectedCount, total: growthPlans.length })}
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
          <div className="flex flex-wrap gap-1.5">
            {growthPlans.length === 0 && <span className="text-xs text-neutral-400 dark:text-neutral-500">{t_planner('ui.noStudentGrowthPlan')}</span>}
            {growthPlans.map((p) => {
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
    </div>
  );
}
