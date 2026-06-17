/** Total cost of `purchaseCount` items, starting after `alreadyPurchased` items have been bought. */
export function calcTieredCost(alreadyPurchased: number, purchaseCount: number, extraStep: number[], extraAmount: number[], baseAmount: number): number {
  if (!extraStep.length || !extraAmount.length) {
    return baseAmount * purchaseCount;
  }

  let cost = 0;
  let remaining = purchaseCount;
  let cumulative = alreadyPurchased;
  let tierStart = 0;

  for (let i = 0; i < extraStep.length && remaining > 0; i++) {
    const tierEnd = tierStart + extraStep[i];
    if (cumulative < tierEnd) {
      const buyInTier = Math.min(remaining, tierEnd - cumulative);
      cost += buyInTier * extraAmount[i];
      remaining -= buyInTier;
      cumulative += buyInTier;
    }
    tierStart = tierEnd;
  }

  // Items beyond all defined tiers use the last tier price
  if (remaining > 0) {
    cost += remaining * extraAmount[extraAmount.length - 1];
  }

  return cost;
}

/** Price per item at the tier that applies after `alreadyPurchased` items have been bought. */
export function getCurrentTierPrice(alreadyPurchased: number, extraStep: number[], extraAmount: number[], baseAmount: number): number {
  if (!extraStep.length || !extraAmount.length) {
    return baseAmount;
  }

  let tierStart = 0;
  for (let i = 0; i < extraStep.length; i++) {
    if (alreadyPurchased < tierStart + extraStep[i]) {
      return extraAmount[i];
    }
    tierStart += extraStep[i];
  }

  return extraAmount[extraAmount.length - 1];
}
