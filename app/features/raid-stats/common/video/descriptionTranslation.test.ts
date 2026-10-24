import { describe, expect, it } from 'vitest';
import { segmentDescription, translateDescription } from './descriptionTranslation';
import { buildTitleDictionary } from './titleTranslation';

const dict = buildTitleDictionary([{ label: { en: 'Aru' }, forms: { en: ['Aru'], ja: ['アル'] }, priority: 1 }], 'en');

describe('description translation', () => {
  it('keeps a phrase together instead of translating its individual terms', () => {
    const phrases = buildTitleDictionary(
      [
        { label: { en: 'Crit' }, forms: { ja: ['会心'] }, priority: 1 },
        { label: { en: 'It clears if it crits' }, forms: { ja: ['会心出れば通ります'] }, priority: 1 },
      ],
      'en',
    );
    expect(segmentDescription('会心出れば通ります。', phrases)).toEqual([{ src: '会心出れば通ります', dst: 'It clears if it crits' }, '。']);
  });
  it('retains the original term for ruby annotations', () => {
    expect(segmentDescription('アル\nhttps://example.com/Aru', dict)).toEqual([{ src: 'アル', dst: 'Aru' }, '\n', 'https://example.com/Aru']);
  });
  it('translates terms without changing URLs, timestamps or line breaks', () => {
    const text = '00:15 アル\nhttps://example.com/Aru?q=アル\n\n02:30 Aru';
    expect(translateDescription(text, dict)).toBe('00:15 Aru\nhttps://example.com/Aru?q=アル\n\n02:30 Aru');
  });

  it('preserves text with no matching terms', () => {
    const text = 'Thanks for watching!\n00:00 Start';
    expect(translateDescription(text, dict)).toBe(text);
  });
});
