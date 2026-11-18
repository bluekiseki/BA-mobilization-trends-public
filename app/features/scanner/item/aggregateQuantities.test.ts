import { describe, expect, it } from 'vitest';
import { aggregateConfirmedQuantities } from './aggregateQuantities';
import { makeInstanceKey, type IconEntry, type ImageScanResult } from '../core/types';

const ticket: IconEntry = {
  inventoryKey: 'Item_10',
  name: 'Ticket',
  numericId: '10',
  dataUrl: '',
  isGift: false,
  localizeEtc: { NameEn: 'Ticket', NameKr: '티켓', NameJp: 'チケット' },
};

function photo(id: string, quantities: number[], icon: IconEntry = ticket): ImageScanResult {
  return {
    kind: 'image',
    id,
    fileName: id,
    objectUrl: '',
    results: quantities.map((quantity, index) => ({
      icon,
      quantity,
      similarity: 0.9,
      quantityConfidence: 0.8,
      cell: { x: index * 100, y: 0, w: 80, h: 80 },
    })),
  };
}

describe('aggregateConfirmedQuantities', () => {
  it('takes the larger cell for duplicated items that are not summed', () => {
    expect(aggregateConfirmedQuantities([photo('a', [3, 2])], { 'a::0': true, 'a::1': true }, {}).get(ticket.inventoryKey)).toBe(3);
  });

  it.each([
    ['gift', { isGift: true }],
    ['eleph', { itemCategory: 2 }],
    ['base OOPart', { inventoryKey: 'Item_120', numericId: '120', itemCategory: 3 }],
  ])('adds separate stacks of a %s within one file', (_label, overrides) => {
    const icon: IconEntry = { ...ticket, ...overrides };
    expect(aggregateConfirmedQuantities([photo('a', [3, 2], icon)], { 'a::0': true, 'a::1': true }, {}).get(icon.inventoryKey)).toBe(5);
  });

  it('does not add OOPart selection tickets', () => {
    const icon: IconEntry = { ...ticket, inventoryKey: 'Item_9000', numericId: '9000', itemCategory: 3 };
    expect(aggregateConfirmedQuantities([photo('a', [3, 2], icon)], { 'a::0': true, 'a::1': true }, {}).get(icon.inventoryKey)).toBe(3);
  });

  it('takes the maximum file total rather than summing across uploads', () => {
    const gift: IconEntry = { ...ticket, isGift: true };
    const entries = [photo('a', [3, 2], gift), photo('b', [4, 3], gift)];
    const confirmed = Object.fromEntries(entries.flatMap((entry) => entry.results.map((_, index) => [makeInstanceKey(entry.id, index), true])));
    expect(aggregateConfirmedQuantities(entries, confirmed, {}).get(gift.inventoryKey)).toBe(7);
    expect(aggregateConfirmedQuantities(entries.toReversed(), confirmed, {}).get(gift.inventoryKey)).toBe(7);
  });

  it('uses edits and omits unconfirmed instances', () => {
    expect(aggregateConfirmedQuantities([photo('a', [3, 99])], { 'a::0': true }, { 'a::0': 5 }).get(ticket.inventoryKey)).toBe(5);
    expect(aggregateConfirmedQuantities([photo('a', [3])], {}, {}).has(ticket.inventoryKey)).toBe(false);
  });

  it('recomputes the maximum when confirmation is cancelled or a file is deleted', () => {
    const gift: IconEntry = { ...ticket, isGift: true };
    const entries = [photo('a', [3, 2], gift), photo('b', [4, 3], gift)];
    const confirmed = { 'a::0': true, 'a::1': true, 'b::0': true, 'b::1': false };
    expect(aggregateConfirmedQuantities(entries, confirmed, {}).get(gift.inventoryKey)).toBe(5);
    expect(aggregateConfirmedQuantities([entries[1]], confirmed, {}).get(gift.inventoryKey)).toBe(4);
  });
});
