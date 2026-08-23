import { describe, it, expect } from 'vitest';
import { getRecruitCountReward, getNextTicketThreshold, getRecruitBonusTicketExpiry, getEraidTicketExpiry } from './gachaRules';

describe('getRecruitCountReward', () => {
  it('grants first-time tickets at the documented counts', () => {
    for (const count of [70, 130, 150, 170, 270, 330, 350, 370]) {
      expect(getRecruitCountReward(count)).toEqual({ ticket: 1, eligma: 0 });
    }
  });

  it('grants first-time eligma at the documented counts', () => {
    expect(getRecruitCountReward(30)).toEqual({ ticket: 0, eligma: 10 });
    expect(getRecruitCountReward(110)).toEqual({ ticket: 0, eligma: 20 });
    expect(getRecruitCountReward(230)).toEqual({ ticket: 0, eligma: 10 });
    expect(getRecruitCountReward(310)).toEqual({ ticket: 0, eligma: 20 });
  });

  it('returns no reward for counts with nothing scheduled', () => {
    expect(getRecruitCountReward(1)).toEqual({ ticket: 0, eligma: 0 });
    expect(getRecruitCountReward(20)).toEqual({ ticket: 0, eligma: 0 });
    expect(getRecruitCountReward(390)).toEqual({ ticket: 0, eligma: 0 });
  });

  it('grants repeat-tier eligma at 490/590 and their +200 cycle echoes, with no repeat-tier ticket', () => {
    expect(getRecruitCountReward(490)).toEqual({ ticket: 0, eligma: 10 });
    expect(getRecruitCountReward(590)).toEqual({ ticket: 0, eligma: 10 });
    expect(getRecruitCountReward(690)).toEqual({ ticket: 0, eligma: 10 }); // next cycle, relative 100
    expect(getRecruitCountReward(790)).toEqual({ ticket: 0, eligma: 10 }); // next cycle, relative 200
    expect(getRecruitCountReward(410)).toEqual({ ticket: 0, eligma: 0 }); // relative 20, nothing scheduled
  });
});

describe('getNextTicketThreshold', () => {
  it('returns the next scheduled threshold for a count strictly between two milestones', () => {
    expect(getNextTicketThreshold(50)).toBe(70);
    expect(getNextTicketThreshold(140)).toBe(150);
  });

  it('does not return the count itself when it already sits on a milestone', () => {
    expect(getNextTicketThreshold(70)).toBe(130);
  });

  it('returns undefined once no ticket milestones remain (count >= 370)', () => {
    expect(getNextTicketThreshold(370)).toBeUndefined();
    expect(getNextTicketThreshold(375)).toBeUndefined();
    expect(getNextTicketThreshold(390)).toBeUndefined();
    expect(getNextTicketThreshold(1000)).toBeUndefined();
  });
});

describe('getRecruitBonusTicketExpiry', () => {
  it('expires exactly 40 days after banner start, at 11:00', () => {
    const cases: [string, string][] = [
      ['2026-07-29 12:00', '2026-09-07 11:00'],
      ['2026-08-05 12:00', '2026-09-14 11:00'],
      ['2026-08-12 12:00', '2026-09-21 11:00'],
    ];
    for (const [start, expectedExpiry] of cases) {
      expect(getRecruitBonusTicketExpiry(start)).toBe(new Date(expectedExpiry).getTime());
    }
  });
});

describe('getEraidTicketExpiry', () => {
  it('expires on the last day of the month following the raid end month, at 23:59', () => {
    expect(getEraidTicketExpiry('2026-08-15 12:00')).toBe(new Date('2026-09-30 23:59').getTime());
    // December end month rolls the expiry into the following year.
    expect(getEraidTicketExpiry('2026-12-10 12:00')).toBe(new Date('2027-01-31 23:59').getTime());
  });
});
