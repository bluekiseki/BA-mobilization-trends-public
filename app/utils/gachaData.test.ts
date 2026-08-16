import { describe, it, expect } from 'vitest';
import { parseAndGroupBanners, withPickupFallbackStudents } from './gachaData';
import type { BannerPeriod, Student } from './gachaData';

// Makoto (Swimsuit) — the "recruit charge" system takes effect from the earliest banner
// (per region) that features this student, identified by studentId 10146 (raw CSV id may be
// the predicted "x10146" until confirmed).
const CHARGE_SYSTEM_TRIGGER_ID = 10146;

describe('parseAndGroupBanners — recruit charge system cutoff', () => {
  it('marks JP banners at/after the Makoto (Swimsuit) pickup as useChargeSystem, and earlier ones as legacy', () => {
    const banners = parseAndGroupBanners('JP', null);
    const trigger = banners.find((b) => b.pickupStudents.some((s) => s.id === CHARGE_SYSTEM_TRIGGER_ID));
    expect(trigger).toBeDefined();
    expect(trigger?.useChargeSystem).toBe(true);

    if (!trigger) throw new Error('trigger must be defined');
    const cutoff = new Date(trigger.startTime).getTime();
    for (const b of banners) {
      expect(b.useChargeSystem).toBe(new Date(b.startTime).getTime() >= cutoff);
    }
  });

  it('marks KR banners using its own (later) Makoto (Swimsuit) pickup date, independent of JP', () => {
    const jpBanners = parseAndGroupBanners('JP', null);
    const krBanners = parseAndGroupBanners('KR', null);

    const jpTrigger = jpBanners.find((b) => b.pickupStudents.some((s) => s.id === CHARGE_SYSTEM_TRIGGER_ID));
    const krTrigger = krBanners.find((b) => b.pickupStudents.some((s) => s.id === CHARGE_SYSTEM_TRIGGER_ID));
    expect(jpTrigger).toBeDefined();
    expect(krTrigger).toBeDefined();
    expect(krTrigger?.useChargeSystem).toBe(true);

    if (!jpTrigger || !krTrigger) throw new Error('triggers must be defined');
    // KR's trigger banner is later than JP's, so KR's own cutoff must not leak into JP's timeline or vice versa.
    expect(new Date(krTrigger.startTime).getTime()).toBeGreaterThan(new Date(jpTrigger.startTime).getTime());

    const krCutoff = new Date(krTrigger.startTime).getTime();
    for (const b of krBanners) {
      expect(b.useChargeSystem).toBe(new Date(b.startTime).getTime() >= krCutoff);
    }
  });

  it("normalizes the predicted 'x'-prefixed studentId so the trigger banner's pickup id is a real number", () => {
    const banners = parseAndGroupBanners('JP', null);
    const trigger = banners.find((b) => b.pickupStudents.some((s) => s.id === CHARGE_SYSTEM_TRIGGER_ID));
    const student = trigger?.pickupStudents.find((s) => s.id === CHARGE_SYSTEM_TRIGGER_ID);
    expect(student?.id).toBe(CHARGE_SYSTEM_TRIGGER_ID);
    expect(Number.isNaN(student?.id)).toBe(false);
  });
});

describe('withPickupFallbackStudents', () => {
  const makeStudent = (id: number, name: string): Student => ({ id, name, isLimited: false, isFes: false, isRerun: false, isRecall: false });
  const makeBanner = (pickupStudents: Student[]): BannerPeriod => ({
    id: `${pickupStudents[0]?.id ?? 0}`,
    startTime: '2026-01-01 00:00',
    endTime: '2026-01-08 00:00',
    isFes: false,
    isLimitedBanner: true,
    isRerunBanner: false,
    isRecall: false,
    freePulls: 0,
    useChargeSystem: true,
    pickupStudents,
  });

  it('fills in a pickup student missing from the base (SchaleDB-derived) roster', () => {
    const base = [makeStudent(1, 'known')];
    const unreleased = makeStudent(10146, 'Makoto (Swimsuit)');
    const banners = [makeBanner([unreleased])];

    const merged = withPickupFallbackStudents(base, banners);

    expect(merged).toHaveLength(2);
    expect(merged.find((s) => s.id === 10146)).toEqual(unreleased);
  });

  it('does not duplicate a pickup student already present in the base roster', () => {
    const known = makeStudent(1, 'known');
    const banners = [makeBanner([known])];

    const merged = withPickupFallbackStudents([known], banners);

    expect(merged).toHaveLength(1);
  });
});
