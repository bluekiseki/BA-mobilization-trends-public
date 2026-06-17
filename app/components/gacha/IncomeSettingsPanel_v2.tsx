// app/components/gacha/IncomeSettingsPanel_v2.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaGem, FaTicketAlt, FaCrown, FaShieldAlt, FaTrophy, FaPlus, FaTrash, FaCalendarAlt, FaInfoCircle } from 'react-icons/fa';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { PVP_REWARDS } from '~/utils/pyroxeneCalc';
import type { PyroxeneConfig } from '~/routes/planner/Gacha_v2';
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
  pyroxeneIcon?: string | null;
  ticket1Icon?: string | null;
  ticket10Icon?: string | null;
}

const monoStyle = { fontFamily: 'ui-monospace, monospace' };

function RowLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300 whitespace-nowrap">
      <span className="text-ba-btn-blue inline-flex items-center justify-center">{icon}</span>
      {children}
    </span>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="relative h-6 w-11 rounded-full transition-colors shrink-0" style={{ background: on ? '#77e0ff' : '#d4d4d8' }}>
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: on ? 22 : 2 }} />
    </button>
  );
}

function GameImg({ src, size = 24 }: { src: string; size?: number }) {
  return (
    <span className="shrink-0 inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <img src={`data:image/webp;base64,${src}`} className="max-w-full max-h-full object-cover" />
    </span>
  );
}

export default function IncomeSettingsPanel_v2({ config, setConfig, pyroxeneIcon, ticket1Icon, ticket10Icon }: Props) {
  const { t: _t } = useTranslation('planner', { keyPrefix: 'gacha.income' });
  const t = _t as (key: string, opts?: Record<string, string | number>) => string;
  const { t: tIntro } = useTranslation('planner', { keyPrefix: 'gacha.intro.notes' });

  const [newCustomDate, setNewCustomDate] = useState('');
  const [newCustomTitle, setNewCustomTitle] = useState('');
  const [newCustomAmount, setNewCustomAmount] = useState<number | ''>('');

  const set = (patch: Partial<PyroxeneConfig & { customIncomes?: CustomIncome[] }>) => setConfig((prev) => ({ ...prev, ...patch }));

  const handleAddCustom = () => {
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

  const handleRemoveCustom = (id: string) => setConfig((prev) => ({ ...prev, customIncomes: (prev.customIncomes || []).filter((x) => x.id !== id) }));

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {/* Owned Pyroxenes */}
        <label className="flex items-center justify-between gap-3 py-2.5">
          <RowLabel icon={pyroxeneIcon ? <GameImg src={pyroxeneIcon} /> : <FaGem size={15} />}>{t('settings.current_resources')}</RowLabel>
          <CustomNumberInput
            value={config.currentPyroxene}
            onChange={(val) => set({ currentPyroxene: Math.max(0, val || 0) })}
            className="w-28 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-ba-btn-blue"
            style={monoStyle}
          />
        </label>

        {/* 1-pull Recruitment Ticket */}
        <label className="flex items-center justify-between gap-3 py-2.5">
          <RowLabel icon={ticket1Icon ? <GameImg src={ticket1Icon} /> : <FaTicketAlt size={15} />}>{t('settings.ticket1')}</RowLabel>
          <span className="flex items-center gap-1.5">
            <CustomNumberInput
              value={config.currentTicket1}
              onChange={(val) => set({ currentTicket1: Math.max(0, val || 0) })}
              className="w-20 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-ba-btn-blue"
              style={monoStyle}
            />
            <span className="text-xs text-neutral-400 w-6">{t('unit_sheets')}</span>
          </span>
        </label>

        {/* 10-pull Recruitment Ticket */}
        <label className="flex items-center justify-between gap-3 py-2.5">
          <RowLabel icon={ticket10Icon ? <GameImg src={ticket10Icon} /> : <FaTicketAlt size={15} />}>{t('settings.ticket10')}</RowLabel>
          <span className="flex items-center gap-1.5">
            <CustomNumberInput
              value={config.currentTicket10}
              onChange={(val) => set({ currentTicket10: Math.max(0, val || 0) })}
              className="w-20 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-ba-btn-blue"
              style={monoStyle}
            />
            <span className="text-xs text-neutral-400 w-6">{t('unit_sheets')}</span>
          </span>
        </label>

        {/* Monthly Pass */}
        <div className="flex items-center justify-between py-2.5">
          <RowLabel icon={<FaCrown size={15} />}>{t('settings.monthly_card')}</RowLabel>
          <Toggle on={config.monthlyCard} onClick={() => set({ monthlyCard: !config.monthlyCard })} />
        </div>

        {/* Half-monthly Pass */}
        <div className="flex items-center justify-between py-2.5">
          <RowLabel icon={<FaCrown size={15} />}>{t('settings.half_monthly_card')}</RowLabel>
          <Toggle on={config.halfMonthlyCard} onClick={() => set({ halfMonthlyCard: !config.halfMonthlyCard })} />
        </div>

        {/* Additional monthly gems */}
        <label className="flex items-center justify-between gap-3 py-2.5">
          <RowLabel icon={pyroxeneIcon ? <GameImg src={pyroxeneIcon} /> : <FaGem size={15} />}>
            {t('settings.extra_placeholder')}
            <Tooltip placement="top" trigger={['hover', 'click']} overlay={<span className="block max-w-xs text-[11px] leading-relaxed">{tIntro('note3')}</span>}>
              <span className="ml-1 cursor-pointer text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 inline-flex items-center">
                <FaInfoCircle size={12} />
              </span>
            </Tooltip>
          </RowLabel>
          <span className="flex items-center gap-1.5">
            <CustomNumberInput
              value={config.monthlyExtraGem || 0}
              onChange={(val) => set({ monthlyExtraGem: Math.max(0, val || 0) })}
              className="w-24 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-1.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-ba-btn-blue"
              style={monoStyle}
            />
            <span className="text-xs text-neutral-400 w-8">{t('unit_per_month')}</span>
          </span>
        </label>

        {/* Total Assault Rank */}
        <div className="py-3">
          <RowLabel icon={<FaShieldAlt size={15} />}>{t('settings.raid_title')}</RowLabel>
          <div className="grid grid-cols-3 gap-1.5 mt-2">
            {(['platinum', 'gold', 'silver'] as const).map((rank) => {
              const on = config.raidRank === rank;
              return (
                <button
                  key={rank}
                  type="button"
                  onClick={() => set({ raidRank: rank })}
                  className={`rounded-md py-1.5 text-xs font-semibold border transition ${on ? 'text-[#06262f] border-transparent' : 'text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300'}`}
                  style={on ? { background: '#77e0ff' } : {}}
                >
                  {t(`settings.raid_rank.${rank}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* PvP Rank */}
        <div className="py-3">
          <RowLabel icon={<FaTrophy size={15} />}>{t('settings.pvp_ranking')}</RowLabel>
          <select
            className="mt-2 w-full border border-neutral-200 dark:border-neutral-700 rounded-md px-2 py-1.5 text-xs bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-ba-btn-blue"
            value={config.pvpRankTier}
            onChange={(e) => set({ pvpRankTier: Number(e.target.value) })}
          >
            {PVP_REWARDS.map((r) => (
              <option key={r.rank} value={r.rank}>
                {t('settings.pvp_rank_format', { rank: r.rank, amount: r.reward })}
              </option>
            ))}
          </select>
        </div>

        {/* Custom Income/Expense */}
        <div className="pt-3 pb-1">
          <div className="flex items-center gap-2 mb-3">
            <FaCalendarAlt size={12} className="text-ba-btn-blue shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500" style={monoStyle}>
              {t('settings.custom_income_title')}
            </span>
          </div>

          {/* Unified input block — 2 rows */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden text-xs bg-white dark:bg-neutral-900 mb-2">
            {/* Row 1: date + description (full width) */}
            <div className="flex items-stretch border-b border-neutral-200 dark:border-neutral-700">
              <input
                type="date"
                className="border-r border-neutral-200 dark:border-neutral-700 px-2.5 py-2 bg-transparent text-neutral-600 dark:text-neutral-400 outline-none focus:bg-neutral-50 dark:focus:bg-neutral-800/60 transition-colors shrink-0 w-30"
                value={newCustomDate}
                onChange={(e) => setNewCustomDate(e.target.value)}
              />
              <input
                type="text"
                placeholder={t('settings.custom_income_desc')}
                className="flex-1 min-w-0 px-2.5 py-2 bg-transparent text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-300 dark:placeholder:text-neutral-600 outline-none focus:bg-neutral-50 dark:focus:bg-neutral-800/60 transition-colors"
                value={newCustomTitle}
                onChange={(e) => setNewCustomTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCustom();
                }}
              />
            </div>
            {/* Row 2: amount + add button (right-aligned) */}
            <div className="flex items-stretch">
              <div className="flex-1 px-2.5 py-1.5 text-[10px] text-neutral-300 dark:text-neutral-700 flex items-center select-none">{t('settings.custom_income_amount')}</div>
              <CustomNumberInput
                min={-Infinity}
                max={Infinity}
                className="w-28 px-2.5 py-2 bg-transparent text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-300 dark:placeholder:text-neutral-600 outline-none text-right focus:bg-neutral-50 dark:focus:bg-neutral-800/60 transition-colors border-l border-neutral-200 dark:border-neutral-700 tabular-nums"
                placeholder="±0"
                value={newCustomAmount || null}
                onChange={(val) => setNewCustomAmount(Number(val))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCustom();
                }}
              />
              <button
                type="button"
                onClick={handleAddCustom}
                title={t('common.add')}
                className="px-3.5 flex items-center justify-center text-neutral-400 hover:bg-ba-btn-blue hover:text-[#06262f] transition-colors border-l border-neutral-200 dark:border-neutral-700 shrink-0"
              >
                <FaPlus size={11} />
              </button>
            </div>
          </div>

          {/* Items list */}
          {config.customIncomes && config.customIncomes.length > 0 && (
            <div className="rounded-lg border border-neutral-100 dark:border-neutral-800 overflow-hidden">
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 max-h-40 overflow-y-auto custom-scrollbar">
                {[...config.customIncomes]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors group text-xs">
                      <span className="tabular-nums text-neutral-400 dark:text-neutral-500 shrink-0" style={monoStyle}>
                        {item.date.slice(5).replace('-', '/')}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-neutral-700 dark:text-neutral-300">{item.title}</span>
                      <span className={`tabular-nums font-semibold shrink-0 ${item.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`} style={monoStyle}>
                        {item.amount > 0 ? '+' : ''}
                        {item.amount.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustom(item.id)}
                        className="text-neutral-300 dark:text-neutral-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      >
                        <FaTrash size={9} />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
