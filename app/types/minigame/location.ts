import { z } from 'zod';
import type { LocalizeEtc } from '../localize';

export const locationConfigSchema = z.object({
  runs: z.record(z.string(), z.number()),
});

export type LocationConfig = z.infer<typeof locationConfigSchema>;

export const defaultLocationConfig: LocationConfig = { runs: {} };

export interface LocationData {
  info: {
    LocationResetScheduleCount: number;
    ScheduleEventPointCostParcelAmount: number;
    ScheduleEventPointCostParcelId: number;
    ScheduleEventPointCostParcelTypeStr: string;
    LocalizeEtc: LocalizeEtc;
  }[];
  zone: {
    LocationRank: number;
    EventPointForLocationRank: number;
    RewardGroupId: number;
    StudentVisitProb: number[];
    LocalizeEtc: LocalizeEtc;
  }[];
  reward: {
    ScheduleGroupId: number;
    LocationRank: number;
    OrderInGroup: number;
    FavorExp: number;
    ExtraFavorExp: number;
    ExtraFavorExpProb: number;
    SecretStoneAmount: number;
    SecretStoneProb: number;
    ExtraRewardParcelId: number[];
    ExtraRewardParcelTypeStr: string[];
    ExtraRewardAmount: number[];
    ExtraRewardProb: number[];
    LocalizeEtc: LocalizeEtc;
  }[];
}
