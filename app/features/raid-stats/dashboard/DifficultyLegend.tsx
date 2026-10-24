import { useTranslation } from 'react-i18next';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import type { DifficultyName } from '~/components/raid/Difficulty';
import LegendChips from './LegendChips';

interface DifficultyLegendProps {
  difficulties: DifficultyName[];
  // When provided, chips become toggle buttons (e.g. wired to a difficulty visibility setting).
  activeDifficulties?: Set<DifficultyName>;
  onToggle?: (difficulty: DifficultyName) => void;
}

// Shared color legend for histograms that color bars by difficulty tier.
export default function DifficultyLegend({ difficulties, activeDifficulties, onToggle }: DifficultyLegendProps) {
  const { t: t_raidInfo } = useTranslation('raidInfo');

  return (
    <LegendChips
      items={difficulties.map((name) => ({
        key: name,
        label: t_raidInfo(name, name),
        color: DIFFICULTY_COLORS[name],
        active: activeDifficulties ? activeDifficulties.has(name) : true,
        onClick: onToggle ? () => onToggle(name) : undefined,
      }))}
    />
  );
}
