import type { EventData } from '~/types/plannerData';

// --- Simulation Engine ---
export const runSimulation = (gachaData: EventData['fortune_gacha'], simRuns: number): { avgCost: number; avgRewards: Record<string, number> } => {
  if (!gachaData || simRuns <= 0) return { avgCost: 0, avgRewards: {} };

  const totalRewards: Record<string, number> = {};
  const costPerPull = gachaData.shop[0].CostGoods.ConsumeParcelAmount[0];
  const totalPulls = simRuns;

  const pityInfo = gachaData.modify[0];
  const baseProbs = gachaData.shop.map((item) => item.Prob);
  const totalBaseProb = baseProbs.reduce((sum, p) => sum + p, 0);

  let currentProbs = [...baseProbs];
  let pityCounter = 0;

  for (let i = 0; i < totalPulls; i++) {
    // 1. Apply probability correction
    if (pityCounter >= pityInfo.ProbModifyStartCount) {
      gachaData.shop.forEach((item, index) => {
        if (item.ProbModifyValue > 0) {
          currentProbs[index] = Math.min(currentProbs[index] + item.ProbModifyValue, item.ProbModifyLimit);
        } else if (item.ProbModifyValue < 0) {
          currentProbs[index] = Math.max(currentProbs[index] + item.ProbModifyValue, item.ProbModifyLimit);
        }
      });
    }

    // 2. Normalize probabilities
    const currentTotalProb = currentProbs.reduce((sum, p) => sum + p, 0);
    const normalizedProbs = currentProbs.map((p) => (p * totalBaseProb) / currentTotalProb);

    // 3. Execute draw
    const rand = Math.random() * totalBaseProb;
    let cumulativeProb = 0;
    let selectedItemIndex = -1;

    for (let j = 0; j < normalizedProbs.length; j++) {
      cumulativeProb += normalizedProbs[j];
      if (rand < cumulativeProb) {
        selectedItemIndex = j;
        break;
      }
    }

    const selectedItem = gachaData.shop[selectedItemIndex];

    // 4. Add reward and update pity counter
    selectedItem.RewardParcelId.forEach((id, index) => {
      const type = selectedItem.RewardParcelTypeStr[index];
      const key = `${type}_${id}`;
      totalRewards[key] = (totalRewards[key] || 0) + selectedItem.RewardParcelAmount[index];
    });

    if (selectedItem.Grade === pityInfo.TargetGrade) {
      pityCounter = 0;
      currentProbs = [...baseProbs];
    } else {
      pityCounter++;
    }
  }

  // 5. Calculate average values
  const avgRewards: Record<string, number> = {};
  for (const [key, amount] of Object.entries(totalRewards)) {
    avgRewards[key] = amount / totalPulls;
  }

  return { avgCost: costPerPull, avgRewards };
};
