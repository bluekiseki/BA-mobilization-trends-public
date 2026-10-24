/**
 * Combat-style merged student ID management.
 *
 * Students whose combat-style variants are separate roster ids but were
 * originally collapsed in raw record data. Every dataset treats
 * these ids as fully independent BY DEFAULT, exactly like any other student.
 *
 * This list exists so the handful of features that intentionally show a
 * combined view (ranking, network analysis: always merged; heatmap: merged by
 * default with a toggle) can look up which ids belong together. Call the
 * helpers below explicitly at those specific spots only — never fold merging
 * into a shared/default data-fetching path.
 *
 * The two IDs in each group represent one student with different combat
 * styles. Features that use a combined view display both portraits so the
 * underlying styles remain recognizable.
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
