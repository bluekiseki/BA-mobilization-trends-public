/**
 * Related roster IDs for views that combine combat styles.
 * Shared data loaders keep the IDs separate; combined views use these helpers explicitly.
 */

export const COMBAT_STYLE_GROUPS: number[][] = [
  [10098, 10099], // Hoshino (Battle): defender / attacker variants
  [10143, 10144], // Shun / Shuering (Swimsuit): combat style variants
];

export function isCombatStyleMerged(rosterId: number): boolean {
  return COMBAT_STYLE_GROUPS.some((group) => group.includes(rosterId));
}

export function getCombatStyleGroupRosterIds(rosterId: number): number[] {
  return COMBAT_STYLE_GROUPS.find((group) => group.includes(rosterId)) ?? [rosterId];
}

export function getCombatStyleDisplayId(rosterId: number): number {
  return getCombatStyleGroupRosterIds(rosterId)[0];
}

/** The first id is the canonical planner id for a combat-style pair. */
export function getCombatStyleRepresentativeId(rosterId: number): number {
  return getCombatStyleDisplayId(rosterId);
}

/** Whether this is the secondary form, which must not be offered for new plans. */
export function isCombatStyleFormOne(rosterId: number): boolean {
  const group = getCombatStyleGroupRosterIds(rosterId);
  return group.length > 1 && group[1] === rosterId;
}

/** A stable id for comparing planner records without rewriting saved ids. */
export function getCombatStylePlanGroupId(rosterId: number): number {
  return getCombatStyleRepresentativeId(rosterId);
}
