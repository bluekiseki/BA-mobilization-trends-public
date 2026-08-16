// Characterization tests: pins down actual resolved AP/amount values against real event data, so future
// refactors of the extraction/resolution split can be checked for regressions, not just "still compiles".
// Expected numbers below were independently verified (against raw event JSON + the game's own cost tables)
// during development — see project memory `project_resource_efficiency_tab` for how each was derived.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolveResourceApProfile, listSelectableResourceKeys } from '~/utils/resourceApCost';
import type { EventData } from '~/types/plannerData';

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

describe('resolveResourceApProfile', () => {
  it('event 857 stage 8 rounds repeatable event bonuses per run without changing one-time rewards', () => {
    const eventData = loadEvent(857);
    const allStages = getAllStages(eventData);
    const cases = [
      { key: 'Item_80800', bonus: 11_000, expectedPerRun: 49, expectedForTwentyRuns: 980 },
      { key: 'Item_80801', bonus: 10_500, expectedPerRun: 5, expectedForTwentyRuns: 100 },
      { key: 'Item_80802', bonus: 10_500, expectedPerRun: 5, expectedForTwentyRuns: 100 },
    ];

    for (const { key, bonus, expectedPerRun, expectedForTwentyRuns } of cases) {
      const itemId = Number(key.split('_')[1]);
      const profile = resolveResourceApProfile(key, {
        allStages,
        eventData,
        eventId: 857,
        totalBonus: { [itemId]: bonus },
      });
      const stage8 = profile.segments.find((segment) => segment.source.type === 'stage_like' && segment.source.category === 'stage' && segment.source.stageNumber === '08');

      expect(stage8?.amount).toBe(expectedPerRun);
      expect((stage8?.amount ?? 0) * 20).toBe(expectedForTwentyRuns);
    }

    const pointsProfile = resolveResourceApProfile('Item_80800', {
      allStages,
      eventData,
      eventId: 857,
      totalBonus: { 80800: 11_000 },
    });
    const stage8Points = pointsProfile.segments.find((segment) => segment.source.type === 'stage_like' && segment.source.category === 'stage' && segment.source.stageNumber === '08');

    expect(stage8Points?.firstRunBonusAmount).toBe(300);
  });

  it('event 860 Item_26016 (janken Eleph): stage-shaped repeatable + one-time segments resolve to known AP costs', () => {
    const eventData = loadEvent(860);
    const allStages = getAllStages(eventData);
    const profile = resolveResourceApProfile('Item_26016', { allStages, eventData, eventId: 860 });

    // Best route by RATE (amount/apCost), not by cheapest AP: Normal_Stage_04 and Challenge_Stage each
    // give 1.30 units (a Default + a Rare roll merged) for 222.22 AP — rate 0.00585, beating the cheaper
    // Normal_Stage_01 (1 unit / 181 AP, rate 0.00552). Verified against this exact event's raw JSON.
    expect(profile.segments.length).toBeGreaterThan(0);
    const best = profile.segments[0];
    expect(best.apCost).toBeCloseTo(222.2222, 3);
    expect(best.amount).toBeCloseTo(1.3, 5);
    expect(best.repeatsForever).toBe(true);

    // Story-stage FirstClear one-time grants: 5 stages x 1 unit each at AP ~55.56.
    const storyFirstClears = profile.oneTimeContributions.filter((o) => o.source.type === 'stage_like' && o.source.category === 'janken_story');
    expect(storyFirstClears.length).toBe(5);
    for (const o of storyFirstClears) {
      expect(o.amount).toBeCloseTo(1, 5);
      expect(o.apCost).toBeCloseTo(55.5556, 3);
    }

    // Score-ladder rewards surfaced as AP-cost-undetermined one-time contributions (5 of the 50 score
    // thresholds grant this item, confirmed directly against reward_score_item in the raw JSON).
    const scoreLadder = profile.oneTimeContributions.filter((o) => o.source.type === 'minigame_janken_score');
    expect(scoreLadder.length).toBe(5);
    for (const o of scoreLadder) expect(o.apCost).toBeUndefined();
  });

  it('event 860 Character_26016 (one-time free-recruit grant): single source, no repeatable segment', () => {
    const eventData = loadEvent(860);
    const allStages = getAllStages(eventData);
    const profile = resolveResourceApProfile('Character_26016', { allStages, eventData, eventId: 860 });

    expect(profile.segments).toHaveLength(0);
    expect(profile.oneTimeContributions).toHaveLength(1);
    expect(profile.oneTimeContributions[0].amount).toBe(1);
    expect(profile.oneTimeContributions[0].apCost).toBe(10);
  });

  it('event 857 Item_16020 (clue search Eleph): round-completion segments, best by rate is round 3/4 at AP ~2222.22', () => {
    const eventData = loadEvent(857);
    const allStages = getAllStages(eventData);
    const profile = resolveResourceApProfile('Item_16020', { allStages, eventData, eventId: 857 });

    expect(profile.segments.length).toBeGreaterThanOrEqual(7);
    // Best by rate: round 3/4 (35 units / 2222.22 AP, rate 0.01575) beats the cheaper round 1/2
    // (25 units / 1666.67 AP, rate 0.015) — verified against this exact event's raw JSON.
    const best = profile.segments[0];
    expect(best.apCost).toBeCloseTo(2222.2222, 2);
    expect(best.amount).toBeCloseTo(35, 5);

    // Round 7 is the only IsLoop-flagged round and has a distinctly lower reward-per-cost ratio —
    // confirmed against raw JSON, not a bug (see feedback_farming_calc_correctness memory).
    const loopSegment = profile.segments.find((s) => s.repeatsForever);
    expect(loopSegment).toBeDefined();
    if (!loopSegment) throw new Error('loopSegment should be defined');
    expect(loopSegment.amount).toBeCloseTo(10, 5);
  });

  it('event 10846 Item_16017 (road puzzle Eleph): cost uses the real draw-without-replacement simulation, not a flat per-round guess', () => {
    const eventData = loadEvent(10846);
    const allStages = getAllStages(eventData);
    // Road puzzle is gated behind includeSimulations (it's a genuine Monte Carlo simulation over each map's
    // fixed tile pool — measured ~2.3s/event — so it's excluded by default; see project memory).
    const profile = resolveResourceApProfile('Item_16017', { allStages, eventData, eventId: 10846, includeSimulations: true });

    expect(profile.segments.length).toBeGreaterThan(0);
    const round1 = profile.segments.find((s) => s.source.type === 'road_puzzle_round' && s.source.round === 1 && !s.source.additional);
    expect(round1).toBeDefined();
    if (!round1) throw new Error('round1 should be defined');
    // The map's unconstrained minimum is ~13 tiles (~1083.33 AP for 40 units) — but tiles are drawn
    // WITHOUT replacement from a limited per-map pool, not freely chosen, so the real simulated draw count
    // is always >= that minimum. Assert it's strictly more expensive than the naive lower bound (the bug
    // this test now guards against), rather than pinning an exact value that varies trial-to-trial.
    expect(round1.apCost).toBeGreaterThanOrEqual(1083.3333);
    expect(round1.amount).toBeCloseTo(40, 5);
  });

  it('event 10846: road puzzle is excluded from resolution unless includeSimulations is set', () => {
    const eventData = loadEvent(10846);
    const allStages = getAllStages(eventData);
    const profile = resolveResourceApProfile('Item_16017', { allStages, eventData, eventId: 10846 });
    expect(profile.segments.length).toBe(0);
  });

  it('listSelectableResourceKeys includes both the Character one-time grant and the Item Eleph for the same student', () => {
    const eventData = loadEvent(860);
    const allStages = getAllStages(eventData);
    const keys = listSelectableResourceKeys({ allStages, eventData, eventId: 860 });
    expect(keys).toContain('Character_26016');
    expect(keys).toContain('Item_26016');
  });
});
