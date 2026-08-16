/**
 * Applies an event bonus to a repeatable reward.
 * The game rounds the bonus portion up for each run before adding it to the base reward.
 */
export function applyRepeatableEventBonus(baseAmount: number, bonusPercent: number): number {
  if (bonusPercent <= 0) return baseAmount;
  return baseAmount + Math.ceil((baseAmount * bonusPercent) / 10_000);
}
