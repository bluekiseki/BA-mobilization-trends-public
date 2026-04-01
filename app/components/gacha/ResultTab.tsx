// app/components/gacha/ResultTab.tsx

import { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { FaRocket, FaSpinner } from 'react-icons/fa';
import SimulationResultView from '~/components/gacha/SimulationResultView';
import { runGlobalSimulation, type GlobalAggregatedResult, type SimulationConfig } from '~/utils/gachaEngine';
import type { PyroxeneConfig } from '../../routes/planner/Gacha';
import type { BannerPeriod, BannerStrategy, Student } from '~/types/gacha';

interface Props {
  config: PyroxeneConfig;
  banners: BannerPeriod[];
  strategies: Record<string, BannerStrategy>;
  allStudents: Student[];
  portraitMap: Record<number, string>;
  gachaSimResult: GlobalAggregatedResult | null;
  setGachaSimResult: (next: GlobalAggregatedResult | null) => void;
  bankruptcyRate: number | null;
  setBankruptcyRate: (r: number | null) => void;
}

export default function ResultTab({ config, banners, strategies, allStudents, portraitMap, gachaSimResult, setGachaSimResult, bankruptcyRate, setBankruptcyRate }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.result' });
  const [simCount, setSimCount] = useState(10000);
  const [isSimulating, setIsSimulating] = useState(false);

  const handleRun = () => {
    setIsSimulating(true);
    setTimeout(() => {
      try {
        const activeStrategies = Object.values(strategies);
        const bannersMap = banners.reduce((acc: any, b) => {
          acc[b.id] = b;
          return acc;
        }, {});

        const simConfig: SimulationConfig = {
          initialPyroxenes: config.currentPyroxene,
          simCount: simCount,
        };

        const res = runGlobalSimulation(activeStrategies, bannersMap, allStudents, simConfig);
        setBankruptcyRate(null);
        setGachaSimResult(res);
      } catch (e) {
        console.error(e);
        alert(t('alert_error')); // "Simulation error occurred"
      } finally {
        setIsSimulating(false);
      }
    }, 100);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Execution panel */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-blue-100 dark:border-neutral-800 shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-4 transition-colors">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">{t('panel.title')}</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            <Trans
              i18nKey="panel.desc"
              t={t}
              values={{ amount: config.currentPyroxene.toLocaleString() }}
              components={{
                1: <strong className="text-neutral-700 dark:text-neutral-200" />,
              }}
            />
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700">
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">{t('panel.iteration_count')}</span>
            <input
              type="number"
              value={simCount}
              onChange={(e) => setSimCount(Number(e.target.value))}
              className="w-20 bg-transparent font-bold text-right outline-none text-neutral-800 dark:text-neutral-100"
              step={1000}
              min={1000}
            />
          </div>

          <button
            onClick={handleRun}
            disabled={isSimulating}
            className={`px-6 py-3 rounded-xl font-bold text-white shadow-lg flex items-center gap-2 transition-transform active:scale-95 ${
              isSimulating ? 'bg-neutral-400 dark:bg-neutral-600 cursor-not-allowed' : 'bg-linear-to-r from-blue-600 to-indigo-600 hover:opacity-90 dark:from-blue-500 dark:to-indigo-500'
            }`}
          >
            {isSimulating ? <FaSpinner className="animate-spin" /> : <FaRocket />}
            {isSimulating ? t('panel.btn_running') : t('panel.btn_start')}
          </button>
        </div>
      </div>

      {/* Result view */}
      {gachaSimResult && <SimulationResultView result={gachaSimResult} initialPyroxenes={config.currentPyroxene} portraitMap={portraitMap} bankruptcyRate={bankruptcyRate} />}

      {!gachaSimResult && !isSimulating && (
        <div className="text-center py-20 text-neutral-400 dark:text-neutral-500 bg-neutral-50/50 dark:bg-neutral-900/50 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 transition-colors">
          <FaRocket className="mx-auto text-4xl mb-4 opacity-20" />
          <p>{t('empty_state')}</p>
        </div>
      )}
    </div>
  );
}
