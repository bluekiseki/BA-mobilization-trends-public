// app/components/gacha/SimulationResultPanel.tsx
// Simulation result display — wrapper around SimulationResultView with empty state.

import { useTranslation } from 'react-i18next';
import { FaRocket } from 'react-icons/fa';
import SimulationResultView from '~/components/gacha/SimulationResultView';
import type { GlobalAggregatedResult } from '~/utils/gachaEngine';

interface Props {
  result: GlobalAggregatedResult | null;
  initialPyroxenes: number;
  portraitMap: Record<number, string>;
  bankruptcyRate: number | null;
}

export default function SimulationResultPanel({ result, initialPyroxenes, portraitMap, bankruptcyRate }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.result' });

  if (result) {
    return <SimulationResultView result={result} initialPyroxenes={initialPyroxenes} portraitMap={portraitMap} bankruptcyRate={bankruptcyRate} />;
  }

  return (
    <div className="text-center py-16 text-neutral-400 dark:text-neutral-500 bg-neutral-50/50 dark:bg-neutral-900/50 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800">
      <FaRocket className="mx-auto text-4xl mb-4 opacity-20" />
      <p>{t('empty_state')}</p>
    </div>
  );
}
