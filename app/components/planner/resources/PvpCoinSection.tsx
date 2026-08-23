// app/components/planner/resources/PvpCoinSection.tsx
import { useTranslation } from 'react-i18next';
import { rankToDailyCoins } from '~/data/raidCoinData';

const RANK_TIER_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1st' },
  { value: 2, label: '2nd' },
  { value: 10, label: '3rd – 10th' },
  { value: 100, label: '11th – 100th' },
  { value: 200, label: '~200th' },
  { value: 500, label: '~500th' },
  { value: 1000, label: '~1,000th' },
  { value: 2000, label: '~2,000th' },
  { value: 4000, label: '~4,000th' },
  { value: 8000, label: '~8,000th' },
  { value: 99999, label: 'Other' },
];

export interface PvpCoinSectionProps {
  pvpAverageRank: number;
  pvpDailyDefenseWins: number;
  pvpExtraWeeklyIncome: number;
  onUpdate: (patch: { pvpAverageRank?: number; pvpDailyDefenseWins?: number; pvpExtraWeeklyIncome?: number }) => void;
}

export default function PvpCoinSection({ pvpAverageRank, pvpDailyDefenseWins, pvpExtraWeeklyIncome, onUpdate }: PvpCoinSectionProps) {
  const { t } = useTranslation('resources');

  const { t: t_g } = useTranslation('game');
  const rankingCoins = rankToDailyCoins(pvpAverageRank);
  const defenseCoins = Math.min(pvpDailyDefenseWins * 3, 30);
  const dailyIncome = rankingCoins + defenseCoins;
  const weeklyIncome = dailyIncome * 7 + pvpExtraWeeklyIncome;

  const inputCls =
    'text-sm border border-neutral-200 dark:border-neutral-700 rounded-md px-2.5 py-1.5 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400';
  const labelCls = 'block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>{t('pvp.rankingTier')}</label>
          <select className={`${inputCls} w-full`} value={pvpAverageRank} onChange={(e) => onUpdate({ pvpAverageRank: Number(e.target.value) })}>
            {RANK_TIER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {rankToDailyCoins(opt.value)}/day
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t('pvp.defenseWins')}</label>
          <input
            type="number"
            className={`${inputCls} w-full`}
            value={pvpDailyDefenseWins}
            min={0}
            max={10}
            onChange={(e) => onUpdate({ pvpDailyDefenseWins: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })}
          />
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{t('pvp.plusCoinsPerDay', { coins: defenseCoins })}</p>
        </div>
        <div>
          <label className={labelCls}>{t('pvp.extraWeeklyIncome')}</label>
          <input type="number" className={`${inputCls} w-full`} value={pvpExtraWeeklyIncome} min={0} onChange={(e) => onUpdate({ pvpExtraWeeklyIncome: Math.max(0, Number(e.target.value) || 0) })} />
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{t('pvp.miscSources')}</p>
        </div>
      </div>
      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="text-neutral-500 dark:text-neutral-400">{t('pvp.daily')} </span>
          <span className="font-bold text-neutral-800 dark:text-neutral-100">{dailyIncome}</span>
          <span className="text-neutral-400 dark:text-neutral-500 text-xs ml-0.5">{t_g('coin')}</span>
        </span>
        <span>
          <span className="text-neutral-500 dark:text-neutral-400">{t('pvp.weekly')} </span>
          <span className="font-bold text-neutral-800 dark:text-neutral-100">{weeklyIncome}</span>
          <span className="text-neutral-400 dark:text-neutral-500 text-xs ml-0.5">{t_g('coin')}</span>
        </span>
      </div>
    </div>
  );
}
