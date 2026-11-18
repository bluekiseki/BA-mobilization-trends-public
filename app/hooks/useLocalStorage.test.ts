// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalStorage } from './useLocalStorage';
import { writeProfileStorage } from '~/store/history/localPersistence';

let root: Root;
let current: unknown;
let renders: unknown[];
function Harness({ storageKey, fallback }: { storageKey: string; fallback: unknown }) {
  [current] = useLocalStorage(storageKey, fallback);
  renders.push(current);
  return null;
}
function render(storageKey: string, fallback: unknown) {
  act(() => {
    root.render(createElement(Harness, { storageKey, fallback }));
  });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  renders = [];
  root = createRoot(document.createElement('div'));
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe('useLocalStorage', () => {
  it.each(['123', 'true', 'null', '[1]', '{"a":1}'])('preserves a plain string that is also valid JSON: %s', (raw) => {
    localStorage.setItem('text', raw);
    render('text', '');
    expect(current).toBe(raw);
    act(() => {
      writeProfileStorage('text', '"quoted"');
    });
    expect(current).toBe('quoted');
    act(() => {
      writeProfileStorage('text', raw);
    });
    expect(current).toBe(raw);
  });
  it('handles legacy plain strings and invalid JSON in storage events', () => {
    render('theme', 'system');
    act(() => {
      writeProfileStorage('theme', 'dark');
    });
    expect(current).toBe('dark');
    render('prefs', { enabled: false });
    act(() => {
      writeProfileStorage('prefs', 'not-json');
    });
    expect(current).toEqual({ enabled: false });
  });

  it('reads the new key and resets to its default when absent', () => {
    localStorage.setItem('first', '1');
    localStorage.setItem('second', '2');
    render('first', 0);
    expect(current).toBe(1);
    renders = [];
    render('second', 0);
    expect(current).toBe(2);
    expect(renders.every((value) => value === 2)).toBe(true);
    render('absent', 3);
    expect(current).toBe(3);
  });

  it('keeps object references and avoids rendering again for unchanged storage', () => {
    const raw = '{"enabled":true}';
    localStorage.setItem('prefs', raw);
    render('prefs', { enabled: false });
    const original = current;
    expect(renders).toHaveLength(1);
    act(() => {
      writeProfileStorage('prefs', raw);
    });
    expect(current).toBe(original);
    expect(renders).toHaveLength(1);
  });

  it('refreshes the same key when profile data is replaced', () => {
    render('prefs', { enabled: false });
    act(() => {
      writeProfileStorage('prefs', '{"enabled":true}');
    });
    expect(current).toEqual({ enabled: true });
    act(() => {
      writeProfileStorage('prefs', null);
    });
    expect(current).toEqual({ enabled: false });
  });
});

it('receives native storage changes and removals without echoing writes', () => {
  render('prefs', { enabled: false });
  const raw = '{"enabled":true}';
  localStorage.setItem('prefs', raw);
  const write = vi.spyOn(Storage.prototype, 'setItem');
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'prefs', oldValue: null, newValue: raw, storageArea: localStorage }));
  });
  expect(current).toEqual({ enabled: true });
  localStorage.removeItem('prefs');
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'prefs', oldValue: raw, newValue: null, storageArea: localStorage }));
  });
  expect(current).toEqual({ enabled: false });
  expect(write).not.toHaveBeenCalled();
  write.mockRestore();
});
