import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { type_translation } from '~/components/raid/raidToString';
import { terrain_translation } from '~/components/dashboard/YouTubeSearchGenerator';
import { getLocaleShortName, type Locale, type LocaleShortName } from '~/utils/i18n/config';
import bossdata from '~/data/bossdata.json';
import type { NetworkFilters, SeasonItem } from './types';

interface NetworkControlsProps {
  filters: NetworkFilters;
  onChange: (f: NetworkFilters) => void;
  seasons: SeasonItem[];
  initialSeasonId?: string;
  simplified?: boolean;
  studentMode?: boolean;
  onRaidChange?: (raidId?: string) => void;
}

type TypeFilter = 'all' | 'raid' | 'eraid';

const ARMOR_TYPES = ['HeavyArmor', 'LightArmor', 'Unarmed', 'ElasticArmor'];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-4 pt-3 pb-1">{children}</p>;
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-sm px-2 py-0.5 rounded transition-colors ${
        active ? 'bg-neutral-200 dark:bg-neutral-700 font-medium text-neutral-900 dark:text-neutral-100' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      {children}
    </button>
  );
}

const WEIGHT_SLIDER_MAX = 1000;
const WEIGHT_VALUE_MAX = 100000;

function weightToSlider(w: number): number {
  return Math.round((Math.log(Math.max(1, w)) / Math.log(WEIGHT_VALUE_MAX)) * WEIGHT_SLIDER_MAX);
}

function sliderToWeight(s: number): number {
  if (s === 0) return 1;
  return Math.round(Math.pow(WEIGHT_VALUE_MAX, s / WEIGHT_SLIDER_MAX));
}

function resolveSeasonLabel(item: SeasonItem, locale: LocaleShortName): string {
  const entry = bossdata[item.bossKey as keyof typeof bossdata];
  const bossName = entry?.name[locale] ?? item.label.split(' · ')[0];
  const rawTerrain = entry?.teran ?? item.label.split(' · ')[1] ?? '';
  const terrain = terrain_translation[rawTerrain]?.[locale] ?? rawTerrain;
  return `${bossName} · ${terrain}`;
}

function seasonLabel(item: SeasonItem, raidLabel: string, eraidLabel: string, locale: LocaleShortName): string {
  const tag = item.tag === 'raid' ? raidLabel : eraidLabel;
  return `[${tag}] ${item.date.slice(0, 10)} ${resolveSeasonLabel(item, locale)}`;
}

export function NetworkControls({ filters, onChange, seasons, initialSeasonId, simplified, studentMode, onRaidChange }: NetworkControlsProps) {
  const { t, i18n } = useTranslation('network');
  const { t: t_game } = useTranslation('game');
  const { t: t_ui } = useTranslation('ui');
  const locale = getLocaleShortName(i18n.language as Locale);
  const { t: t_raidInfo } = useTranslation('raidInfo');
  const { t: t_dashboard } = useTranslation('dashboard');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const appliedSeedRef = useRef<string | null>(null);
  const filtersRef = useRef(filters);
  const pendingArmorRef = useRef<string | null>(null);
  filtersRef.current = filters;

  const clearRaidQuery = () => {
    onRaidChange?.(undefined);
  };

  const set = <K extends keyof NetworkFilters>(key: K, value: NetworkFilters[K]) => {
    onChange({ ...filters, [key]: value });
    clearRaidQuery();
  };

  useEffect(() => {
    if (seasons.length === 0) return;

    const seed = initialSeasonId ?? '__default__';
    if (appliedSeedRef.current === seed) return;
    appliedSeedRef.current = seed;

    pendingArmorRef.current = null;

    if (initialSeasonId) {
      if (/^R\d+$/.test(initialSeasonId)) {
        const raidSeason = seasons.find((s) => s.id === initialSeasonId);
        if (raidSeason) {
          setTypeFilter('raid');
          setFromId(raidSeason.id);
          setToId(raidSeason.id);
          return;
        }
      }

      const armorMatch = initialSeasonId.match(/^E(\d+)-([A-Za-z]+)$/);
      if (armorMatch && ARMOR_TYPES.includes(armorMatch[2])) {
        const [, seasonNum, armorType] = armorMatch;
        const matching = seasons.filter((s) => s.tag === 'eraid' && s.id.startsWith(`E${seasonNum}-`));
        if (matching.length > 0) {
          const sorted = [...matching].sort((a, b) => a.date.localeCompare(b.date));
          setTypeFilter('eraid');
          setFromId(sorted[0].id);
          setToId(sorted[sorted.length - 1].id);
          pendingArmorRef.current = armorType;
          return;
        }
      }

      if (/^E\d+$/.test(initialSeasonId)) {
        const seasonNum = initialSeasonId.slice(1);
        const matching = seasons.filter((s) => s.tag === 'eraid' && s.id.startsWith(`E${seasonNum}-`));
        if (matching.length > 0) {
          const sorted = [...matching].sort((a, b) => a.date.localeCompare(b.date));
          setTypeFilter('eraid');
          setFromId(sorted[0].id);
          setToId(sorted[sorted.length - 1].id);
          return;
        }
      }
    }

    const defaultRange = simplified ? 13 : 6;
    const from = seasons[Math.min(defaultRange, seasons.length - 1)];
    const to = seasons[0];
    setTypeFilter('all');
    setFromId(from?.id ?? to.id);
    setToId(to.id);
  }, [seasons, initialSeasonId, simplified]);

  const computeAndEmit = useCallback(
    (from: string, to: string, type: TypeFilter) => {
      if (!from || !to || seasons.length === 0) return;
      const fromDate = seasons.find((s) => s.id === from)?.date ?? '';
      const toDate = seasons.find((s) => s.id === to)?.date ?? '';
      const lo = fromDate <= toDate ? fromDate : toDate;
      const hi = fromDate <= toDate ? toDate : fromDate;
      let selected = seasons.filter((s) => s.date >= lo && s.date <= hi);
      if (type === 'raid') selected = selected.filter((s) => s.tag === 'raid');
      if (type === 'eraid') selected = selected.filter((s) => s.tag === 'eraid');
      const armor = pendingArmorRef.current;
      pendingArmorRef.current = null;
      const nextArmorTypes = type === 'eraid' ? (armor ? [armor] : filtersRef.current.armorTypes) : null;
      onChange({
        ...filtersRef.current,
        selectedSeasons: selected.map((s) => s.id),
        armorTypes: nextArmorTypes,
      });
    },
    [seasons, onChange],
  );

  useEffect(() => {
    computeAndEmit(fromId, toId, typeFilter);
  }, [fromId, toId, typeFilter, computeAndEmit]);

  const toggleArmor = (armor: string) => {
    const cur = filters.armorTypes ?? [];
    const next = cur.includes(armor) ? cur.filter((a) => a !== armor) : [...cur, armor];
    set('armorTypes', next.length === 0 ? null : next);
  };

  const hasEraid = typeFilter !== 'raid' && filters.selectedSeasons.some((id) => seasons.find((s) => s.id === id)?.tag === 'eraid');

  const selectCls = 'w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm focus:outline-none';

  return (
    <div className="flex flex-col text-sm text-neutral-800 dark:text-neutral-200">
      {!studentMode && (
        <>
          <SectionLabel>{t('controls.range')}</SectionLabel>
          <div className="flex flex-col gap-2 px-4 pb-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-neutral-500">{t('controls.from')}</span>
              <select
                value={fromId}
                onChange={(e) => {
                  setFromId(e.target.value);
                  clearRaidQuery();
                }}
                className={selectCls}
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {seasonLabel(s, t_game('raid'), t_game('eraid'), locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-neutral-500">{t('controls.to')}</span>
              <select
                value={toId}
                onChange={(e) => {
                  setToId(e.target.value);
                  clearRaidQuery();
                }}
                className={selectCls}
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {seasonLabel(s, t_game('raid'), t_game('eraid'), locale)}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm text-neutral-400">{t('controls.seasonsInRange', { count: filters.selectedSeasons.length })}</div>
          </div>

          <div className="border-t border-neutral-200 dark:border-neutral-800" />

          <SectionLabel>{t('controls.type')}</SectionLabel>
          <div className="flex gap-1 px-4 pb-3">
            <ToggleBtn
              active={typeFilter === 'all'}
              onClick={() => {
                setTypeFilter('all');
                clearRaidQuery();
              }}
            >
              {t_ui('selectAll')}
            </ToggleBtn>
            <ToggleBtn
              active={typeFilter === 'raid'}
              onClick={() => {
                setTypeFilter('raid');
                clearRaidQuery();
              }}
            >
              {t_game('raid')}
            </ToggleBtn>
            <ToggleBtn
              active={typeFilter === 'eraid'}
              onClick={() => {
                setTypeFilter('eraid');
                clearRaidQuery();
              }}
            >
              {t_game('eraid')}
            </ToggleBtn>
          </div>
        </>
      )}

      {!simplified && (
        <>
          <div className="border-t border-neutral-200 dark:border-neutral-800" />
          <SectionLabel>{t('controls.rankCutoff')}</SectionLabel>
          <div className="flex flex-wrap gap-1 px-4 pb-3">
            {([null, 1000, 10000, 20000] as const).map((v) => (
              <ToggleBtn key={v ?? 'all'} active={filters.rankCutoff === v} onClick={() => set('rankCutoff', v)}>
                {v === null ? t_ui('selectAll') : t('controls.topRank', { value: v.toLocaleString() })}
              </ToggleBtn>
            ))}
          </div>
          <div className="border-t border-neutral-200 dark:border-neutral-800" />
          <SectionLabel>{t_game('difficultyShort')}</SectionLabel>
          <div className="flex flex-wrap gap-1 px-4 pb-3">
            {([null, 'Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore'] as const).map((d) => (
              <ToggleBtn key={d ?? 'all'} active={filters.difficulty === d} onClick={() => set('difficulty', d)}>
                {d === null ? t_ui('selectAll') : t_raidInfo(d)}
              </ToggleBtn>
            ))}
          </div>
        </>
      )}

      {!studentMode && hasEraid && (
        <>
          <div className="border-t border-neutral-200 dark:border-neutral-800" />
          <SectionLabel>{t_dashboard('searchYouTube.defenseType')}</SectionLabel>
          <div className="flex flex-wrap gap-1 px-4 pb-3">
            <ToggleBtn active={filters.armorTypes === null} onClick={() => set('armorTypes', null)}>
              {t_ui('selectAll')}
            </ToggleBtn>
            {ARMOR_TYPES.map((a) => (
              <ToggleBtn key={a} active={filters.armorTypes?.includes(a) ?? false} onClick={() => toggleArmor(a)}>
                {type_translation[a as keyof typeof type_translation][locale]}
              </ToggleBtn>
            ))}
          </div>
        </>
      )}

      <div className="border-t border-neutral-200 dark:border-neutral-800" />

      <SectionLabel>{t('controls.display')}</SectionLabel>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-500">{t('controls.minEdgeWeight', { value: filters.minWeight.toLocaleString() })}</span>
          <input type="range" min={0} max={WEIGHT_SLIDER_MAX} value={weightToSlider(filters.minWeight)} onChange={(e) => set('minWeight', sliderToWeight(Number(e.target.value)))} className="w-full" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-500">{t('controls.maxStudents', { value: filters.maxNodes })}</span>
          <input type="range" min={10} max={300} step={5} value={filters.maxNodes} onChange={(e) => set('maxNodes', Number(e.target.value))} className="w-full" />
        </label>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-500">{t('controls.topNPerNode')}</span>
            <button
              onClick={() => set('topNPerNode', filters.topNPerNode === null ? 20 : null)}
              className={`text-sm px-2 py-0.5 rounded transition-colors ${
                filters.topNPerNode !== null ? 'bg-neutral-700 dark:bg-neutral-300 text-white dark:text-neutral-900 font-medium' : 'border border-neutral-300 dark:border-neutral-600 text-neutral-500'
              }`}
            >
              {filters.topNPerNode !== null ? t('controls.on') : t('controls.off')}
            </button>
          </div>
          {filters.topNPerNode !== null && (
            <div className="flex items-center gap-2">
              <input type="range" min={1} max={50} value={filters.topNPerNode} onChange={(e) => set('topNPerNode', Number(e.target.value))} className="flex-1" />
              <span className="text-sm text-neutral-400 tabular-nums w-5 text-right">{filters.topNPerNode}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
