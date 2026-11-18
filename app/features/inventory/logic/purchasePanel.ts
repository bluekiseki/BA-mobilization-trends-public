import { getItemName } from '~/utils/locale';
import { type Locale } from '~/utils/i18n/config';
import type { CampaignData, CampaignStage, IconInfos, Student } from '~/types/plannerData';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { StudentTargetGoal } from '~/types/resourcePlan';
import type { PurchasePanelEntry } from '~/features/inventory/types';
import { normalizeBluprintToEquipment } from '~/utils/blueprintUtils';
import { EXPERT_PERMIT_SHOP_EXCLUDED_IDS, EXPERT_PERMIT_ELEPH_COST, COIN_SHOP_BY_COIN_KEY, COIN_SHOP_DEFS, GAIN_ITEM_TO_COIN_KEY, type ExpertPermitStudentType } from '~/data/elephSources';
import { buildExpertPermitEntries, isElephGoalReached, expertPermitShopAvailableYearMonth } from '~/features/inventory/logic/inventoryPageLogic';

type Server = 'kr' | 'jp';

export interface FirstPickupInput {
  server: Server;
  krPickup: ScheduleItemV2[];
  jpPickup: ScheduleItemV2[];
}

/** Earliest non-rerun pickup date (YYYY-MM-DD) per student id on the selected server. */
export function buildFirstPickupByStudent({ server, krPickup, jpPickup }: FirstPickupInput): Record<number, string> {
  const map: Record<number, string> = {};
  for (const item of server === 'kr' ? krPickup : jpPickup) {
    for (const s of item.details?.students ?? []) {
      if (s.rerun) continue;
      const date = item.startTime.slice(0, 10);
      if (!(s.id in map) || date < map[s.id]) map[s.id] = date;
    }
  }
  return map;
}

export interface AvailableStagesInput {
  editingKey: string | null;
  campaigns: { jp: CampaignData; kr: CampaignData } | null;
  server: Server;
}

/** Campaign stages that drop the item being edited, ordered by stage id. */
export function findAvailableStages({ editingKey, campaigns, server }: AvailableStagesInput): Array<{ stageId: string; stage: CampaignStage }> {
  if (!campaigns || !editingKey) return [];
  const stages: Array<{ stageId: string; stage: CampaignStage }> = [];
  for (const [stageId, stage] of Object.entries(campaigns[server])) {
    const reward = stage.Reward.map((v) => (v.StageRewardParcelTypeStr === 'Equipment' ? { ...v, StageRewardId: normalizeBluprintToEquipment(v.StageRewardId) } : { ...v })).find(
      (r) => `${r.StageRewardParcelTypeStr}_${r.StageRewardId}` === editingKey,
    );
    if (!reward) continue;
    stages.push({ stageId, stage });
  }
  return stages.sort((a, b) => Number(a.stageId) - Number(b.stageId));
}

export interface PanelEntryListInput {
  editingKey: string | null;
  studentsById: Record<number, Student>;
  growthPlans: GrowthPlan[];
  firstPickupByStudent: Record<number, string>;
  iconInfos: IconInfos | null;
  locale: Locale;
  targetGoals: Record<number, StudentTargetGoal[]>;
  materialInventory: Record<string, number>;
  trackingItems: { key: string }[];
}

/** Purchase-panel rows (coin shop and expert-permit shop entries) for the item being edited. */
export function buildPanelEntryList({
  editingKey,
  studentsById,
  growthPlans,
  firstPickupByStudent,
  iconInfos,
  locale,
  targetGoals,
  materialInventory,
  trackingItems,
}: PanelEntryListInput): PurchasePanelEntry[] {
  if (!editingKey) return [];
  const trackedKeys = new Set(trackingItems.map((t) => t.key));
  const entries: PurchasePanelEntry[] = [];

  const shopDefKey = GAIN_ITEM_TO_COIN_KEY[editingKey] ?? editingKey;
  const shopDef = COIN_SHOP_BY_COIN_KEY[shopDefKey];
  if (shopDef) {
    if (editingKey === 'Currency_18') {
      entries.push(...buildExpertPermitEntries(studentsById, growthPlans, iconInfos, locale, targetGoals, materialInventory));
    } else {
      for (const item of shopDef.items) {
        const sid = item.gainItemKey.startsWith('Item_') ? Number(item.gainItemKey.slice(5)) : NaN;
        const plan = sid >= 10000 ? growthPlans.find((p) => p.studentId === sid) : undefined;
        const isAtMax = plan != null && isElephGoalReached(plan, sid, targetGoals, materialInventory);
        entries.push({
          gainItemKey: item.gainItemKey,
          label: getItemName(item.gainItemKey, iconInfos, locale),
          shopItem: item,
          coinKey: shopDef.coinKey,
          isAtMax,
        });
      }
    }
    return entries.sort((a, b) => {
      const pa = trackedKeys.has(a.gainItemKey) ? (a.isAtMax ? 1 : 0) : 2;
      const pb = trackedKeys.has(b.gainItemKey) ? (b.isAtMax ? 1 : 0) : 2;
      return pa - pb;
    });
  }

  if (editingKey.startsWith('Item_')) {
    const studentId = Number(editingKey.slice(5));
    if (!isNaN(studentId) && studentId >= 10000) {
      const meta = studentsById[studentId];
      const plan = growthPlans.find((p) => p.studentId === studentId);
      const isAtMax = plan != null && isElephGoalReached(plan, studentId, targetGoals, materialInventory);
      for (const def of COIN_SHOP_DEFS) {
        const item = def.items.find((i) => i.gainItemKey === editingKey);
        if (!item) continue;
        entries.push({
          gainItemKey: editingKey,
          label: getItemName(editingKey, iconInfos, locale),
          shopItem: item,
          coinKey: def.coinKey,
          isAtMax,
        });
      }
      if (!EXPERT_PERMIT_SHOP_EXCLUDED_IDS.has(studentId)) {
        const il = meta?.IsLimited?.[1];
        if (il === 1 || il === 2 || il === 3) {
          const expertPermitType: ExpertPermitStudentType = il === 3 ? 'pass_limited' : il === 1 ? 'limited' : 'distributed';
          const permitInfo = EXPERT_PERMIT_ELEPH_COST[expertPermitType];
          if (permitInfo) {
            const availableFrom =
              expertPermitType !== 'distributed'
                ? (() => {
                    const first = firstPickupByStudent[studentId];
                    return first ? expertPermitShopAvailableYearMonth(first, expertPermitType) : null;
                  })()
                : null;
            entries.push({
              gainItemKey: editingKey,
              label: getItemName(editingKey, iconInfos, locale),
              shopItem: {
                gainItemKey: editingKey,
                gainAmount: 5,
                costPerBundle: permitInfo.expertPermitPer5Eleph,
                monthlyLimit: permitInfo.monthlyMaxPurchases,
              },
              coinKey: 'Currency_18',
              sourceType: 'expert_permit_shop',
              availableFrom: availableFrom ?? undefined,
              isAtMax,
            });
          }
        }
      }
    }
  }
  return entries;
}
