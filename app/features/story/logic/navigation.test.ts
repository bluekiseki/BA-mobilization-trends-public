import { describe, expect, it } from 'vitest';
import { readStoryFilters, splitSeriesTitle, storyListPath, storyQuery } from './navigation';

describe('story browsing navigation', () => {
  it('preserves search, year and language through detail and return links', () => {
    const search = '?q=%EC%95%84%EB%A3%A8&category=all&year=2024&order=desc&lang=ko';
    const detailQuery = storyQuery(search, { focus: 'event-34' });
    const returned = new URL(storyListPath(detailQuery), 'https://example.com');
    expect(readStoryFilters(returned.searchParams, 'kr')).toEqual({ query: '아루', category: 'all', sort: 'kr', year: '2024', descending: true });
    expect(returned.searchParams.get('lang')).toBe('ko');
    expect(returned.hash).toBe('#series-event-34');
  });

  it('defaults to the timeline of linked stories and validates incoming filters', () => {
    expect(readStoryFilters(new URLSearchParams('category=invalid&year=bad&order=invalid'))).toEqual({ query: '', category: '', sort: 'jp', year: null, descending: false });
    expect(readStoryFilters(new URLSearchParams('category=Favor')).category).toBe('Favor');
  });

  it('clears stale filters without dropping the selected language or flow selection', () => {
    const next = storyQuery('?q=test&year=2024&focus=event-1&lang=ja&selected=main-vol1_ch1', { q: '', year: null, focus: null });
    expect(new URLSearchParams(next).get('q')).toBeNull();
    expect(new URLSearchParams(next).get('lang')).toBe('ja');
    expect(storyListPath(next)).not.toContain('#');
    expect(new URLSearchParams(next).get('selected')).toBe('main-vol1_ch1');
  });
});

describe('readable main story titles', () => {
  it.each([
    ['1부 3편 3장 우리들의 이야기를', '1부 3편', '3장 우리들의 이야기를'],
    ['Act 1, Vol. 1, Ch. 1, Strange Days', 'Act 1, Vol. 1', 'Ch. 1, Strange Days'],
    ['第1部 Vol.1 第1章 対策委員会の奇妙な一日', '第1部 Vol.1', '第1章 対策委員会の奇妙な一日'],
    ['第1部第1篇第1章對策委員會奇妙的一天', '第1部第1篇', '第1章對策委員會奇妙的一天'],
  ])('retains the chapter number in %s', (label, context, title) => {
    expect(splitSeriesTitle(label, true)).toEqual({ context, title });
  });

  it('keeps unnumbered titles and event titles intact', () => {
    expect(splitSeriesTitle('2부 프롤로그', true)).toEqual({ context: '', title: '2부 프롤로그' });
    expect(splitSeriesTitle('Event Ch. 1', false)).toEqual({ context: '', title: 'Event Ch. 1' });
  });
});
