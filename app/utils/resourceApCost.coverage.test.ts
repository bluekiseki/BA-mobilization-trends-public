// Debug tool — prints, per event, which reward sources exist in that event's data and how the
// resourceApCost.ts resolver handles each (modeled / partially_modeled / not_modeled + why).
// Run directly: pnpx vitest run app/utils/resourceApCost.coverage.test.ts --reporter=verbose
// Add event IDs to DEBUG_EVENT_IDS below to audit a different event (needs app/data/event/event.<id>.json locally).
import { describe, it } from 'vitest';
import { readFileSync } from 'fs';
import { debugSourceCoverage } from '~/utils/resourceApCost';
import type { EventData } from '~/types/plannerData';

const DEBUG_EVENT_IDS = [851, 857, 860, 10843];

function loadEvent(id: number): EventData {
  return JSON.parse(readFileSync(`app/data/event/event.${id}.json`, 'utf-8')) as EventData;
}

function getAllStages(eventData: EventData) {
  if (!eventData.stage) return [];
  return [
    ...(eventData.stage.stage || []).map((s) => ({ ...s, type: 'stage' as const })),
    ...(eventData.stage.story || []).map((s) => ({ ...s, type: 'story' as const })),
    ...(eventData.stage.challenge || []).map((s) => ({ ...s, type: 'challenge' as const })),
  ];
}

describe('resourceApCost source coverage (debug)', () => {
  for (const eventId of DEBUG_EVENT_IDS) {
    it(`event ${eventId}`, () => {
      const eventData = loadEvent(eventId);
      const allStages = getAllStages(eventData);
      const coverage = debugSourceCoverage({ allStages, eventData, eventId });

      const lines = coverage.map((c) => {
        const existMark = c.existsInData ? 'present' : 'absent';
        const statusMark = { modeled: 'modeled', partially_modeled: 'partially modeled', not_modeled: 'not modeled' }[c.status];
        const flag = c.existsInData && c.status !== 'modeled' ? ' ⚠' : '';
        return `[${existMark}/${statusMark}]${flag} ${c.source}${c.note ? ` — ${c.note}` : ''}`;
      });
      console.log(`\n=== event ${eventId} coverage ===\n${lines.join('\n')}`);
    });
  }
});
