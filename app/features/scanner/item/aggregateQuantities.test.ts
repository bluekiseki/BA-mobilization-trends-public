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

function photo(id: string, quantities: number[]): ImageScanResult {
  return {
    kind: 'image',
    id,
    fileName: id,
    objectUrl: '',
    results: quantities.map((quantity, index) => ({
      icon: ticket,
      quantity,
      similarity: 0.9,
      quantityConfidence: 0.8,
      cell: { x: index * 100, y: 0, w: 80, h: 80 },
    })),
  };
}

describe('aggregateConfirmedQuantities', () => {
  it('adds separate stacks of the same recognized ticket within one file', () => {
    expect(aggregateConfirmedQuantities([photo('a', [3, 2])], { 'a::0': true, 'a::1': true }, {}).get(ticket.inventoryKey)).toBe(5);
  });

  it('takes the maximum file total rather than summing across uploads', () => {
    const entries = [photo('a', [3, 2]), photo('b', [4, 3])];
    const confirmed = Object.fromEntries(entries.flatMap((entry) => entry.results.map((_, index) => [makeInstanceKey(entry.id, index), true])));
    expect(aggregateConfirmedQuantities(entries, confirmed, {}).get(ticket.inventoryKey)).toBe(7);
    expect(aggregateConfirmedQuantities(entries.toReversed(), confirmed, {}).get(ticket.inventoryKey)).toBe(7);
  });

  it('uses edits and omits unconfirmed instances', () => {
    expect(aggregateConfirmedQuantities([photo('a', [3, 99])], { 'a::0': true }, { 'a::0': 5 }).get(ticket.inventoryKey)).toBe(5);
    expect(aggregateConfirmedQuantities([photo('a', [3])], {}, {}).has(ticket.inventoryKey)).toBe(false);
  });

  it('recomputes the maximum when confirmation is cancelled or a file is deleted', () => {
    const entries = [photo('a', [3, 2]), photo('b', [4, 3])];
    const confirmed = { 'a::0': true, 'a::1': true, 'b::0': true, 'b::1': false };
    expect(aggregateConfirmedQuantities(entries, confirmed, {}).get(ticket.inventoryKey)).toBe(5);
    expect(aggregateConfirmedQuantities([entries[1]], confirmed, {}).get(ticket.inventoryKey)).toBe(4);
  });
});
