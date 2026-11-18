import bossData from '~/data/bossdata.json';
import type { EventData, Stage } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';

// Increase management efficiency by integrating all stage info and assigning types beforehand
export const getAllStages = (eventData: EventData) => {
  if (!eventData.stage) return [];
  return [
    ...(eventData.stage.stage || []).map((s) => ({
      ...s,
      type: 'stage' as const,
    })),
    ...(eventData.stage.story || []).map((s) => ({
      ...s,
      type: 'story' as const,
    })),
    ...(eventData.stage.challenge || []).map((s) => ({
      ...s,
      type: 'challenge' as const,
    })),
  ];
};

// Every stage group of an event, including "else" (sub-battles of challenges and older stage
// layouts) that getAllStages leaves out, so missions can reference any of them.
export const getMissionStages = (eventData: EventData): Stage[] => Object.values(eventData.stage ?? {}).flat();

// Stage names are EVENT_<id>_<Difficulty>_<Kind>_StageNN; the difficulty maps 1:1 to the event tabs.
const STAGE_TYPE_BY_DIFFICULTY: Record<string, string> = { Normal: 'Story', Hard: 'Quest', VeryHard: 'Challenge' };

export interface MissionText {
  Description: { Kr?: string; Jp?: string; En?: string; Tw?: string };
  CompleteConditionType: number;
  CompleteConditionCount: number;
  CompleteConditionParameter?: (number | string)[];
}

// Fill the {n} placeholders of a mission description. The highest-numbered placeholder is the
// completion count; lower ones name what the mission refers to (stage, item, boss, tier). Anything
// that cannot be resolved becomes "?" rather than leaking a raw "{n}".
export const formatMissionDescription = (mission: MissionText, stages: Stage[], locale: Locale, itemName?: (id: number) => string | undefined): string => {
  const d = mission.Description;
  let desc = (locale == 'ko' ? d.Kr : locale == 'ja' ? d.Jp : locale == 'en' ? d.En : d.Tw) || d.Jp || '';
  const params = mission.CompleteConditionParameter ?? [];
  const fill = (index: number, value: string) => (desc = desc.split(`{${index}}`).join(value));

  // Types whose only placeholder is not the count.
  if (mission.CompleteConditionType == 186) {
    // "Clear {0} Final Battle": boss key in the third parameter.
    const bossData_typed = bossData as unknown as Record<string, { name: Record<string, string> }>;
    fill(0, bossData_typed[String(params[2] ?? '')]?.name?.[locale] || '?');
  } else if (mission.CompleteConditionType == 191) {
    // Equipment-tier missions store the tier in the second parameter.
    fill(0, String(params[1] ?? '?'));
  } else if (mission.CompleteConditionType == 117 || mission.CompleteConditionType == 119 || mission.CompleteConditionType == 94) {
    // "area {0}" (area numbering not known from the data) and "FULL Combo on {0} difficulty {1}"
    // (no count in the text): nothing to fill here, the placeholders become "?" below.
  } else {
    const indexes = [...desc.matchAll(/\{(\d)\}/g)].map((m) => Number(m[1]));
    if (indexes.length) fill(Math.max(...indexes), mission.CompleteConditionCount.toString());

    const stage = stages.find((s) => params.includes(s.Id));
    if (stage) {
      const parts = stage.Name.split('_');
      fill(0, (parts.pop() ?? '').replace('Stage', '').trim());
      fill(1, STAGE_TYPE_BY_DIFFICULTY[parts[2]] ?? parts[2] ?? '?');
    } else if (mission.CompleteConditionType == 57 && itemName) {
      // "Acquire {0} x{1}": item id in the first parameter.
      fill(0, itemName(Number(params[0])) ?? '?');
    }
  }

  return desc.replace(/\{\d\}/g, '?');
};
