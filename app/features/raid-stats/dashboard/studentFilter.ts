export interface StudentFilterState {
  excludeIds: number[];
  includeIds: number[];
  allowAssist: boolean;
}

export function createStudentFilter(): StudentFilterState {
  return { excludeIds: [], includeIds: [], allowAssist: false };
}

export function matchesStudentFilter(parties: readonly (readonly number[])[], filter: StudentFilterState): boolean {
  const allIds = new Set(parties.flat());
  if (filter.includeIds.some((id) => !allIds.has(id))) return false;
  const excludedIds = new Set(filter.excludeIds);
  const limit = filter.allowAssist ? 1 : 0;
  return parties.every((party) => [...new Set(party)].filter((id) => excludedIds.has(id)).length <= limit);
}
