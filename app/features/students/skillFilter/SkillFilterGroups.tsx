import { useTranslation } from 'react-i18next';
import type { CheckboxSelectOption } from '~/components/common/CheckboxSelect';
import { SheetIcon } from '~/components/common/SheetIcon';
import { ScrollableCheckboxGroup } from '~/components/common/ScrollableCheckboxGroup';
import {
  EFFECT_CATEGORIES,
  getEffectIconId,
  SKILL_EFFECT_OPTIONS,
  SKILL_TARGETS,
  SKILL_TYPES,
  withSkillCategories,
  type SkillEffectKey,
  type SkillFilterState,
  type SkillOptionCounts,
} from './skillFilter';

// Category swatches: heal = green, buff = red, debuff = blue, CC = purple, other = neutral.
const CATEGORY_COLORS: Record<(typeof EFFECT_CATEGORIES)[number], string> = {
  heal: 'bg-green-500',
  buff: 'bg-red-500',
  debuff: 'bg-blue-500',
  cc: 'bg-purple-500',
  other: 'bg-neutral-400',
};

interface Props {
  filter: SkillFilterState;
  onChange: (filter: SkillFilterState) => void;
  /** Per-option match counts, shown as a trailing number on each checkbox. */
  counts?: SkillOptionCounts;
}

/**
 * Skill filter checkbox groups (skill type, target, effect category + per-category effects).
 * Renders grid items, so drop it inside the same `grid` as the other filter groups; the
 * per-category effect lists appear right after the groups once a category is picked.
 */
export function SkillFilterGroups({ filter, onChange, counts }: Props) {
  const { t: typedT } = useTranslation(['planner', 'game', 'stat']);
  // Keys are built from filter values (and namespaced), so they can't be checked against the typed resources.
  const t = typedT as (key: string) => string;

  const typeOptions: CheckboxSelectOption<(typeof SKILL_TYPES)[number]>[] = SKILL_TYPES.map((value) => ({ value, label: t(`game:skill.${value}`), count: counts?.types[value] ?? 0 }));
  const targetOptions: CheckboxSelectOption<(typeof SKILL_TARGETS)[number]>[] = SKILL_TARGETS.map((value) => ({
    value,
    label: t(`planner:skillFilter.target.${value}`),
    count: counts?.targets[value] ?? 0,
  }));
  const categoryOptions: CheckboxSelectOption<(typeof EFFECT_CATEGORIES)[number]>[] = EFFECT_CATEGORIES.map((value) => ({
    value,
    label: t(`planner:skillFilter.category.${value}`),
    colorClassName: CATEGORY_COLORS[value],
    count: counts?.categories[value] ?? 0,
  }));

  const changeSubs = (category: (typeof EFFECT_CATEGORIES)[number], picked: Set<SkillEffectKey>) => {
    const subs = new Set([...filter.subs].filter((key) => !key.startsWith(`${category}:`)));
    for (const key of picked) subs.add(key);
    onChange({ ...filter, subs });
  };

  return (
    <>
      <ScrollableCheckboxGroup label={t('planner:skillFilter.type')} options={typeOptions} selected={filter.types} onChange={(types) => onChange({ ...filter, types })} />
      <ScrollableCheckboxGroup label={t('planner:skillFilter.target.label')} options={targetOptions} selected={filter.targets} onChange={(targets) => onChange({ ...filter, targets })} />
      <ScrollableCheckboxGroup
        label={t('planner:skillFilter.effect.label')}
        options={categoryOptions}
        selected={filter.categories}
        onChange={(categories) => onChange(withSkillCategories(filter, categories))}
      />
      {EFFECT_CATEGORIES.filter((category) => filter.categories.has(category)).map((category) => {
        const options: CheckboxSelectOption<SkillEffectKey>[] = SKILL_EFFECT_OPTIONS[category].map((option) => {
          const iconId = getEffectIconId(option);
          const label = t(option.labelKey);
          return {
            value: option.key,
            label,
            icon: iconId ? <SheetIcon sheet="buff" id={iconId} alt={label} className="h-5 shrink-0 aspect-[47/54]" /> : undefined,
            count: counts?.subs[option.key] ?? 0,
          };
        });
        const selected = new Set([...filter.subs].filter((key) => key.startsWith(`${category}:`)));
        return (
          <ScrollableCheckboxGroup key={category} label={t(`planner:skillFilter.category.${category}`)} options={options} selected={selected} onChange={(picked) => changeSubs(category, picked)} />
        );
      })}
    </>
  );
}
