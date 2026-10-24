import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiChevronDown } from 'react-icons/hi';
import type { CheckboxSelectOption } from '~/components/common/CheckboxSelect';
import { FilterModal } from '~/components/common/FilterModal';
import { ScrollableCheckboxGroup } from '~/components/common/ScrollableCheckboxGroup';
import { ToggleButton } from '~/components/common/ToggleButton';
import type { Student } from '~/types/plannerData';
import type { ItemType } from '~/utils/itemType';

interface InventoryAdvancedFilterModalProps {
  open: boolean;
  onClose: () => void;
  typeOptions: CheckboxSelectOption<ItemType>[];
  selectedTypes: Set<ItemType>;
  onChangeTypes: (v: Set<ItemType>) => void;
  schoolOptions: CheckboxSelectOption<string>[];
  selectedSchools: Set<string>;
  onChangeSchools: (v: Set<string>) => void;
  rarityOptions: CheckboxSelectOption<string>[];
  selectedRarities: Set<string>;
  onChangeRarities: (v: Set<string>) => void;
  tacticRoleOptions: CheckboxSelectOption<Student['TacticRole']>[];
  selectedRoles: Set<Student['TacticRole']>;
  onChangeRoles: (v: Set<Student['TacticRole']>) => void;
  squadTypeOptions: CheckboxSelectOption<Student['SquadType']>[];
  selectedSquads: Set<Student['SquadType']>;
  onChangeSquads: (v: Set<Student['SquadType']>) => void;
  shopCategoryOptions: CheckboxSelectOption<string>[];
  selectedShopCategories: Set<string>;
  onChangeShopCategories: (v: Set<string>) => void;
  tagOptions: CheckboxSelectOption<string>[];
  selectedTags: Set<string>;
  onChangeTags: (v: Set<string>) => void;
}

export function InventoryAdvancedFilterModal({
  open,
  onClose,
  typeOptions,
  selectedTypes,
  onChangeTypes,
  schoolOptions,
  selectedSchools,
  onChangeSchools,
  rarityOptions,
  selectedRarities,
  onChangeRarities,
  tacticRoleOptions,
  selectedRoles,
  onChangeRoles,
  squadTypeOptions,
  selectedSquads,
  onChangeSquads,
  shopCategoryOptions,
  selectedShopCategories,
  onChangeShopCategories,
  tagOptions,
  selectedTags,
  onChangeTags,
}: InventoryAdvancedFilterModalProps) {
  const { t: t_planner } = useTranslation('planner');
  const { t: t_game } = useTranslation('game');
  const { t: t_ui } = useTranslation('ui');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const resetDisabled = [selectedTypes, selectedSchools, selectedRarities, selectedRoles, selectedSquads, selectedShopCategories, selectedTags].every((s) => s.size === 0);
  const advancedActiveCount = [selectedRoles, selectedSquads, selectedShopCategories, selectedTags].filter((s) => s.size > 0).length;

  return (
    <FilterModal
      open={open}
      onClose={onClose}
      title={t_ui('filter')}
      resetDisabled={resetDisabled}
      onReset={() => {
        onChangeTypes(new Set());
        onChangeSchools(new Set());
        onChangeRarities(new Set());
        onChangeRoles(new Set());
        onChangeSquads(new Set());
        onChangeShopCategories(new Set());
        onChangeTags(new Set());
      }}
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 items-start gap-x-4 gap-y-5 sm:grid-cols-3">
          <ScrollableCheckboxGroup label={t_planner('cardmatch.label.type')} options={typeOptions} selected={selectedTypes} onChange={onChangeTypes} />
          <ScrollableCheckboxGroup label={t_game('school')} options={schoolOptions} selected={selectedSchools} onChange={onChangeSchools} />
          <ScrollableCheckboxGroup label={t_planner('ui.sortByRarity')} options={rarityOptions} selected={selectedRarities} onChange={onChangeRarities} />
        </div>

        <div>
          <ToggleButton active={showAdvanced} onClick={() => setShowAdvanced((v) => !v)}>
            <span className="flex items-center gap-1">
              {t_planner('inventory.toggleAdvancedFilters')}
              {advancedActiveCount > 0 ? ` (${advancedActiveCount})` : ''}
              <HiChevronDown className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </span>
          </ToggleButton>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-2 items-start gap-x-4 gap-y-5 border-t border-neutral-200 pt-5 dark:border-neutral-700 sm:grid-cols-3">
            <ScrollableCheckboxGroup label={t_game('tactic_role')} options={tacticRoleOptions} selected={selectedRoles} onChange={onChangeRoles} />
            <ScrollableCheckboxGroup label={`${t_game('squad_type.main')} / ${t_game('squad_type.support')}`} options={squadTypeOptions} selected={selectedSquads} onChange={onChangeSquads} />
            <ScrollableCheckboxGroup label="ShopCategory" options={shopCategoryOptions} selected={selectedShopCategories} onChange={onChangeShopCategories} />
            <ScrollableCheckboxGroup label="Tag" options={tagOptions} selected={selectedTags} onChange={onChangeTags} />
          </div>
        )}
      </div>
    </FilterModal>
  );
}
