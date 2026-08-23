// app/components/gacha/IncomeSettingsPanel.tsx
// Income settings form — extracted from IncomePlannerPanel.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaGem, FaToggleOn, FaToggleOff, FaBolt, FaTrophy, FaPlusCircle, FaTrash } from 'react-icons/fa';
import { PVP_REWARDS } from '~/utils/pyroxeneCalc';
import type { PyroxeneConfig } from '~/routes/planner/Gacha_old';
import { CustomNumberInput } from '../CustomInput';

export interface CustomIncome {
  id: string;
  date: string;
  title: string;
  amount: number;
}

interface Props {
  config: PyroxeneConfig & { customIncomes?: CustomIncome[] };
  setConfig: React.Dispatch<React.SetStateAction<PyroxeneConfig & { customIncomes?: CustomIncome[] }>>;
  includeGacha: boolean;
  onToggleIncludeGacha: () => void;
}

export default function IncomeSettingsPanel({ config, setConfig, includeGacha, onToggleIncludeGacha }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.income' });

  const [newCustomDate, setNewCustomDate] = useState('');
  const [newCustomTitle, setNewCustomTitle] = useState('');
  const [newCustomAmount, setNewCustomAmount] = useState<number | ''>('');

  const handleAdd = () => {
    if (!newCustomDate || !newCustomTitle || newCustomAmount === '') return;
    const item: CustomIncome = {
      id: crypto.randomUUID(),
      date: newCustomDate,
      title: newCustomTitle,
      amount: typeof newCustomAmount === 'number' ? newCustomAmount : 0,
    };
    setConfig((prev) => ({ ...prev, customIncomes: [...(prev.customIncomes || []), item] }));
    setNewCustomTitle('');
    setNewCustomAmount('');
  };

  const handleRemove = (id: string) => setConfig((prev) => ({ ...prev, customIncomes: (prev.customIncomes || []).filter((x) => x.id !== id) }));

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-sm transition-colors">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-100 dark:border-neutral-800">
        <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">{t('settings.current_resources')}</span>
        <button
          onClick={onToggleIncludeGacha}
          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border font-bold transition-colors ${
            includeGacha
              ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400'
              : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400'
          }`}
        >
          {includeGacha ? <FaToggleOn className="text-lg" /> : <FaToggleOff className="text-lg" />}
          {t('settings.include_gacha')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm mb-4">
        {/* Current pyroxene */}
        <div className="space-y-2">
          <label className="font-bold text-neutral-600 dark:text-neutral-400 block text-xs">{t('settings.current_resources')}</label>
          <div className="relative">
            <span className="absolute left-2 top-2 text-neutral-400 dark:text-neutral-500">
              <FaGem />
            </span>
            <input
              type="number"
              className="w-full border dark:border-neutral-700 rounded pl-7 pr-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 text-sm outline-none focus:ring-1 focus:ring-blue-500"
              value={config.currentPyroxene}
              onChange={(e) => setConfig({ ...config, currentPyroxene: Number(e.target.value) })}
            />
          </div>
        </div>

        {/* Monthly cards */}
        <div className="space-y-2">
          <label className="font-bold text-neutral-600 dark:text-neutral-400 block text-xs">{t('settings.monthly_income')}</label>
          <div className="flex gap-3 items-center flex-wrap">
            <label className="flex items-center gap-1 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300">
              <input type="checkbox" className="accent-blue-500" checked={config.monthlyCard} onChange={(e) => setConfig({ ...config, monthlyCard: e.target.checked })} />
              {t('settings.monthly_card')}
            </label>
            <label className="flex items-center gap-1 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300">
              <input type="checkbox" className="accent-blue-500" checked={config.halfMonthlyCard} onChange={(e) => setConfig({ ...config, halfMonthlyCard: e.target.checked })} />
              {t('settings.half_monthly_card')}
            </label>
            <div className="flex items-center gap-1 ml-auto">
              <FaPlusCircle className="text-neutral-300 dark:text-neutral-600" />
              <CustomNumberInput
                className="w-20 border dark:border-neutral-700 rounded px-2 py-1 text-xs bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 text-right outline-none"
                placeholder={t('settings.extra_placeholder')}
                value={config.monthlyExtraGem || 0}
                onChange={(e) => setConfig({ ...config, monthlyExtraGem: Number(e) })}
              />
            </div>
          </div>
        </div>

        {/* PvP + Raid */}
        <div className="space-y-2">
          <label className="font-bold text-neutral-600 dark:text-neutral-400 flex items-center gap-1 text-xs">
            <FaTrophy className="text-yellow-500" /> {t('settings.pvp_ranking')}
          </label>
          <div className="flex gap-2">
            <select
              className="flex-1 border dark:border-neutral-700 rounded px-2 py-1.5 text-xs bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none"
              value={config.pvpRankTier}
              onChange={(e) => setConfig({ ...config, pvpRankTier: Number(e.target.value) })}
            >
              {PVP_REWARDS.map((r) => (
                <option key={r.rank} value={r.rank}>
                  {t('settings.pvp_rank_format', { rank: r.rank, amount: r.reward })}
                </option>
              ))}
            </select>
            <select
              className="flex-1 border dark:border-neutral-700 rounded px-2 py-1.5 text-xs bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none"
              value={config.raidRank}
              onChange={(e) => setConfig({ ...config, raidRank: e.target.value as 'platinum' | 'gold' | 'silver' })}
            >
              <option value="platinum">{t('settings.raid_rank.platinum')}</option>
              <option value="gold">{t('settings.raid_rank.gold')}</option>
              <option value="silver">{t('settings.raid_rank.silver')}</option>
            </select>
          </div>
        </div>

        {/* AP refreshes */}
        <div className="space-y-2">
          <label className="font-bold text-neutral-600 dark:text-neutral-400 block text-xs">
            <FaBolt className="text-green-500 inline" /> {t('settings.ap_refresh_daily')}
          </label>
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[10px] text-neutral-500 dark:text-neutral-500">{t('settings.event_period')}</span>
              <select
                className="w-full border rounded px-2 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-neutral-800 dark:text-neutral-100 outline-none"
                value={config.apRefreshes_event}
                onChange={(e) => setConfig({ ...config, apRefreshes_event: Number(e.target.value) })}
              >
                {[0, 3, 6, 9, 12].map((v) => (
                  <option key={v} value={v}>
                    {t('settings.refresh_count', { count: v })}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[10px] text-neutral-500 dark:text-neutral-500">{t('settings.normal_period')}</span>
              <select
                className="w-full border rounded px-2 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 outline-none"
                value={config.apRefreshes_normal}
                onChange={(e) => setConfig({ ...config, apRefreshes_normal: Number(e.target.value) })}
              >
                {[0, 3, 6, 9, 12].map((v) => (
                  <option key={v} value={v}>
                    {t('settings.refresh_count', { count: v })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Custom incomes */}
      <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800">
        <label className="font-bold text-neutral-600 dark:text-neutral-400 block text-xs mb-2">{t('settings.custom_income_title')}</label>
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <input
            type="date"
            className="border dark:border-neutral-700 rounded px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none"
            value={newCustomDate}
            onChange={(e) => setNewCustomDate(e.target.value)}
          />
          <input
            type="text"
            placeholder={t('settings.custom_income_desc')}
            className="flex-1 min-w-[120px] border dark:border-neutral-700 rounded px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none"
            value={newCustomTitle}
            onChange={(e) => setNewCustomTitle(e.target.value)}
          />
          <CustomNumberInput
            className="w-24 border dark:border-neutral-700 rounded px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none text-right"
            placeholder={t('settings.custom_income_amount')}
            value={newCustomAmount || null}
            onChange={(val) => setNewCustomAmount(Number(val))}
          />
          <button onClick={handleAdd} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1.5 px-3 rounded transition-colors">
            {t('common.add', { defaultValue: 'Add' })}
          </button>
        </div>
        {config.customIncomes && config.customIncomes.length > 0 && (
          <div className="mt-3 space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar">
            {config.customIncomes.map((item) => (
              <div key={item.id} className="flex justify-between items-center bg-neutral-50 dark:bg-neutral-800/50 px-3 py-1.5 rounded text-xs border border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center gap-3">
                  <span className="text-neutral-500 font-mono">{item.date}</span>
                  <span className="text-neutral-700 dark:text-neutral-300 font-bold">{item.title}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-black ${item.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {item.amount > 0 ? '+' : ''}
                    {item.amount}
                  </span>
                  <button onClick={() => handleRemove(item.id)} className="text-neutral-400 hover:text-red-500 transition-colors">
                    <FaTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
