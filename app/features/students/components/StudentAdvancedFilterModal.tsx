import { CombatTypeIcon } from '~/components/common/CombatTypeIcon';
import { useTranslation } from 'react-i18next';
import type { CheckboxSelectOption } from '~/components/common/CheckboxSelect';
import { FilterModal } from '~/components/common/FilterModal';
import { ScrollableCheckboxGroup } from '~/components/common/ScrollableCheckboxGroup';
import { ToggleButton } from '~/components/common/ToggleButton';
import { getCharacterStarValue } from '~/utils/raid/report';
import type { Character } from '~/types/raidReport';
import { type_translation, typecolor } from '~/components/raid/raidToString';
import { StarRating } from '~/components/student/StarRating';
import type { Student } from '~/types/plannerData';
import { SQUAD_TYPE_COLORS } from '~/utils/gameColors';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { SkillFilterGroups } from '~/features/students/skillFilter/SkillFilterGroups';
import { createSkillFilter, isSkillFilterActive, type SkillFilterState, type SkillOptionCounts } from '~/features/students/skillFilter/skillFilter';
import { AFFECTION_BUCKETS, LEVEL_BUCKETS, type AffectionRangeKey, type LevelRangeKey } from './progressFilterBuckets';
import { ATTACK_TYPES, DEFENSE_TYPES } from '~/features/students/logic/studentFilterFields';

export interface StudentAdvancedFilters {
  goalsOnly: boolean;
  /** Only plans of students that are not recruited yet. */
  unrecruitedOnly: boolean;
  schools: Set<string>;
  attackTypes: Set<Student['BulletType']>;
  defenseTypes: Set<Student['ArmorType']>;
  squadTypes: Set<Student['SquadType']>;
  tacticRoles: Set<Student['TacticRole']>;
  recruitTypes: Set<RecruitType>;
  /** getCharacterStarValue() output, stringified: "1".."5" for star grade, "7".."10" for UE1-UE4. */
  starGrades: Set<string>;
  levelRanges: Set<LevelRangeKey>;
  affectionRanges: Set<AffectionRangeKey>;
  skill: SkillFilterState;
}

type RecruitType = '0' | '1' | '2' | '3' | '4';

/** How many currently-matching items have each option's value, per filter group — shown as a trailing count on each checkbox. */
export type StudentFilterOptionCounts = Record<keyof Omit<StudentAdvancedFilters, 'goalsOnly' | 'unrecruitedOnly' | 'skill'>, Record<string, number>>;

interface Props {
  open: boolean;
  onClose: () => void;
  filters: StudentAdvancedFilters;
  onChange: (filters: StudentAdvancedFilters) => void;
  schools: readonly string[];
  locale: Locale;
  optionCounts: StudentFilterOptionCounts;
  skillOptionCounts: SkillOptionCounts;
}

// Star grade + unique weapon (UW) are treated as one combined scale via getCharacterStarValue,
// the same function Student.tsx already uses for currentStar/targetStar sorting.
const STAR_GRADE_COMBOS = [
  { star: 5, uw: 4, labelKey: 'ue4' },
  { star: 5, uw: 3, labelKey: 'ue3' },
  { star: 5, uw: 2, labelKey: 'ue2' },
  { star: 5, uw: 1, labelKey: 'ue1' },
  { star: 5, uw: 0, labelKey: 'star5' },
  { star: 4, uw: 0, labelKey: 'star4' },
  { star: 3, uw: 0, labelKey: 'star3' },
  { star: 2, uw: 0, labelKey: 'star2' },
  { star: 1, uw: 0, labelKey: 'star1' },
] as const;

const ATTACK_TYPE_COLORS: Record<Student['BulletType'], string> = {
  Explosion: '#b62915',
  Pierce: '#bc8800',
  Mystic: '#206d9b',
  Sonic: '#9a46a8',
  Chemical: '#137973',
};
export function StudentAdvancedFilterModal({ open, onClose, filters, onChange, schools, locale, optionCounts, skillOptionCounts }: Props) {
  const { t } = useTranslation('planner');
  const { t: t_game } = useTranslation('game');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_dashboard } = useTranslation('dashboard');
  const { t: t_club } = useTranslation('club', { keyPrefix: 'short' });
  const { t: t_charts } = useTranslation('charts', { keyPrefix: 'ranking' });
  const localeShort = getLocaleShortName(locale);

  const attackOptions: CheckboxSelectOption<Student['BulletType']>[] = ATTACK_TYPES.map((value) => ({
    value,
    label: type_translation[value][localeShort],
    color: ATTACK_TYPE_COLORS[value],
    count: optionCounts.attackTypes[value] ?? 0,
  }));
  const defenseOptions: CheckboxSelectOption<Student['ArmorType']>[] = DEFENSE_TYPES.map((value) => ({
    value,
    label: type_translation[value][localeShort],
    color: typecolor[value],
    count: optionCounts.defenseTypes[value] ?? 0,
  }));
  const schoolOptions: CheckboxSelectOption<string>[] = schools.map((value) => ({ value, label: t_club(value, value), count: optionCounts.schools[value] ?? 0 }));
  const squadOptions: CheckboxSelectOption<Student['SquadType']>[] = [
    { value: 'Main', label: t_game('squad_type.main'), color: SQUAD_TYPE_COLORS.Main, count: optionCounts.squadTypes.Main ?? 0 },
    { value: 'Support', label: t_game('squad_type.support'), color: SQUAD_TYPE_COLORS.Support, count: optionCounts.squadTypes.Support ?? 0 },
  ];
  const roleOptions: CheckboxSelectOption<Student['TacticRole']>[] = [
    { value: 'DamageDealer', label: t_game('tactic_roles.damageDealer'), count: optionCounts.tacticRoles.DamageDealer ?? 0 },
    { value: 'Healer', label: t_game('tactic_roles.healer'), count: optionCounts.tacticRoles.Healer ?? 0 },
    { value: 'Supporter', label: t_game('tactic_roles.supporter'), count: optionCounts.tacticRoles.Supporter ?? 0 },
    { value: 'Tanker', label: t_game('tactic_roles.tanker'), count: optionCounts.tacticRoles.Tanker ?? 0 },
    { value: 'Vehicle', label: t_game('tactic_roles.vehicle'), count: optionCounts.tacticRoles.Vehicle ?? 0 },
  ];
  const recruitOptions: CheckboxSelectOption<RecruitType>[] = [
    { value: '3', label: t_game('fest'), count: optionCounts.recruitTypes['3'] ?? 0 },
    { value: '1', label: t_game('limited'), count: optionCounts.recruitTypes['1'] ?? 0 },
    { value: '0', label: t_game('recruitNormal'), count: optionCounts.recruitTypes['0'] ?? 0 },
    { value: '4', label: t_game('recruitArchive'), count: optionCounts.recruitTypes['4'] ?? 0 },
    { value: '2', label: t_game('recruitWelfare'), count: optionCounts.recruitTypes['2'] ?? 0 },
  ];
  const starGradeOptions: CheckboxSelectOption<string>[] = STAR_GRADE_COMBOS.map(({ star, uw, labelKey }) => {
    const starValue = getCharacterStarValue({ hasWeapon: uw > 0, star, weaponStar: uw } as Character);
    return {
      value: String(starValue),
      label: t(`spreadsheet.starOptions.${labelKey}`),
      icon: (
        <span className="scale-75 origin-left">
          <StarRating n={starValue} />
        </span>
      ),
      count: optionCounts.starGrades[String(starValue)] ?? 0,
    };
  });
  const levelRangeOptions: CheckboxSelectOption<LevelRangeKey>[] = LEVEL_BUCKETS.map((bucket) => ({
    value: bucket.key,
    label: bucket.key === '90' ? 'Lv.90' : `Lv.${bucket.key}`,
    count: optionCounts.levelRanges[bucket.key] ?? 0,
  }));
  const affectionRangeOptions: CheckboxSelectOption<AffectionRangeKey>[] = AFFECTION_BUCKETS.map((bucket) => ({
    value: bucket.key,
    label: bucket.key,
    count: optionCounts.affectionRanges[bucket.key] ?? 0,
  }));
  const hasFilters = filters.goalsOnly || filters.unrecruitedOnly || isSkillFilterActive(filters.skill) || Object.values(filters).some((values) => values instanceof Set && values.size > 0);

  return (
    <FilterModal
      open={open}
      onClose={onClose}
      title={t_ui('filter')}
      resetDisabled={!hasFilters}
      onReset={() =>
        onChange({
          goalsOnly: false,
          unrecruitedOnly: false,
          schools: new Set(),
          attackTypes: new Set(),
          defenseTypes: new Set(),
          squadTypes: new Set(),
          tacticRoles: new Set(),
          recruitTypes: new Set(),
          starGrades: new Set(),
          levelRanges: new Set(),
          affectionRanges: new Set(),
          skill: createSkillFilter(),
        })
      }
    >
      <div className="flex flex-col gap-3">
        <ToggleButton active={filters.goalsOnly} onClick={() => onChange({ ...filters, goalsOnly: !filters.goalsOnly })}>
          {t('ui.showGoalsOnly')}
        </ToggleButton>
        <ToggleButton active={filters.unrecruitedOnly} onClick={() => onChange({ ...filters, unrecruitedOnly: !filters.unrecruitedOnly })}>
          {t('ui.unrecruitedOnly')}
        </ToggleButton>
        <div className="grid grid-cols-2 items-start gap-x-4 gap-y-5 sm:grid-cols-3">
          <ScrollableCheckboxGroup label={t_game('school')} options={schoolOptions} selected={filters.schools} onChange={(schools) => onChange({ ...filters, schools })} />
          <ScrollableCheckboxGroup
            label={t_dashboard('searchYouTube.attackType')}
            labelIcon={<CombatTypeIcon kind="attack" />}
            options={attackOptions}
            selected={filters.attackTypes}
            onChange={(attackTypes) => onChange({ ...filters, attackTypes })}
          />
          <ScrollableCheckboxGroup
            label={t_dashboard('searchYouTube.defenseType')}
            labelIcon={<CombatTypeIcon kind="defense" />}
            options={defenseOptions}
            selected={filters.defenseTypes}
            onChange={(defenseTypes) => onChange({ ...filters, defenseTypes })}
          />
          <ScrollableCheckboxGroup
            label={`${t_game('squad_type.main')} / ${t_game('squad_type.support')}`}
            options={squadOptions}
            selected={filters.squadTypes}
            onChange={(squadTypes) => onChange({ ...filters, squadTypes })}
          />
          <ScrollableCheckboxGroup label={t_game('tactic_role')} options={roleOptions} selected={filters.tacticRoles} onChange={(tacticRoles) => onChange({ ...filters, tacticRoles })} />
          <ScrollableCheckboxGroup
            label={t_charts('control.recruit_type')}
            options={recruitOptions}
            selected={filters.recruitTypes}
            onChange={(recruitTypes) => onChange({ ...filters, recruitTypes })}
          />
          <ScrollableCheckboxGroup label={t_game('starRank')} options={starGradeOptions} selected={filters.starGrades} onChange={(starGrades) => onChange({ ...filters, starGrades })} />
          <ScrollableCheckboxGroup label={t_game('level')} options={levelRangeOptions} selected={filters.levelRanges} onChange={(levelRanges) => onChange({ ...filters, levelRanges })} />
          <ScrollableCheckboxGroup
            label={t_game('affection')}
            options={affectionRangeOptions}
            selected={filters.affectionRanges}
            onChange={(affectionRanges) => onChange({ ...filters, affectionRanges })}
          />
          <SkillFilterGroups filter={filters.skill} onChange={(skill) => onChange({ ...filters, skill })} counts={skillOptionCounts} />
        </div>
      </div>
    </FilterModal>
  );
}
