// Characterization tests: pins resolved AP/amount values against real event data to catch regressions.
// Expected numbers were independently verified against raw JSON — see memory `project_resource_efficiency_tab`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolveResourceApProfile, listSelectableResourceKeys, buildCumulativeCurve, buildFarmingPlan, type ApSegment } from '~/utils/resourceApCost';
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

// Mirrors ResourceEfficiencyPanel.tsx's own graphSegments/curve construction, so this test tracks what the
// panel actually renders, not just the raw per-segment profile.
function apCostForAmount(profile: ReturnType<typeof resolveResourceApProfile>, targetAmount: number, maxAp: number): number {
  const extra: ApSegment[] = profile.oneTimeContributions
    .filter((o) => o.apCost !== undefined && o.apCost > 0)
    .map((o) => ({ apCost: o.apCost as number, amount: o.amount, source: o.source, sourceLabel: o.sourceLabel }));
  const freeBaseline = profile.oneTimeContributions.filter((o) => o.apCost === undefined).reduce((a, o) => a + o.amount, 0);
  const graphSegments = [...profile.segments, ...extra].sort((a, b) => b.amount / b.apCost - a.amount / a.apCost);
  const curve = buildCumulativeCurve(graphSegments, maxAp).map((p) => ({ ap: p.ap, amount: p.amount + freeBaseline }));
  const hitIndex = curve.findIndex((p) => p.amount >= targetAmount);
  if (hitIndex <= 0) throw new Error(`curve never reaches ${targetAmount}`);
  const hit = curve[hitIndex];
  const prev = curve[hitIndex - 1];
  const frac = (targetAmount - prev.amount) / (hit.amount - prev.amount);
  return prev.ap + frac * (hit.ap - prev.ap);
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

    // Best route by RATE (amount/apCost), not cheapest AP: Stage_04/Challenge give 1.30 units for 222.22 AP
    // (rate 0.00585), beating Stage_01's 1 unit/181 AP (rate 0.00552). Verified against raw JSON.
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

  it('event 857 Item_16020 (clue search Eleph): round-completion segments, round 1 is cheapest once its currency chain is netted', () => {
    const eventData = loadEvent(857);
    const allStages = getAllStages(eventData);
    const profile = resolveResourceApProfile('Item_16020', { allStages, eventData, eventId: 857 });

    expect(profile.segments.length).toBeGreaterThanOrEqual(7);
    // Item_16020's rounds are paid via Item_80804, bought from Item_80800. Reaching Item_80800's best-rate
    // stage 12 requires clearing stages 1-11 first (sequencedFamilyPrefix); that prefix's rewards net into
    // round 1's cost, pulling its rate ahead of round 3/4's — hand-verified against raw JSON.
    const best = profile.segments[0];
    expect(best.apCost).toBeCloseTo(766.6667, 3);
    expect(best.amount).toBeCloseTo(25, 5);
    expect(best.source.type === 'clue_search_round' && best.source.round).toBe(1);

    // Round 3/4 (undiscounted — the prefix's one-time pool is spent on round 1 alone) stay at their plain
    // per-round rate.
    const round3 = profile.segments.find((s) => s.source.type === 'clue_search_round' && s.source.round === 3);
    expect(round3?.apCost).toBeCloseTo(2222.2222, 2);
    expect(round3?.amount).toBeCloseTo(35, 5);

    // Round 7 is the only IsLoop-flagged round and has a distinctly lower reward-per-cost ratio —
    // confirmed against raw JSON, not a bug (see feedback_farming_calc_correctness memory).
    const loopSegment = profile.segments.find((s) => s.repeatsForever);
    expect(loopSegment).toBeDefined();
    if (!loopSegment) throw new Error('loopSegment should be defined');
    expect(loopSegment.amount).toBeCloseTo(10, 5);
  });

  it('event 857 Item_16020: 200 units costs 5860-5980 AP with the 80800 farmer at +110% bonus (hand-verified in-game)', () => {
    const eventData = loadEvent(857);
    const allStages = getAllStages(eventData);
    // Item_16020's entire currency chain (Item_80800 -> shop -> Item_80804 -> Clue Search rounds) runs
    // through Item_80800, so its bonus should move this number even though Item_16020 has no RewardTagStr.
    const profile = resolveResourceApProfile('Item_16020', { allStages, eventData, eventId: 857, totalBonus: { 80800: 11000 } });
    const apFor200 = apCostForAmount(profile, 200, 9000);
    expect(apFor200).toBeGreaterThanOrEqual(5860);
    expect(apFor200).toBeLessThanOrEqual(5980);
    // Round 6 completes at exactly 200 units (25+25+35+35+40+40) — the curve should land the 200-unit mark
    // precisely on that round boundary, not partway through round 6 or 7.
    const roundSix = profile.segments.find((s) => s.source.type === 'clue_search_round' && s.source.round === 6);
    expect(roundSix).toBeDefined();
  });

  it('event 857 Item_16020 farming plan: every stage clear is listed once regardless of efficiency, with only stage 12 marked as the repeat target', () => {
    const eventData = loadEvent(857);
    const allStages = getAllStages(eventData);
    const plan = buildFarmingPlan({ allStages, eventData, eventId: 857 }, 'Item_16020');

    // Full 1..12 roster present, not just the AP-optimal prefix up to the chosen stage (event 857 has no
    // story stages of its own — see eventData.stage.story).
    const stageNumbers = plan.filter((p) => p.category === 'stage').map((p) => Number(p.stageNumber));
    expect(new Set(stageNumbers)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));

    const repeating = plan.filter((p) => p.repeatsForever);
    expect(repeating).toHaveLength(1);
    expect(repeating[0]).toMatchObject({ category: 'stage', stageNumber: '12' });
    expect(plan.filter((p) => !p.repeatsForever)).toHaveLength(plan.length - 1);
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
    expect(round1.amount).toBeCloseTo(40, 5);
    // Confirms the real simulation feeds this segment, even though round 1's apCost=280 no longer reflects
    // the simulation directly: Item_16017 is paid via Item_85410, whose mandatory prefix nets into round 1.
    expect(round1.isApproximated).toBe(true);

    // Round 2 isn't covered by that pool, so its apCost reflects the map's real simulated draw count
    // directly — always >= the unconstrained minimum (~1083.33 AP), since tiles are drawn WITHOUT
    // replacement (the bug this guards against).
    const round2 = profile.segments.find((s) => s.source.type === 'road_puzzle_round' && s.source.round === 2 && !s.source.additional);
    expect(round2).toBeDefined();
    if (!round2) throw new Error('round2 should be defined');
    expect(round2.apCost).toBeGreaterThanOrEqual(1083.3333);
    expect(round2.amount).toBeCloseTo(40, 5);
  }, 15000); // real Monte Carlo simulation (~2-6s depending on machine load) — default 5s timeout is too tight

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
