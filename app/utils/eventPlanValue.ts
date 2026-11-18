/** Derived totals are device caches, not editable plan data. */
export function eventPlanEditValue(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const editable = { ...value } as Record<string, unknown>;
  delete editable.cachedTotalItems;
  return Object.keys(editable).length ? editable : null;
}

export function isEventCacheOnly(key: string, value: unknown): boolean {
  return key.startsWith('eventPlans:') && value !== null && typeof value === 'object' && Object.keys(value).length === 1 && Object.hasOwn(value, 'cachedTotalItems');
}
