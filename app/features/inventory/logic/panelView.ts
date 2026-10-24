import type { IconInfos } from '~/types/plannerData';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import type { PurchasePanelEntry } from '~/features/inventory/types';
import { GAME_DAY_OFFSET_MS, type ScheduleBarItem } from '~/features/inventory/logic/scheduleBar';
import { getShopItemType, splitItemKey, type ItemType } from '~/utils/itemType';

const FILTER_TYPE_META: Partial<Record<ItemType, string>> = {
  SecretStone: 'game:eleph',
  TacticalBD: 'label.tacticalBD',
  TechNote: 'label.techNote',
  AP: 'common.ap',
  Credit: 'game:credit',
  ExpGrowth: 'common.normalReport',
};

export interface InlinePanelFilterTypesInput {
  availableStages: unknown[];
  panelEntryList: PurchasePanelEntry[];
  iconInfos: IconInfos | null;
  t_planner: ((key: 'equipment.tabStages') => string) & ((key: never) => string);
}

/** Filter tabs for the inline purchase panel: stages (if any) plus one tab per shop item type present. */
export function buildInlinePanelFilterTypes({ availableStages, panelEntryList, iconInfos, t_planner }: InlinePanelFilterTypesInput): Array<{ id: string; label: string }> {
  const types: Array<{ id: string; label: string }> = [];
  if (availableStages.length > 0) types.push({ id: 'stages', label: t_planner('equipment.tabStages') });
  const seenTypes = new Set<string>();
  for (const entry of panelEntryList) {
    const parts = splitItemKey(entry.gainItemKey);
    if (!parts) continue;
    const [type, idStr] = parts;
    const info = iconInfos?.[type as keyof IconInfos]?.[idStr];
    const itemType = getShopItemType(type, Number(idStr), info ?? undefined);
    if (!itemType || seenTypes.has(itemType)) continue;
    seenTypes.add(itemType);
    const labelKey = FILTER_TYPE_META[itemType];
    if (!labelKey) continue;
    types.push({ id: itemType, label: t_planner(labelKey as never) });
  }
  return types;
}

/** Purchase-panel rows left after hiding the filtered-out item types. */
export function filterPanelEntries(panelEntryList: PurchasePanelEntry[], inlinePanelHiddenTypes: Set<string>, iconInfos: IconInfos | null) {
  return inlinePanelHiddenTypes.size === 0
    ? panelEntryList
    : panelEntryList.filter((e) => {
        const parts = splitItemKey(e.gainItemKey);
        if (!parts) return true;
        const [type, idStr] = parts;
        const info = iconInfos?.[type as keyof IconInfos]?.[idStr];
        const itemType = getShopItemType(type, Number(idStr), info ?? undefined);
        return !itemType || !inlinePanelHiddenTypes.has(itemType);
      });
}

export interface ScheduleBarItemsInput {
  server: 'kr' | 'jp';
  krEvents: ScheduleItemV2[];
  jpEvents: ScheduleItemV2[];
  raidSchedule: ScheduleItemV2[];
  mfSchedule: ScheduleItemV2[];
  krCampaign: ScheduleItemV2[];
  jpCampaign: ScheduleItemV2[];
  startDate: string;
  getScheduleTitle: (item: ScheduleItemV2) => string;
}

/** Upcoming events, raids, multifloor raids and campaigns as calendar bars. */
export function buildScheduleBarItems({ server, krEvents, jpEvents, raidSchedule, mfSchedule, krCampaign, jpCampaign, startDate, getScheduleTitle }: ScheduleBarItemsInput): ScheduleBarItem[] {
  const events = server === 'kr' ? krEvents : jpEvents;
  const campaignItems = server === 'kr' ? krCampaign : jpCampaign;
  const toItem =
    (defaultType: ScheduleBarItem['type']) =>
    (e: ScheduleItemV2): ScheduleBarItem => ({
      name: getScheduleTitle(e),
      type: e.id.startsWith('eraid-') ? 'eraid' : defaultType,
      startMs: new Date(e.startTime).getTime(),
      endMs: e.endTime ? new Date(e.endTime).getTime() : new Date(e.startTime).getTime() + 86_400_000,
    });
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const todayGameStart = Date.UTC(sy, sm - 1, sd) - GAME_DAY_OFFSET_MS;
  return [...events.map(toItem('event')), ...raidSchedule.map(toItem('raid')), ...mfSchedule.map(toItem('multifloor')), ...campaignItems.map(toItem('campaign'))].filter(
    (it) => it.endMs > todayGameStart,
  );
}

/** Bars left after the calendar's type toggles. */
export function filterScheduleBarItems(scheduleBarItems: ScheduleBarItem[], scheduleFilters: { event: boolean; raid: boolean; multifloor: boolean; campaign: boolean }) {
  return scheduleBarItems.filter((item) => {
    if (item.type === 'event') return scheduleFilters.event;
    if (item.type === 'raid' || item.type === 'eraid') return scheduleFilters.raid;
    if (item.type === 'multifloor') return scheduleFilters.multifloor;
    if (item.type === 'campaign') return scheduleFilters.campaign;
    return true;
  });
}
