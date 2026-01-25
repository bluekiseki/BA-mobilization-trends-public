import type { EventData } from '~/types/plannerData';

export function getFreeStudentID(eventData: EventData) {
  if (!eventData.stage) return;

  const s = eventData.stage.story[0];
  if (!s) return;
  for (const r of s.EventContentStageReward) {
    if (r.RewardParcelTypeStr == 'Character') {
      return r.RewardId;
    }
  }
}
