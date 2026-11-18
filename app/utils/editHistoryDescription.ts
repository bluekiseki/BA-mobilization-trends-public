import type { TFunction } from 'i18next';
import { snapshotValue, type HistoryEntry } from '~/store/history/history';
import type { EventListData } from '~/types/eventList';
import type { IconInfos } from '~/types/plannerData';
import type { Locale } from './i18n/config';
import { getItemName } from './locale';
import { getPlannerEventName } from './eventList';
import { sameProfileValue } from './profileDataComparison';
import { RESOURCE_SOURCE_BY_ID } from '~/data/resourceSources';

export interface HistoryNames {
  students: Record<string, { Name: string }>;
  icons: IconInfos;
  events: EventListData;
}

const record = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const rows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.map(record) : []);
const changedKeys = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !sameProfileValue(before[key], after[key]));
const changedRows = (before: unknown, after: unknown, idKey = 'id') => {
  const a = new Map(rows(before).map((row) => [row[idKey], row]));
  const b = new Map(rows(after).map((row) => [row[idKey], row]));
  return [...new Set([...a.keys(), ...b.keys()])].filter((id) => !sameProfileValue(a.get(id), b.get(id))).map((id) => ({ before: a.get(id), after: b.get(id) }));
};

/** Derive labels from existing snapshots; no catalog or description is stored in history. */
export function describeHistoryEntry(entry: HistoryEntry, names: HistoryNames | null, locale: Locale, t: TFunction): string[] {
  const student = (id: unknown) => names?.students[String(id)]?.Name || t('ui:history.studentFallback', { id: id ?? '?' });
  const item = (key: string) => getItemName(key.includes('_') ? key : `Item_${key}`, names?.icons, locale);
  const group = (key: string) => t(`ui:history.groups.${key}`, { defaultValue: key });
  const changed = (name: string) => t('ui:history.changeLabel', { groups: name });
  const action = (before: unknown, after: unknown) => t(`ui:history.${before === undefined ? 'added' : after === undefined ? 'removed' : 'modified'}`);
  const value = (input: unknown): string | null => {
    if (typeof input === 'number') return input.toLocaleString(locale);
    if (typeof input === 'boolean') return t(`ui:history.${input ? 'enabled' : 'disabled'}`);
    if (typeof input === 'string' && input.length <= 24) return t(`ui:history.values.${input}`, { defaultValue: input });
    if (Array.isArray(input) && input.length <= 3 && input.every((v) => typeof v === 'number')) return input.join('/');
    return null;
  };
  const fields = (before: unknown, after: unknown, prefix = ''): string[] => {
    const a = record(before),
      b = record(after);
    return changedKeys(a, b).flatMap((key) => {
      const label = t(`ui:history.detailFields.${key}`, { defaultValue: '' });
      if (!label) return [];
      const name = [prefix, label].filter(Boolean).join(' ');
      if (Object.keys(record(a[key])).length || Object.keys(record(b[key])).length) {
        const nested = fields(a[key], b[key], name);
        return nested.length ? nested : [changed(name)];
      }
      const old = value(a[key]),
        next = value(b[key]);
      return [old !== null && next !== null ? `${name} ${old} → ${next}` : changed(name)];
    });
  };
  const result: string[] = [];
  const appendDetails = (name: string, before: unknown, after: unknown, fallback = `${name} ${action(before, after)}`) => {
    const details = before !== undefined && after !== undefined ? fields(before, after) : [];
    result.push(...(details.length ? details.map((detail) => `${name} · ${detail}`) : [fallback]));
  };
  const inventory = (before: unknown, after: unknown, name: (key: string) => string = item) => {
    const a = record(before),
      b = record(after);
    for (const key of changedKeys(a, b)) result.push(`${name(key)} ${value(a[key] ?? 0)} → ${value(b[key] ?? 0)}`);
  };
  for (const change of entry.changes) {
    const before = record(snapshotValue(change.before)),
      after = record(snapshotValue(change.after));
    const start = result.length;
    if (change.key === 'growthPlans') {
      for (const row of changedRows(before.growthPlans, after.growthPlans, 'uuid')) {
        const name = student(row.after?.studentId ?? row.before?.studentId);
        appendDetails(name, row.before, row.after, t('ui:history.studentAction', { name, action: action(row.before, row.after) }));
      }
      inventory(before.ownedGifts, after.ownedGifts);
      inventory(before.materialInventory, after.materialInventory);
    } else if (change.key.startsWith('eventPlans:')) {
      const id = change.key.slice(11);
      const name = names ? getPlannerEventName(names.events, Number(id), locale, t('ui:history.event', { id })) : t('ui:history.event', { id });
      for (const key of changedKeys(before, after).filter((key) => key !== 'cachedTotalItems')) {
        const label = t(`ui:history.fields.${key}`, { defaultValue: t('ui:history.eventSettings') });
        const old = value(before[key]),
          next = value(after[key]);
        if (key === 'selectedStudents') {
          const a = Array.isArray(before[key]) ? (before[key] as unknown[]) : [];
          const b = Array.isArray(after[key]) ? (after[key] as unknown[]) : [];
          const ids = [...new Set([...a, ...b])].filter((id) => a.includes(id) !== b.includes(id));
          result.push(...ids.map((id) => `${name} · ${label} · ${student(id)} ${action(a.includes(id) ? id : undefined, b.includes(id) ? id : undefined)}`));
        } else if (key === 'ownedCurrency') {
          inventory(before[key], after[key], (id) => `${name} · ${item(id)}`);
        } else {
          const details = fields({ [key]: before[key] }, { [key]: after[key] });
          result.push(`${name} · ${old !== null && next !== null ? `${label} ${old} → ${next}` : details.join(' · ') || changed(label)}`);
        }
      }
    } else if (change.key === 'equipmentPlan') {
      inventory(before.runCounts, after.runCounts, (id) => `${t('ui:history.stage', { id })} · ${t('ui:history.fields.runCounts')}`);
      result.push(...fields(before, after));
    } else if (change.key === 'gacha_strategies') {
      for (const id of changedKeys(before, after)) {
        const a = record(before[id]),
          b = record(after[id]);
        const configsA = record(a.studentConfigs),
          configsB = record(b.studentConfigs);
        for (const studentId of changedKeys(configsA, configsB)) {
          appendDetails(`${student(studentId)} · ${group(change.key)}`, configsA[studentId], configsB[studentId]);
        }
        const students = [...new Set([...Object.keys(configsA), ...Object.keys(configsB)])].map(student).join(' · ');
        const name = students || group(change.key);
        result.push(...fields(a, b).map((detail) => `${name} · ${detail}`));
      }
    } else if (change.key === 'gachaHistory' || change.key === 'raidHistory') {
      for (const row of changedRows(before.entries, after.entries)) {
        const current = row.after ?? row.before ?? {};
        const name = [typeof current.date === 'string' ? current.date : '', group(change.key)].filter(Boolean).join(' · ');
        appendDetails(name, row.before, row.after);
        if (change.key === 'gachaHistory') {
          for (const item of changedRows(row.before?.results, row.after?.results)) {
            const current = item.after ?? item.before;
            result.push(`${student(current?.studentId)} · ${group(change.key)} ${action(item.before, item.after)}`);
          }
        }
      }
      result.push(...fields(before, after));
    } else if (change.key === 'gacha_prefs') {
      result.push(...fields(before, after).map((detail) => `${group(change.key)} · ${detail}`));
    } else if (change.key === 'resourcePlan') {
      for (const server of ['kr', 'jp']) {
        const a = record(before[server]),
          b = record(after[server]);
        if (sameProfileValue(a, b)) continue;
        const prefix = server === 'kr' ? 'GL' : 'JP';
        for (const { before: old, after: next } of changedRows(a.purchaseEvents, b.purchaseEvents)) {
          const keys = [...new Set([old?.spendItemKey, old?.gainItemKey, next?.spendItemKey, next?.gainItemKey].filter((key): key is string => typeof key === 'string'))];
          for (const key of keys) {
            const amount = (row: Record<string, unknown> | undefined) =>
              (row?.gainItemKey === key && typeof row.gainAmount === 'number' ? row.gainAmount : 0) - (row?.spendItemKey === key && typeof row.spendAmount === 'number' ? row.spendAmount : 0);
            result.push(`${prefix} · ${item(key)} ${value(amount(old))} → ${value(amount(next))}`);
          }
          if (!keys.length) result.push(`${prefix} · ${group(change.key)} ${action(old, next)}`);
          if (old && next && old.date !== next.date) result.push(...fields({ date: old.date }, { date: next.date }).map((detail) => `${prefix} · ${detail}`));
        }
        for (const id of changedKeys(record(a.targetGoals), record(b.targetGoals))) {
          for (const row of changedRows(record(a.targetGoals)[id], record(b.targetGoals)[id])) {
            appendDetails(`${prefix} · ${student(id)}`, row.before, row.after, `${prefix} · ${t('ui:history.studentAction', { name: student(id), action: action(row.before, row.after) })}`);
          }
        }
        for (const id of changedKeys(record(a.dailySourceAmounts), record(b.dailySourceAmounts))) {
          const source = RESOURCE_SOURCE_BY_ID[id];
          result.push(`${prefix} · ${changed(source ? item(source.itemKey) : t('ui:history.resourceFields.dailySourceAmounts'))}`);
        }
        for (const key of changedKeys(a, b).filter((key) => !['purchaseEvents', 'targetGoals', 'dailySourceAmounts'].includes(key))) {
          const details = fields({ [key]: a[key] }, { [key]: b[key] });
          result.push(...(details.length ? details.map((detail) => `${prefix} · ${detail}`) : [`${prefix} · ${changed(t(`ui:history.resourceFields.${key}`, { defaultValue: group(change.key) }))}`]));
        }
      }
    }
    if (result.length === start) result.push(changed(group(change.key)));
  }
  return [...new Set(result)];
}
