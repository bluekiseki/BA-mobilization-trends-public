import { beforeEach, expect, it } from 'vitest';
import { acceptEditOrder, clearEditOrder, nextEditId, observeEditClock } from './crossTabEditOrder';

beforeEach(clearEditOrder);

it('orders edits across tabs without depending on wall-clock time', () => {
  const base = Number(nextEditId('clock').split(':')[0]);
  expect(acceptEditOrder('growthPlans', `${base + 20}:tab-b`)).toBe(true);
  const next = nextEditId('growthPlans');
  expect(next.startsWith(`${base + 21}:`)).toBe(true);
  expect(acceptEditOrder('growthPlans', `${base + 19}:tab-a`)).toBe(false);
  expect(acceptEditOrder('growthPlans', next)).toBe(false);
  expect(acceptEditOrder('growthPlans', `${base + 22}:tab-b`)).toBe(true);
});

it('resolves simultaneous counters consistently and keeps keys independent', () => {
  expect(acceptEditOrder('growthPlans', '2:b')).toBe(true);
  expect(acceptEditOrder('growthPlans', '2:a')).toBe(false);
  expect(acceptEditOrder('equipmentPlan', '1:a')).toBe(true);
});

it('continues from persisted edit counters after a reload', () => {
  const base = Number(nextEditId('clock').split(':')[0]);
  observeEditClock({ growthPlans: `${base + 99}:previous-session` });
  expect(nextEditId('growthPlans').startsWith(`${base + 100}:`)).toBe(true);
});

it('keeps its logical clock when profile edit identities are cleared', () => {
  const before = Number(nextEditId('growthPlans').split(':')[0]);
  clearEditOrder();
  const after = Number(nextEditId('growthPlans').split(':')[0]);
  expect(after).toBeGreaterThan(before);
});
