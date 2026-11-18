import { useState, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FaChevronDown, FaTrash } from 'react-icons/fa';
import { PVP_REWARDS, clampCharge, type PlannerSchedule, type PyroxeneConfig, type ManualTicketBatchInput, type CustomIncome } from '~/utils/pyroxeneCalc';
import { getEraidTicketExpiry } from '~/utils/gachaRules';
import { NumberFieldV3, SelectFieldV3, ToggleV3 } from './FieldsV3';
import { updatePermanentTickets } from './plannerStateV3';

interface Props {
  config: PyroxeneConfig & { customIncomes?: CustomIncome[] };
  setConfig: Dispatch<SetStateAction<PyroxeneConfig & { customIncomes?: CustomIncome[] }>>;
  schedules: PlannerSchedule[];
  children?: ReactNode;
  pyroxeneIcon?: string | null;
  ticket1Icon?: string | null;
  ticket10Icon?: string | null;
}

function CurrencyLabel({ text, icon }: { text: string; icon?: string | null }) {
  const iconSrc = icon?.startsWith('data:') ? icon : icon ? `data:image/webp;base64,${icon}` : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {iconSrc && <img src={iconSrc} alt="" aria-hidden="true" className="h-4 w-4 object-contain" />}
      {text}
    </span>
  );
}

export default function IncomeSettingsPanelV3({ config, setConfig, schedules, children, pyroxeneIcon, ticket1Icon, ticket10Icon }: Props) {
  const { t: tp, i18n } = useTranslation('planner');
  const { t: tUi } = useTranslation('ui');
  const { t: tGame } = useTranslation('game');
  const unitItems = tp('ui.resourceEfficiencyUnit');
  const unitSheets = tp('gacha.income.unit_sheets');
  const [ticket1, setTicket1] = useState(0);
  const [ticket10, setTicket10] = useState(0);
  const [expiry, setExpiry] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const set = (patch: Partial<Props['config']>) => setConfig((previous) => ({ ...previous, ...patch }));
  const batches = config.manualTicketBatches ?? [];
  const permanent = (key: 'ticket1Count' | 'ticket10Count') => batches.filter((batch) => !batch.expiresAt).reduce((sum, batch) => sum + batch[key], 0);
  const setPermanent = (key: 'ticket1Count' | 'ticket10Count', value: number) =>
    setConfig((previous) => ({
      ...previous,
      manualTicketBatches: updatePermanentTickets(previous.manualTicketBatches ?? [], key, value, crypto.randomUUID()),
    }));
  const updateBatch = (id: string, patch: Partial<ManualTicketBatchInput>) =>
    setConfig((previous) => ({
      ...previous,
      manualTicketBatches: (previous.manualTicketBatches ?? []).map((batch) => (batch.id === id ? { ...batch, ...patch } : batch)),
    }));
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const stories = schedules.filter((item) => item.type === 'MainStory' && item.start <= today).sort((a, b) => b.start.localeCompare(a.start));
  const selectedStories = new Set(config.selectedMainStoryIds ?? []);
  const selectedTotal = stories.filter((story) => selectedStories.has(story.id)).reduce((sum, story) => sum + (story.amount ?? 0), 0);
  const pastTickets = schedules.filter((item) => item.type === 'Elimination' && item.end <= today && getEraidTicketExpiry(item.end) > now.getTime()).sort((a, b) => b.end.localeCompare(a.end));
  const selectedTickets = new Set(config.selectedEraidTicketIds ?? []);
  const activePackageCount = Number(config.monthlyCard) + Number(config.halfMonthlyCard);
  const expiringBatchCount = batches.filter((batch) => batch.expiresAt).length;
  const customIncomeCount = config.customIncomes?.length ?? 0;

  return (
    <section aria-label={tp('gacha.v3.summary.title')} className="space-y-3">
      <div className="v3-basic-settings-group">
        <h3 className="mb-4">{tp('gacha.v3.settings.basic_title')}</h3>
        <div className="v3-basic-settings">
          <div className="v3-resource-fields">
            <NumberFieldV3
              className="v3-resource-field v3-number-balance"
              label={<CurrencyLabel text={tp('gacha.v3.settings.current_pyroxene')} icon={pyroxeneIcon} />}
              unit={unitItems}
              value={config.currentPyroxene}
              onChange={(value) => set({ currentPyroxene: Math.max(0, value) })}
            />
            <NumberFieldV3
              className="v3-resource-field"
              label={<CurrencyLabel text={tp('gacha.v3.settings.ticket1_name')} icon={ticket1Icon} />}
              unit={unitSheets}
              value={permanent('ticket1Count')}
              onChange={(value) => setPermanent('ticket1Count', value)}
            />
            <NumberFieldV3
              className="v3-resource-field"
              label={<CurrencyLabel text={tp('gacha.v3.settings.ticket10_name')} icon={ticket10Icon} />}
              unit={unitSheets}
              value={permanent('ticket10Count')}
              onChange={(value) => setPermanent('ticket10Count', value)}
            />
            <NumberFieldV3
              className="v3-resource-field"
              label={tp('gacha.v3.settings.charge_normal')}
              unit={tp('gacha.v3.settings.charge_unit')}
              value={config.chargeNormal ?? 0}
              max={199}
              onChange={(value) => set({ chargeNormal: clampCharge(value) })}
            />
            <NumberFieldV3
              className="v3-resource-field"
              label={tp('gacha.v3.settings.charge_limited')}
              unit={tp('gacha.v3.settings.charge_unit')}
              value={config.chargeLimited ?? 0}
              max={199}
              onChange={(value) => set({ chargeLimited: clampCharge(value) })}
            />
          </div>
          <SelectFieldV3 label={tp('gacha.income.settings.raid_title')} value={config.raidRank} onChange={(value) => set({ raidRank: value as PyroxeneConfig['raidRank'] })}>
            <option value="platinum">{tp('gacha.income.settings.raid_rank.platinum')}</option>
            <option value="gold">{tp('gacha.income.settings.raid_rank.gold')}</option>
            <option value="silver">{tp('gacha.income.settings.raid_rank.silver')}</option>
            <option value="bronze">{tp('gacha.income.settings.raid_rank.bronze')}</option>
          </SelectFieldV3>
          <SelectFieldV3 label={tp('gacha.income.settings.pvp_ranking')} value={config.pvpRankTier} onChange={(value) => set({ pvpRankTier: Number(value) })}>
            {PVP_REWARDS.map((reward) => (
              <option key={reward.rank} value={reward.rank}>
                {tp('gacha.v3.settings.pvp_option', { rank: reward.rank, reward: reward.reward })}
              </option>
            ))}
          </SelectFieldV3>
        </div>
      </div>
      <div className="v3-income-disclosures">
        <details>
          <summary className="v3-disclosure-summary">
            <span className="v3-disclosure-title">{tp('gacha.v3.settings.regular_title')}</span>
            <span className="v3-disclosure-end">
              <span className="v3-disclosure-meta">{tp('gacha.v3.settings.regular_meta', { count: activePackageCount, amount: config.monthlyExtraGem.toLocaleString() })}</span>
              <FaChevronDown className="v3-disclosure-chevron" aria-hidden="true" />
            </span>
          </summary>
          <div className="v3-disclosure-content flex flex-wrap items-center gap-x-6 gap-y-1">
            <ToggleV3 label={tp('gacha.income.settings.monthly_card')} checked={config.monthlyCard} onChange={(value) => set({ monthlyCard: value })} />
            <ToggleV3 label={tp('gacha.income.settings.half_monthly_card')} checked={config.halfMonthlyCard} onChange={(value) => set({ halfMonthlyCard: value })} />
            <NumberFieldV3
              className="basis-full sm:basis-auto"
              label={tp('gacha.v3.settings.monthly_extra')}
              unit={tp('gacha.income.unit_per_month')}
              value={config.monthlyExtraGem}
              onChange={(value) => set({ monthlyExtraGem: Math.max(0, value) })}
              description={tp('gacha.v3.settings.monthly_extra_note')}
            />
          </div>
        </details>

        <details>
          <summary className="v3-disclosure-summary">
            <span className="v3-disclosure-title">{tp('gacha.v3.settings.term_tickets')}</span>
            <span className="v3-disclosure-end">
              <span className="v3-disclosure-meta">
                {tp('gacha.v3.settings.batch_meta', { count: expiringBatchCount, state: tp((config.consumeExpiringTickets ?? true) ? 'gacha.v3.settings.state_on' : 'gacha.v3.settings.state_off') })}
              </span>
              <FaChevronDown className="v3-disclosure-chevron" aria-hidden="true" />
            </span>
          </summary>
          <section aria-label={tp('gacha.v3.settings.term_tickets')} className="v3-disclosure-content space-y-3">
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {batches
                .filter((batch) => batch.expiresAt)
                .map((batch, index) => (
                  <div key={batch.id} className="grid items-end gap-3 py-3 grid-cols-2">
                    <div className="v3-field">
                      <span>{tp('gacha.v3.settings.batch_expiry', { n: index + 1 })}</span>
                      <input
                        aria-label={tp('gacha.v3.settings.batch_expiry', { n: index + 1 })}
                        type="date"
                        value={batch.expiresAt ?? ''}
                        onChange={(event) => updateBatch(batch.id, { expiresAt: event.target.value || null })}
                      />
                    </div>
                    <NumberFieldV3
                      label={tp('gacha.v3.settings.batch_ticket1', { n: index + 1 })}
                      unit={unitSheets}
                      value={batch.ticket1Count}
                      onChange={(value) => updateBatch(batch.id, { ticket1Count: Math.max(0, Math.floor(value)) })}
                    />
                    <NumberFieldV3
                      label={tp('gacha.v3.settings.batch_ticket10', { n: index + 1 })}
                      unit={unitSheets}
                      value={batch.ticket10Count}
                      onChange={(value) => updateBatch(batch.id, { ticket10Count: Math.max(0, Math.floor(value)) })}
                    />
                    <button
                      type="button"
                      className="v3-button justify-self-end"
                      aria-label={tp('gacha.v3.settings.batch_delete', { n: index + 1 })}
                      onClick={() => set({ manualTicketBatches: batches.filter((item) => item.id !== batch.id) })}
                    >
                      <FaTrash />
                    </button>
                  </div>
                ))}
            </div>
            <form
              className="grid items-end gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (ticket1 + ticket10 <= 0 || !expiry) return;
                set({ manualTicketBatches: [...batches, { id: crypto.randomUUID(), expiresAt: expiry, ticket1Count: ticket1, ticket10Count: ticket10 }] });
                setTicket1(0);
                setTicket10(0);
                setExpiry('');
              }}
            >
              <NumberFieldV3 label={tp('gacha.v3.settings.add_ticket1')} unit={unitSheets} value={ticket1} onChange={(value) => setTicket1(Math.max(0, Math.floor(value)))} />
              <NumberFieldV3 label={tp('gacha.v3.settings.add_ticket10')} unit={unitSheets} value={ticket10} onChange={(value) => setTicket10(Math.max(0, Math.floor(value)))} />
              <label className="v3-field">
                {tp('gacha.v3.settings.expiry')}
                <input type="date" required value={expiry} onChange={(event) => setExpiry(event.target.value)} />
              </label>
              <button className="v3-button" type="submit" disabled={ticket1 + ticket10 <= 0 || !expiry}>
                {tp('gacha.v3.settings.add_batch')}
              </button>
            </form>
            <h4 className="pt-2 text-sm font-medium">{tp('gacha.v3.settings.past_eraid')}</h4>
            {pastTickets.length === 0 && <p className="text-xs text-neutral-500">{tp('gacha.v3.settings.past_eraid_empty')}</p>}
            {pastTickets.map((item) => (
              <label key={item.id} className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedTickets.has(item.id)}
                  onChange={(event) => {
                    const next = new Set(selectedTickets);
                    if (event.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    set({ selectedEraidTicketIds: [...next] });
                  }}
                />
                <span className="min-w-0 flex-1">{item.name}</span>
                <span className="text-xs tabular-nums">{tp('gacha.v3.settings.until', { date: new Date(getEraidTicketExpiry(item.end)).toLocaleDateString(i18n.language) })}</span>
              </label>
            ))}
            <p className="text-xs text-neutral-600 dark:text-neutral-400">{tp('gacha.v3.settings.future_eraid_note')}</p>
            <ToggleV3 label={tp('gacha.v3.settings.auto_consume')} checked={config.consumeExpiringTickets ?? true} onChange={(value) => set({ consumeExpiringTickets: value })} />
          </section>
        </details>

        <details>
          <summary className="v3-disclosure-summary">
            <span className="v3-disclosure-title">{tp('gacha.v3.settings.story_custom')}</span>
            <span className="v3-disclosure-end">
              <span className="v3-disclosure-meta">{tp('gacha.v3.settings.story_meta', { amount: selectedTotal.toLocaleString(), unit: tGame('pyroxene'), count: customIncomeCount })}</span>
              <FaChevronDown className="v3-disclosure-chevron" aria-hidden="true" />
            </span>
          </summary>
          <div className="v3-disclosure-content space-y-5">
            <section className="space-y-3" aria-label={tp('gacha.v3.settings.story_momotalk')}>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold">
                  {tp('gacha.v3.settings.unclaimed_story')}{' '}
                  <span className="text-xs font-normal">
                    {selectedTotal.toLocaleString()} {tGame('pyroxene')}
                  </span>
                </h3>
                <button className="v3-button ml-auto" onClick={() => set({ selectedMainStoryIds: stories.map((story) => story.id) })}>
                  {tUi('selectAll')}
                </button>
                <button className="v3-button" onClick={() => set({ selectedMainStoryIds: [] })}>
                  {tUi('deselectAll')}
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-neutral-200 dark:divide-neutral-800">
                {stories.map((story) => (
                  <label key={story.id} className="flex min-h-11 items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedStories.has(story.id)}
                      onChange={(event) => {
                        const next = new Set(selectedStories);
                        if (event.target.checked) next.add(story.id);
                        else next.delete(story.id);
                        set({ selectedMainStoryIds: [...next] });
                      }}
                    />
                    <span className="min-w-0 flex-1">{story.name}</span>
                    <span className="tabular-nums">{(story.amount ?? 0).toLocaleString()}</span>
                  </label>
                ))}
              </div>
              <NumberFieldV3
                className=""
                label={tp('gacha.income.settings.unclaimed_momotalk')}
                unit={tp('affectionTab.units.students')}
                value={config.momotalkCount ?? 0}
                onChange={(value) => set({ momotalkCount: Math.max(0, value) })}
                description={tp('gacha.v3.settings.momotalk_note')}
              />
            </section>
            <section className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-700" aria-label={tp('gacha.v3.settings.custom_title')}>
              <h3 className="text-sm font-semibold">{tp('gacha.v3.settings.custom_title')}</h3>
              <form
                className="grid items-end gap-3 grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!customDate || !customTitle.trim() || customAmount === '' || !Number.isFinite(Number(customAmount))) return;
                  set({ customIncomes: [...(config.customIncomes ?? []), { id: crypto.randomUUID(), date: customDate, title: customTitle.trim(), amount: Number(customAmount) }] });
                  setCustomTitle('');
                  setCustomAmount('');
                }}
              >
                <label className="v3-field">
                  {tUi('date')}
                  <input type="date" required value={customDate} onChange={(event) => setCustomDate(event.target.value)} />
                </label>
                <label className="v3-field">
                  {tp('gacha.v3.settings.custom_content')}
                  <input required value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} />
                </label>
                <label className="v3-field">
                  {tp('gacha.v3.settings.custom_amount')}
                  <div className="v3-number">
                    <input
                      type="text"
                      inputMode="text"
                      pattern="-?[0-9]+"
                      aria-label={tp('gacha.v3.settings.custom_amount')}
                      required
                      value={customAmount}
                      onChange={(event) => {
                        if (/^-?\d*$/.test(event.target.value)) setCustomAmount(event.target.value);
                      }}
                    />
                    <span>{unitItems}</span>
                  </div>
                </label>
                <button type="submit" className="v3-button">
                  {tUi('add')}
                </button>
              </form>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">{tp('gacha.v3.settings.expense_note')}</p>
              {[...(config.customIncomes ?? [])]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-700 sm:grid-cols-[auto_minmax(0,1fr)_auto_44px] sm:gap-3"
                  >
                    <span className="text-xs">{item.date}</span>
                    <span className="min-w-0 break-words sm:col-auto">{item.title}</span>
                    <span className="tabular-nums">{item.amount.toLocaleString()}</span>
                    <button className="v3-button" aria-label={`${item.title} ${tUi('delete')}`} onClick={() => set({ customIncomes: config.customIncomes?.filter((entry) => entry.id !== item.id) })}>
                      <FaTrash />
                    </button>
                  </div>
                ))}
            </section>
          </div>
        </details>

        <details>
          <summary className="v3-disclosure-summary">
            <span className="v3-disclosure-title">{tp('gacha.v3.settings.schedule_ap')}</span>
            <span className="v3-disclosure-end">
              <span className="v3-disclosure-meta">{tp('gacha.v3.settings.schedule_meta', { event: config.apRefreshes_event, normal: config.apRefreshes_normal })}</span>
              <FaChevronDown className="v3-disclosure-chevron" aria-hidden="true" />
            </span>
          </summary>
          <div className="v3-disclosure-content">{children}</div>
        </details>
      </div>
    </section>
  );
}
