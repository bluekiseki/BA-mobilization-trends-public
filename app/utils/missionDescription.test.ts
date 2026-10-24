import { describe, expect, it } from 'vitest';
import { formatMissionDescription, type MissionText } from './missionDescription';
import type { Stage } from '~/types/plannerData';

const mission = (en: string, type: number, count: number, params: (number | string)[] = []): MissionText => ({
  Description: { En: en, Jp: en },
  CompleteConditionType: type,
  CompleteConditionCount: count,
  CompleteConditionParameter: params,
});
const stage = (Id: number, Name: string) => ({ Id, Name }) as Stage;

describe('formatMissionDescription', () => {
  it('puts the count into the highest-numbered placeholder', () => {
    expect(formatMissionDescription(mission('{0}ステージでScore{1}ポイント以上を達成', 192, 300000, [860, 100860301]), [], 'en')).toBe('?ステージでScore300000ポイント以上を達成');
    expect(formatMissionDescription(mission('Use the dice {0} time(s)', 121, 5), [], 'en')).toBe('Use the dice 5 time(s)');
  });

  it('resolves stages from any group, labelling them by difficulty', () => {
    const stages = [stage(108023101, 'EVENT_802_VeryHard_Main_Stage01'), stage(108022101, 'EVENT_802_Hard_Main_Stage01')];
    expect(formatMissionDescription(mission('Clear all battles in Stage {0} in {1} within {2} second(s)', 83, 320, [10802, 108023101]), stages, 'en')).toBe(
      'Clear all battles in Stage 01 in Challenge within 320 second(s)',
    );
    expect(formatMissionDescription(mission('Clear Stage {0} in {1} within {2} second(s)', 83, 75, [10802, 108022101]), stages, 'en')).toBe('Clear Stage 01 in Quest within 75 second(s)');
  });

  it('names acquired items and keeps non-count placeholders unresolved', () => {
    expect(formatMissionDescription(mission('Acquire {0} x{1}', 57, 200, [85020]), [], 'en', () => 'Voynich Manuscript Page')).toBe('Acquire Voynich Manuscript Page x200');
    expect(formatMissionDescription(mission('Reach FULL Combo on {0} difficulty {1}', 94, 1, [804, 8040101]), [], 'en')).toBe('Reach FULL Combo on ? difficulty ?');
    expect(formatMissionDescription(mission('装備T{0}を達成', 191, 1, [860, 3]), [], 'ja')).toBe('装備T3を達成');
  });
});
