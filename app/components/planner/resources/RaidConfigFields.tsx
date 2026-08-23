// components/planner/resources/RaidConfigFields.tsx
import { useTranslation } from 'react-i18next';
import { calcRaidCoins, RAID_DIFFICULTIES, RAID_TROPHIES } from '~/data/raidCoinData';
import type { RaidDetailConfig } from '~/data/raidCoinData';

const SELECT_CLS =
  'px-2 py-1 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400';

interface RaidConfigFieldsProps {
  config: RaidDetailConfig;
  isRaid: boolean;
  onChange: (c: RaidDetailConfig) => void;
}

export function RaidConfigFields({ config, isRaid, onChange }: RaidConfigFieldsProps) {
  const { t } = useTranslation('resources');
  const { t: t_g } = useTranslation('game');
  const { normalCoin, premiumCoin, eligma } = calcRaidCoins(config, isRaid);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1">{t('raid.killDifficulty')}</p>
          <select className={SELECT_CLS} value={config.killDifficulty} onChange={(e) => onChange({ ...config, killDifficulty: e.target.value as RaidDetailConfig['killDifficulty'] })}>
            {RAID_DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mb-1">{t_g('trophy')}</p>
          <select className={SELECT_CLS} value={config.trophy} onChange={(e) => onChange({ ...config, trophy: e.target.value as RaidDetailConfig['trophy'] })}>
            {RAID_TROPHIES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {isRaid && (
          <div className="flex gap-3 items-center pb-0.5">
            {(['m360', 'm400'] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config[k]}
                  onChange={(e) => onChange({ ...config, [k]: e.target.checked })}
                  className="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-600"
                />
                <span className="text-xs text-neutral-600 dark:text-neutral-300">{k === 'm360' ? '360M' : '400M'}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-neutral-500 dark:text-neutral-400">
        <span>
          {t('raid.normal')} <b className="text-neutral-700 dark:text-neutral-200">{normalCoin}</b>
        </span>
        <span>
          {t('raid.premium')} <b className="text-neutral-700 dark:text-neutral-200">{premiumCoin}</b>
        </span>
        <span>
          {t_g('eligma')} <b className="text-neutral-700 dark:text-neutral-200">{eligma}</b>
        </span>
      </div>
    </div>
  );
}
