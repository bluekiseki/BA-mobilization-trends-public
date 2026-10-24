import type { DisplayMode, ResourceEntry, SortKey } from '~/features/inventory/logic/inventoryDashboard';
import { getDisplayAmount, SHOP_CATEGORY_LABEL, sortResourceEntries } from '~/features/inventory/logic/inventoryDashboard';
import type { ItemType } from '~/utils/itemType';

export type FilterKey = 'types' | 'schools' | 'roles' | 'squads' | 'shopCategories' | 'tags' | 'rarities';

export interface EntryFilterState {
  selectedTypes: Set<ItemType>;
  selectedSchools: Set<string>;
  selectedRoles: Set<string>;
  selectedSquads: Set<string>;
  selectedShopCategories: Set<string>;
  selectedTags: Set<string>;
  selectedRarities: Set<string>;
  onlyNonZero: boolean;
  displayMode: DisplayMode;
  searchQuery: string;
  matcher: (target: string, query: string) => boolean;
  poolVisibleKeys: Set<string>;
}

/** Applies every active filter except `exclude`, so each option list only hides zero-match values under the other filters. */
export function applyEntryFilters(source: ResourceEntry[], exclude: FilterKey | null, state: EntryFilterState): ResourceEntry[] {
  let base = source;
  if (exclude !== 'types' && state.selectedTypes.size > 0) base = base.filter((e) => state.selectedTypes.has(e.itemType));
  if (exclude !== 'schools' && state.selectedSchools.size > 0) base = base.filter((e) => e.school === null || state.selectedSchools.has(e.school));
  if (exclude !== 'roles' && state.selectedRoles.size > 0) base = base.filter((e) => e.tacticRole === null || state.selectedRoles.has(e.tacticRole));
  if (exclude !== 'squads' && state.selectedSquads.size > 0) base = base.filter((e) => e.squadType === null || state.selectedSquads.has(e.squadType));
  if (exclude !== 'shopCategories' && state.selectedShopCategories.size > 0) {
    // Unlike school/role/squad, an empty array here just means "no categories" — it doesn't
    // bypass the filter, it simply fails to match.
    base = base.filter((e) => e.shopCategories.some((c) => state.selectedShopCategories.has(String(c))));
  }
  if (exclude !== 'tags' && state.selectedTags.size > 0) base = base.filter((e) => e.tags.some((t) => state.selectedTags.has(t)));
  if (exclude !== 'rarities' && state.selectedRarities.size > 0) base = base.filter((e) => state.selectedRarities.has(String(e.rarity)));
  // Fungible-pool keys (reports/equipment stones) stay visible as a set whenever the pool has
  // any demand or supply at all — otherwise a single 0-owned tier would drop out of an
  // otherwise-relevant set of 4 rarity icons. Non-pool items keep the plain per-key check.
  if (state.onlyNonZero) base = base.filter((e) => state.poolVisibleKeys.has(e.key) || getDisplayAmount(e.owned, e.needed, state.displayMode) !== 0);
  if (state.searchQuery.trim()) base = base.filter((e) => state.matcher(e.name, state.searchQuery.trim()));
  return base;
}

/** School options that still match under the other active filters, plus the current selection. */
export function buildSchoolOptions(entries: ResourceEntry[], state: EntryFilterState, label: (school: string, fallback: string) => string) {
  const present = new Set<string>();
  for (const e of applyEntryFilters(entries, 'schools', state)) if (e.school !== null) present.add(e.school);
  return Array.from(new Set([...present, ...state.selectedSchools]))
    .sort()
    .map((s) => ({ value: s, label: label(s, s) }));
}

/** Shop-category options that still match under the other active filters, plus the current selection. */
export function buildShopCategoryOptions(entries: ResourceEntry[], state: EntryFilterState) {
  const present = new Set<number>();
  for (const e of applyEntryFilters(entries, 'shopCategories', state)) for (const c of e.shopCategories) present.add(c);
  return Array.from(new Set([...present, ...[...state.selectedShopCategories].map(Number)]))
    .sort((a, b) => a - b)
    .map((c) => ({ value: String(c), label: SHOP_CATEGORY_LABEL[c] ?? String(c) }));
}

/** Tag options that still match under the other active filters, plus the current selection. */
export function buildTagOptions(entries: ResourceEntry[], state: EntryFilterState) {
  const present = new Set<string>();
  for (const e of applyEntryFilters(entries, 'tags', state)) for (const tag of e.tags) present.add(tag);
  return Array.from(new Set([...present, ...state.selectedTags]))
    .sort()
    .map((tag) => ({ value: tag, label: tag }));
}

/** Rarity options (0-based item tier) that still match under the other active filters, plus the current selection. */
export function buildRarityOptions(entries: ResourceEntry[], state: EntryFilterState) {
  const present = new Set<number>();
  for (const e of applyEntryFilters(entries, 'rarities', state)) present.add(e.rarity);
  return Array.from(new Set([...present, ...[...state.selectedRarities].map(Number)]))
    .sort((a, b) => a - b)
    .map((r) => ({ value: String(r), label: String(r) }));
}

/** The filtered entries in the chosen sort order. */
export function listFilteredEntries(entries: ResourceEntry[], state: EntryFilterState, sortBy: SortKey, fungibleDeficitByKey: Record<string, number>) {
  return sortResourceEntries(applyEntryFilters(entries, null, state), sortBy, fungibleDeficitByKey);
}
