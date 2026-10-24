import type { EventData } from '~/types/plannerData';
import { type DiceRaceSimConfig } from '~/types/minigame/diceRace';
import type { WithNonNullable } from '~/utils/WithNonNullable';
import { createSeededRandom, deriveSeed } from '~/utils/rng';

type RouteSummary = { avgCost: Record<string, number>; avgRewards: Record<string, number> };
export const runSimulation = (
  diceRaceData: EventData['dice_race'],
  simConfig: DiceRaceSimConfig,
  eventData: WithNonNullable<EventData, 'currency' | 'dice_race'>, // currency data for checking fixed dice
  options?: {
    checkpoints?: number[]; // record cumulative cost/reward snapshots the moment currentLap first reaches each value
    // Seeds every run's dice streams so two strategies simulated with the same seed face the same luck (paired comparison).
    seed?: number;
    // Also return per-run rolls and the amount of this reward key, for paired statistics.
    perRunRewardKey?: string;
  },
): {
  avgCost: Record<string, number>;
  avgRewards: Record<string, number>;
  avgRolls: number;
  avgFixedDiceUsed: number;
  checkpoints: Record<number, RouteSummary>;
  perRun?: { rolls: Float64Array; reward: Float64Array };
} => {
  if (!diceRaceData || simConfig.simRuns <= 0) return { avgCost: {}, avgRewards: {}, avgRolls: 0, avgFixedDiceUsed: 0, checkpoints: {} };

  const { simRuns, startLap, startPos, ownedFixedDice, endConditionType, targetLap, targetPos, targetItemId, targetItemAmount, fixedDicePriority } = simConfig;
  const allowDoubleFixedDice = simConfig.allowDoubleFixedDice ?? false;
  const { race_node, total_reward, info } = diceRaceData;
  const boardSize = race_node.length;
  const costInfo = info[0].DiceCostGoods;
  const costPerRoll = costInfo.ConsumeParcelAmount[0];
  const costKey = `${costInfo.ConsumeParcelTypeStr[0]}_${costInfo.ConsumeParcelId[0]}`;
  // Set for quick lookup of fixed dice item IDs
  const fixedDiceItemIds = new Set(eventData.currency.map((c) => c.ItemUniqueId));
  const checkpointLaps = options?.checkpoints ?? [];
  const seed = options?.seed;
  const perRunRewardKey = options?.perRunRewardKey;
  const perRun = perRunRewardKey !== undefined ? { rolls: new Float64Array(simRuns), reward: new Float64Array(simRuns) } : undefined;
  const priorityTiles = new Set(fixedDicePriority);

  // Pure landing prediction (no rewards, no randomness): follows forward-move tiles to the tile where the token rests.
  const predictLanding = (pos: number, die: number): number => {
    let landing = (pos + die) % boardSize;
    for (let hops = 0; hops < boardSize && race_node[landing].EventContentDiceRaceNodeType === 2; hops++) {
      landing = (landing + (race_node[landing].MoveForwardTypeArg ?? 0)) % boardSize;
    }
    return landing;
  };

  const totalSimCost: Record<string, number> = {};
  const totalSimRewards: Record<string, number> = {};
  let totalRolls = 0;
  let totalFixedDiceUsed = 0;
  // Sum (across simRuns) of the cost/reward snapshot taken the instant each checkpoint lap is first reached.
  const totalCheckpointCost: Record<number, number> = {};
  const totalCheckpointRewards: Record<number, Record<string, number>> = {};

  for (let i = 0; i < simRuns; i++) {
    // Separate streams: the k-th plain roll and the k-th earned fixed die are the same across strategies.
    const rollRandom = seed === undefined ? Math.random : createSeededRandom(deriveSeed(seed, i, 0));
    const dieRandom = seed === undefined ? Math.random : createSeededRandom(deriveSeed(seed, i, 1));
    let currentLap = startLap;
    let currentPos = startPos;
    const currentFixedDice = { ...ownedFixedDice };
    const accumulatedRewards: Record<string, number> = {};
    let rollsInThisRun = 0;
    let fixedDiceUsedInThisRun = 0;

    const movePlayer = (diceValue: number) => {
      let newPos = currentPos + diceValue;
      if (newPos >= boardSize) {
        currentLap++;
        newPos %= boardSize;
        const lapReward = total_reward.find((r) => r.RequiredLapFinishCount === currentLap);

        if (lapReward) {
          lapReward.RewardParcelId.forEach((id, index) => {
            const type = lapReward.RewardParcelTypeStr[index];
            const itemInfo = eventData.icons[type]?.[id];

            // Handle fixed die rewards from laps
            if (itemInfo && 'UsingResultParcelTypeStr' in itemInfo && itemInfo.UsingResultParcelTypeStr === 'GachaGroup' && fixedDiceItemIds.has(id)) {
              const randomDie = Math.floor(dieRandom() * 6) + 1;
              currentFixedDice[randomDie as 1]++;
            } else {
              const key = `${type}_${id}`;
              accumulatedRewards[key] = (accumulatedRewards[key] || 0) + lapReward.RewardParcelAmount[index];
            }
          });
        }
        if (checkpointLaps.includes(currentLap)) {
          totalCheckpointCost[currentLap] = (totalCheckpointCost[currentLap] ?? 0) + rollsInThisRun * costPerRoll;
          const snapshot = (totalCheckpointRewards[currentLap] ??= {});
          for (const [key, amount] of Object.entries(accumulatedRewards)) {
            snapshot[key] = (snapshot[key] ?? 0) + amount;
          }
        }
      }
      currentPos = newPos;
      const landedNode = race_node[currentPos];
      if (landedNode.EventContentDiceRaceNodeType === 2) {
        movePlayer(landedNode.MoveForwardTypeArg ?? 0);
      } else if (landedNode.RewardParcelId) {
        landedNode.RewardParcelId.forEach((id, index) => {
          const type = landedNode.RewardParcelTypeStr[index];
          const itemInfo = eventData.icons[type]?.[id];

          // Handle fixed die rewards from nodes
          if (itemInfo && 'UsingResultParcelTypeStr' in itemInfo && itemInfo?.UsingResultParcelTypeStr === 'GachaGroup' && fixedDiceItemIds.has(id)) {
            const randomDie = Math.floor(dieRandom() * 6) + 1;
            currentFixedDice[randomDie as 1]++;
          } else {
            const key = `${type}_${id}`;
            accumulatedRewards[key] = (accumulatedRewards[key] || 0) + (landedNode.RewardAmount?.[index] ?? 0);
          }
        });
      }
    };

    const isDone = () => {
      if (endConditionType === 'lap_pos') return currentLap > targetLap || (currentLap === targetLap && currentPos >= targetPos);
      return (accumulatedRewards[`Item_${targetItemId}`] || 0) >= targetItemAmount;
    };

    // Returns the fixed dice to spend this turn: one die if it lands on a priority tile, otherwise (when allowed)
    // an ordered pair of dice whose combined movement ends on a priority tile.
    const pickFixedDice = (): number[] | null => {
      for (let die = 6; die >= 1; die--) {
        if (currentFixedDice[die as 1] > 0 && priorityTiles.has((currentPos + die) % boardSize)) return [die];
      }
      if (!allowDoubleFixedDice) return null;
      for (let first = 6; first >= 1; first--) {
        if (currentFixedDice[first as 1] <= 0) continue;
        const midPos = predictLanding(currentPos, first);
        for (let second = 6; second >= 1; second--) {
          const owned = currentFixedDice[second as 1] - (second === first ? 1 : 0);
          if (owned > 0 && priorityTiles.has(predictLanding(midPos, second))) return [first, second];
        }
      }
      return null;
    };

    while (rollsInThisRun < 5000) {
      if (isDone()) break;

      const fixedDice = pickFixedDice();
      if (fixedDice) {
        for (const die of fixedDice) {
          currentFixedDice[die as 1]--;
          fixedDiceUsedInThisRun++;
          movePlayer(die);
          // The goal may already be met after the first die; keep the second one unspent in that case.
          if (isDone()) break;
        }
        continue;
      }

      rollsInThisRun++;
      const roll = Math.floor(rollRandom() * 6) + 1;
      movePlayer(roll);
    }

    if (perRun && perRunRewardKey !== undefined) {
      perRun.rolls[i] = rollsInThisRun;
      perRun.reward[i] = accumulatedRewards[perRunRewardKey] ?? 0;
    }
    totalRolls += rollsInThisRun;
    totalFixedDiceUsed += fixedDiceUsedInThisRun;
    totalSimCost[costKey] = (totalSimCost[costKey] || 0) + rollsInThisRun * costPerRoll;
    for (const [key, amount] of Object.entries(accumulatedRewards)) {
      totalSimRewards[key] = (totalSimRewards[key] || 0) + amount;
    }
  }

  const avgCost: Record<string, number> = {};
  const avgRewards: Record<string, number> = {};
  for (const [key, amount] of Object.entries(totalSimCost)) {
    avgCost[key] = amount / simRuns;
  }
  for (const [key, amount] of Object.entries(totalSimRewards)) {
    avgRewards[key] = amount / simRuns;
  }

  const checkpoints: Record<number, RouteSummary> = {};
  for (const lap of checkpointLaps) {
    const cost = totalCheckpointCost[lap];
    if (cost === undefined) continue; // never reached within targetLap for any run
    const rewards = totalCheckpointRewards[lap] ?? {};
    const lapAvgRewards: Record<string, number> = {};
    for (const [key, amount] of Object.entries(rewards)) {
      lapAvgRewards[key] = amount / simRuns;
    }
    checkpoints[lap] = { avgCost: { [costKey]: cost / simRuns }, avgRewards: lapAvgRewards };
  }

  const avgRolls = totalRolls / simRuns;
  return { avgCost, avgRewards, avgRolls, avgFixedDiceUsed: totalFixedDiceUsed / simRuns, checkpoints, perRun };
};
