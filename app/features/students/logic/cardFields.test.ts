import { describe, expect, it } from 'vitest';
import { DEFAULT_CARD_FIELDS, parseCardFields } from './cardFields';

describe('card fields', () => {
  it('falls back to the defaults when nothing usable is saved', () => {
    expect(parseCardFields(null)).toEqual(DEFAULT_CARD_FIELDS);
    expect(parseCardFields('not json')).toEqual(DEFAULT_CARD_FIELDS);
    expect(parseCardFields('{"a":1}')).toEqual(DEFAULT_CARD_FIELDS);
  });
  it('keeps known fields in their fixed order and drops unknown ones', () => {
    expect(parseCardFields('["skills","bogus","stars"]')).toEqual(['stars', 'skills']);
  });
  it('leaves the academy off unless it was chosen', () => {
    expect(DEFAULT_CARD_FIELDS).not.toContain('school');
    expect(parseCardFields('["school","stars"]')).toEqual(['stars', 'school']);
  });
  it('allows hiding everything', () => expect(parseCardFields('[]')).toEqual([]));
});
