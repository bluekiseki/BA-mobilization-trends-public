import type { i18n as I18n } from 'i18next';
import type { ContentItem } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { getItemLabel, getItemTitle } from '~/utils/scheduleDisplay';

type ScheduleItem = Parameters<typeof getItemTitle>[0];

// Upcoming raid / multi-floor items (start date today or later) as selectable goal deadlines, oldest first.
export function buildContentItems(items: readonly ScheduleItem[], today: string, locale: Locale, i18n: I18n): ContentItem[] {
  const result: ContentItem[] = [];
  for (const item of items) {
    const date = item.startTime.slice(0, 10);
    if (date < today) continue;
    const idParts = item.id.split('-');
    const type = idParts[0] as 'raid' | 'eraid' | 'multifloor';
    const season = parseInt(idParts[1]);
    const prefix = type === 'raid' ? 'R' : type === 'eraid' ? 'E' : 'S';
    result.push({ id: item.id, type, prefix, season, typeLabel: getItemLabel(item, i18n) ?? type, bossTitle: getItemTitle(item, locale, i18n), date });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
